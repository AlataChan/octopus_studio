# Alata IM Gateway

Standalone Node.js sidecar for Alata Studio IM integrations. It supports Feishu and WeCom webhook inbound delivery, plus Feishu long-connection delivery for deployments where inbound HTTP callbacks are blocked by NAT, desktop packaging, or customer self-hosted Docker environments without reverse proxy setup.

## Quickstart: Webhook Mode

Use this mode when Feishu can call a public gateway URL.

```bash
cp .env.example .env
```

Set the required Feishu webhook credentials:

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
FEISHU_DELIVERY_MODE=webhook
```

Start the gateway:

```bash
npm start
```

## Quickstart: Long-Connection Mode

Use this mode for desktop, local NAT, or customer Docker deployments that should not expose a webhook endpoint.

```bash
cp .env.example .env
```

Set the required Feishu long-connection credentials:

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_DELIVERY_MODE=longconn
```

Start the gateway:

```bash
npm start
```

## Health Check

`GET /health` returns gateway health, queue depth, configured adapters, Alata connectivity, runtime snapshot revision, and per-adapter status.

Example:

```json
{
  "status": "ok",
  "mode": "standalone",
  "adapters": ["feishu"],
  "queueDepth": 0,
  "alataConnected": true,
  "snapshotRevision": null,
  "adapterStatus": [
    {
      "provider": "feishu",
      "mode": "longconn",
      "state": "connected"
    }
  ]
}
```

## Deployment Guidance

| Scenario                       | Recommended Mode             | Notes                                                     |
| ------------------------------ | ---------------------------- | --------------------------------------------------------- |
| Customer Docker self-hosting   | Feishu long-connection first | Avoids reverse proxy and public callback setup.           |
| Desktop Electron package       | Feishu long-connection only  | Works behind NAT and local networks.                      |
| Self-hosted webhook deployment | Webhook                      | Use when a stable public HTTPS callback URL is available. |

## Current Limits

- One Feishu account per gateway process.
- Single instance deployment for Feishu long-connection mode.
- Feishu long-connection MVP only handles `im.message.receive_v1`.
