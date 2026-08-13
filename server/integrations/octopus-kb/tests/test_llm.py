from octopus_kb_compound.llm import ChatClient, ChatRequest, LLMAuthError, LLMInvalidOutputError
import pytest


def _fake_transport(status, body):
    def _call(method, url, headers, json_body, timeout):
        return status, body

    return _call


def test_chat_success_returns_content(monkeypatch):
    client = ChatClient(
        base_url="http://x/v1",
        api_key=None,
        default_model="m",
        transport=_fake_transport(
            200,
            {
                "choices": [{"message": {"content": "hi"}, "finish_reason": "stop"}],
                "model": "m",
                "usage": {"prompt_tokens": 3, "completion_tokens": 1},
            },
        ),
    )
    resp = client.chat(ChatRequest(messages=[{"role": "user", "content": "hi"}]))
    assert resp.content == "hi"
    assert resp.input_tokens == 3
    assert resp.finish_reason == "stop"


def test_chat_retries_on_5xx_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def transport(method, url, headers, json_body, timeout):
        calls["n"] += 1
        if calls["n"] == 1:
            return 503, {"error": "overloaded"}
        return 200, {"choices": [{"message": {"content": "ok"}}], "model": "m", "usage": {}}

    import octopus_kb_compound.llm as llm_mod

    monkeypatch.setattr(llm_mod, "_sleep", lambda s: None)

    client = ChatClient(
        base_url="http://x/v1",
        api_key=None,
        default_model="m",
        max_retries=2,
        transport=transport,
    )
    resp = client.chat(ChatRequest(messages=[{"role": "user", "content": "hi"}]))
    assert resp.content == "ok"
    assert calls["n"] == 2


def test_chat_raises_auth_error_on_401():
    client = ChatClient(
        base_url="http://x/v1",
        api_key="bad",
        default_model="m",
        transport=_fake_transport(401, {"error": "unauthorized"}),
    )
    with pytest.raises(LLMAuthError):
        client.chat(ChatRequest(messages=[{"role": "user", "content": "hi"}]))


def test_chat_invalid_output_when_json_object_requested_but_content_not_json():
    client = ChatClient(
        base_url="http://x/v1",
        api_key=None,
        default_model="m",
        transport=_fake_transport(
            200,
            {
                "choices": [{"message": {"content": "not json"}}],
                "model": "m",
                "usage": {},
            },
        ),
    )
    with pytest.raises(LLMInvalidOutputError):
        client.chat(ChatRequest(messages=[{"role": "user", "content": "hi"}], json_object=True))


def test_chat_sends_openai_compatible_body(monkeypatch):
    captured = {}

    def transport(method, url, headers, json_body, timeout):
        captured.update({"url": url, "body": json_body, "headers": headers})
        return 200, {"choices": [{"message": {"content": '{"ok": true}'}}], "model": "m", "usage": {}}

    client = ChatClient(base_url="http://x/v1", api_key="k", default_model="m", transport=transport)
    client.chat(
        ChatRequest(
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.2,
            max_tokens=500,
            json_object=True,
        )
    )
    assert captured["url"].endswith("/chat/completions")
    assert captured["body"]["model"] == "m"
    assert captured["body"]["temperature"] == 0.2
    assert captured["body"]["max_tokens"] == 500
    assert captured["body"]["response_format"] == {"type": "json_object"}
    assert captured["headers"]["Authorization"] == "Bearer k"
