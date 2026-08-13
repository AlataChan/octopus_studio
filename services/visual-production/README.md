# Visual Production Sidecar

`services/visual-production` is the optional Python sidecar used by Alata Studio's visual production page. It routes image/video generation to Volcengine Ark, Alibaba DashScope, and Agnes, and also provides local post-processing for video stitching and Chinese title cards.

The sidecar follows the same deployment posture as `services/paddleocr-service`: Studio talks to it over localhost HTTP, it owns its own Python virtualenv, and it is not bundled into the Electron desktop package by default. If the service is not running, the Studio UI degrades gracefully instead of blocking the rest of the app.

## Setup

Run setup once after cloning the repo or after dependencies change:

```bash
cd services/visual-production
chmod +x setup.sh start.sh
./setup.sh
```

`setup.sh` creates `venv/`, upgrades `pip`, and installs this Python package in editable mode.

## Start

Start the sidecar directly:

```bash
cd services/visual-production
./start.sh --auto
```

Or start it through the root workspace script:

```bash
yarn dev:visual
```

For the full local stack including this service:

```bash
yarn dev:all:full
```

The default bind address is `127.0.0.1` and the default port is `8868`. Override the port with either a positional argument or `VISUAL_PRODUCTION_PORT`:

```bash
./start.sh --auto 8870
VISUAL_PRODUCTION_PORT=8870 ./start.sh --auto
```

## Readiness

Studio uses `GET /api/config` as both the configuration fetch and health/readiness probe:

```bash
curl http://127.0.0.1:8868/api/config
```

There is no separate `/health` endpoint for this sidecar.

## Provider Keys

Provider keys can be supplied to the Python process through environment variables:

| Provider | Environment variable | Browser override header |
| --- | --- | --- |
| Volcengine Ark | `ARK_API_KEY` | `X-Ark-Key` |
| Alibaba DashScope | `DASHSCOPE_API_KEY` | `X-Dashscope-Key` |
| Agnes | `AGNES_API_KEY` | `X-Agnes-Key` |

The Studio frontend can override keys per browser session by writing these sessionStorage values before submitting a request:

| sessionStorage key | Forwarded header |
| --- | --- |
| `visual_ark_key` | `X-Ark-Key` |
| `visual_dashscope_key` | `X-Dashscope-Key` |
| `visual_agnes_key` | `X-Agnes-Key` |

The Node server only forwards browser-supplied `X-*-Key` headers to this sidecar. It does not read or persist Studio server-side provider secrets for visual production.

## Studio Integration

- Frontend page: `/visual`
- Required Studio role: manager or admin
- Node proxy prefix: `/api/visual/*`
- Sidecar upstream endpoints: `/api/config`, `/api/estimate`, `/api/jobs`, `/api/jobs/{id}`, `/api/results/{path}`, `/api/stitch`, `/api/compose`

When the sidecar is unavailable, `/api/visual/*` returns a service-unavailable response and the `/visual` page shows "视觉服务未启动" with submit controls disabled. This matches the optional sidecar behavior used by OCR: Electron and core Studio remain usable when the Python service is absent.

## Agent Tool

The AIbitat agent tool is `visual-generate`. It is a Business-level optional tool: it is not enabled by default and is not part of the always-on output tools.

Enable it from Studio's Agent skill settings by turning on "Visual Generation", or add `"visual-generate"` to the `default_agent_skills` system setting. Before using it, start this sidecar and provide provider keys through the sidecar process environment.

Example chat request:

```text
@agent Generate a product poster for a minimalist smart lamp.
```

The tool estimates cost before submitting. If the estimate cannot be read, or if the estimate exceeds `budget.confirm_threshold_cny`, the agent does not submit the job and asks the user to continue in `/visual`. There is no `confirm` tool parameter, because function-call arguments are controlled by the model and are not a trusted user-confirmation boundary.

If the sidecar is stopped, the tool returns a readable "visual service not started" message instead of throwing an exception through the chat.

## Common Checks

```bash
# Python sidecar tests
cd services/visual-production
source venv/bin/activate
python -m pytest -q

# Manual readiness check
curl http://127.0.0.1:8868/api/config
```
