# CC Manager

A thin API service on top of the Claude Code SDK that provides run lifecycle management, message persistence, and session tracking with immutable history.

## Overview

CC Manager wraps the Claude Code SDK to provide:

- **Run Management** - Start, resume, fork, and cancel Claude Code runs
- **Message Persistence** - All SDK messages are recorded to SQLite
- **Session Tracking** - Sessions group related runs with immutable history
- **REST API** - Simple HTTP API for integration

## Requirements

- [Bun](https://bun.sh) v1.0+
- Claude Code SDK authentication (OAuth or API key)

## Quick Start

```bash
# Install dependencies
bun install

# Run database migrations
bun run migrate

# Start the server (development with hot reload)
bun run dev

# Or start in production mode
bun run start
```

The server runs on `http://localhost:3000` by default.

## API Endpoints

### Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/runs/start` | Start a fresh run (new session) |
| `POST` | `/api/runs/resume` | Resume an existing session |
| `POST` | `/api/runs/fork` | Fork a session (branch conversation) |
| `DELETE` | `/api/runs/:runId` | Cancel a running run |
| `GET` | `/api/runs/:runId` | Get run details |
| `GET` | `/api/runs/:runId/messages` | Get all messages for a run |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/:id` | Get session details |
| `GET` | `/api/sessions/:id/messages` | Get all messages across session runs |
| `GET` | `/api/sessions/:id/runs` | Get all runs for a session |
| `GET` | `/api/sessions/:id/forks` | Get forked sessions |

### Health

| Method | Endpoint | Description |
|--------|---------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/` | API info |

## Example Usage

### Start a Fresh Run

```bash
curl -X POST http://localhost:3000/api/runs/start \
  -H "Content-Type: application/json" \
  -d '{
    "cwd": "/path/to/your/project",
    "prompt": "What files are in this directory?"
  }'
```

### Resume a Session

```bash
curl -X POST http://localhost:3000/api/runs/resume \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "prompt": "Now create a README file"
  }'
```

### Fork a Session

```bash
curl -X POST http://localhost:3000/api/runs/fork \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "prompt": "Try a different approach instead"
  }'
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_PATH` | `./db.sqlite` | SQLite database path |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## Database Schema

### `ccr_runs` Table

Stores individual query() invocations:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Unique run identifier |
| `cwd` | text | Working directory |
| `sessionId` | text | SDK session_id (grouping key) |
| `parentSessionId` | text | Source session_id if forked |
| `mode` | text | 'fresh' \| 'resume' \| 'fork' |
| `status` | text | running \| completed \| error \| cancelled |
| `prompt` | text | User prompt |
| `resultType` | text | SDK result subtype |
| `resultJson` | text | Full SDKResultMessage as JSON |
| `durationMs` | integer | Duration in milliseconds |
| `createdAt` | text | Timestamp |

### `ccr_run_messages` Table

Stores raw SDKMessage data:

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer (PK) | Auto-increment ID |
| `runId` | text | Reference to ccr_runs.id |
| `index` | integer | Message order within run |
| `messageType` | text | SDKMessage.type |
| `messageJson` | text | Full SDKMessage as JSON |
| `createdAt` | text | Timestamp |

## Project Structure

```
src/
├── index.ts              # Entry point, Hono server setup
├── types.ts              # Type definitions
├── errors.ts             # Error classes
├── logger.ts             # Logging utility
├── api/
│   ├── index.ts          # API router
│   ├── runs/             # Runs endpoints
│   └── sessions/         # Sessions endpoints
├── core/
│   ├── executor.ts       # SDK execution (streaming input pattern)
│   ├── run-manager.ts    # Run orchestration (stream.tee pattern)
│   └── stream-recorder.ts # Batched DB writes
├── db/
│   ├── index.ts          # Database connection (bun:sqlite + Drizzle)
│   └── schema.ts         # Drizzle schema
└── utils/
    └── state.ts          # Singleton state utility
```

## Important Notes

- **No Docker** - This service must run as a native process because Claude Code operates on the host filesystem
- **OAuth Support** - Works with Claude Code OAuth authentication (no API key required if already logged in)
- **Immutable History** - All runs use `forkSession: true` for branching support
- **SDK Types Only** - Uses `SDKMessage` directly from the SDK, no custom abstractions

## Scripts

```bash
bun run dev       # Development with hot reload
bun run start     # Production mode
bun run migrate   # Run database migrations
bun run test:core # Test core modules
```

## License

Private - Internal use only
