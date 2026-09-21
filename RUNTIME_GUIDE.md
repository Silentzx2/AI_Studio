# Runtime Guide

## Setup

```bash
./scripts/setup.sh
```

The setup script validates and installs:
- System dependencies (CUDA toolkit, system libs)
- Python 3.12 + uv + PyTorch
- Backend Python dependencies
- Node.js 20 + Bun
- Optional: Blender, Redis

## Start

```bash
./scripts/start.sh
```

Starts:
- Backend FastAPI (single-worker mode)
- Next.js frontend

Access points:
| Service | Address | Port |
|---|---|---|
| Frontend | `http://localhost:3000` | 3000 |
| Backend API | `http://localhost:8000` | 8000 |
| API Docs | `http://localhost:8000/docs` | 8000 |
| Health Check | `http://localhost:8000/health` | 8000 |

## Stop

```bash
./scripts/stop.sh
```

Stops frontend and backend processes cleanly.

## Restart

```bash
./scripts/restart.sh
```

Calls stop then start.

## Status

```bash
./manager.sh status
```

Reports:
- Frontend state
- Backend state
- Backend health
- API URL
- Frontend URL
- Active process IDs
- Recent errors

## Health

```bash
./manager.sh health
```

Checks backend health via `GET /health`.

## Logs

```bash
./manager.sh logs
```

Shows recent log entries from `logs/app.log`.

## Troubleshooting

### Backend won't start
- Check `./manager.sh status` for process state
- Check `logs/app.log` for startup errors
- Verify Python environment: `cd backend && source .venv/bin/activate`

### Frontend won't connect
- Verify backend is running: `curl http://localhost:8000/health`
- Check Next.js proxy route at `/api/v1/[...path]/route.ts`
- Verify `BACKEND_URL` environment variable

### Port already in use
```bash
bash scripts/stop.sh
lsof -ti :3000 | xargs -r kill -9
lsof -ti :8000 | xargs -r kill -9
```

### CUDA OOM
- The VRAM-aware scheduler prevents multi-provider GPU OOM
- For low-VRAM GPUs (≤8GB), use lighter models
- Set `LOW_VRAM=true` in `.env`