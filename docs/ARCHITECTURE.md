# CC Manager Architecture

## Overview

CC Manager is a thin API layer on top of the Claude Code SDK. It provides run lifecycle management, message persistence, and session tracking while staying minimal and avoiding unnecessary abstractions.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│              (curl, frontend apps, other services)               │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CC Manager                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Hono API Layer                         │   │
│  │   /api/runs/*  (start, resume, fork, cancel, get)        │   │
│  │   /api/sessions/* (list, get, messages, runs, forks)     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Core Layer                            │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │   │ RunManager  │  │  Executor   │  │ StreamRecorder  │  │   │
│  │   │ (orchestrate)│  │ (SDK calls) │  │ (DB batching)   │  │   │
│  │   └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Database Layer                          │   │
│  │              Drizzle ORM + bun:sqlite                     │   │
│  │         ccr_runs  │  ccr_run_messages                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code SDK                               │
│                       query()                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Host Filesystem                               │
│               (cwd paths, git, files, etc.)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Executor (`src/core/executor.ts`)

Handles direct SDK interaction using the **streaming input pattern**.

**Key Pattern: Promise-based Generator Blocking**

```typescript
function execute(params: ExecuteParams): ReadableStream<SDKMessage> {
  // Promise that resolves when we receive the result
  let done: () => void;
  const receivedResult = new Promise<void>(resolve => {
    done = resolve;
  });

  // SDK stream with AsyncGenerator input
  const sdkStream = query({
    prompt: (async function* () {
      yield sdkUserMessage;
      await receivedResult;  // Block until AI turn completes
    })(),
    options: sdkOptions,
  });

  // Convert to pull-based ReadableStream
  return new ReadableStream<SDKMessage>({
    async pull(controller) {
      const { value, done: isDone } = await sdkStream.next();
      if (value?.type === 'result') done();  // Unblock generator
      if (isDone) controller.close();
      else if (value) controller.enqueue(value);
    },
  });
}
```

**Why this pattern?**
- The SDK's `query()` accepts an AsyncGenerator for streaming multi-turn input
- We only send one user message per run (single-turn semantics)
- The Promise blocks the generator until we receive the result
- This prevents premature generator completion

### 2. Run Manager (`src/core/run-manager.ts`)

Orchestrates run lifecycle and uses the **stream.tee() pattern** for dual processing.

**Key Pattern: Stream Tee**

```typescript
async function processStream(runId, stream, activeRun, log) {
  // Split stream: one branch for recording, one for processing
  const [recordBranch, processBranch] = stream.tee();

  // Fire-and-forget DB recording
  recordBranch.pipeTo(StreamRecorder.createSink(runId)).catch(err => {
    log.error('Recording error', { error: err.message });
  });

  // Process for session ID and result extraction
  const reader = processBranch.getReader();
  while (true) {
    const { value: message, done } = await reader.read();
    if (done) break;

    if (message.type === 'system' && message.subtype === 'init') {
      capturedSessionId = message.session_id;
    }
    if (message.type === 'result') {
      resultMessage = message;
    }
  }

  return { sessionId, resultMessage };
}
```

**Why this pattern?**
- Decouples recording from processing
- Recording errors don't block the run
- Each branch processes at its own pace
- Battle-tested in main agents project

### 3. Stream Recorder (`src/core/stream-recorder.ts`)

Batched WritableStream sink for efficient DB writes.

**Key Pattern: Batched Writes**

```typescript
export function createSink(runId: string, options = {}): WritableStream<SDKMessage> {
  const { batchSize = 50, flushIntervalMs = 1000 } = options;
  let batch: NewRunMessage[] = [];
  let flushTimer: Timer | null = null;

  const flush = async () => {
    if (batch.length === 0) return;
    const toInsert = batch;
    batch = [];
    await db.insert(runMessageTable).values(toInsert);
  };

  return new WritableStream<SDKMessage>({
    async write(message) {
      batch.push({ runId, index: index++, messageType: message.type, ... });
      if (batch.length >= batchSize) await flush();
      else scheduleFlush();
    },
    async close() { await flush(); },
  });
}
```

**Why this pattern?**
- Reduces DB round trips (50 messages per insert vs 1)
- Time-based flush ensures data isn't stuck in memory
- Handles abort gracefully (still flushes pending)

## Data Flow

### Starting a Fresh Run

```
1. Client POST /api/runs/start { cwd, prompt }
2. RunManager.start()
   ├─ Generate runId
   ├─ Create DB record (status: running)
   ├─ Track in activeRuns Map
   └─ Call Executor.executeFresh()
3. Executor creates ReadableStream
   ├─ Build SDKUserMessage with content blocks
   ├─ Call SDK query() with AsyncGenerator
   └─ Return pull-based ReadableStream
4. RunManager.processStream()
   ├─ stream.tee() → [recordBranch, processBranch]
   ├─ recordBranch.pipeTo(StreamRecorder.createSink())
   └─ Read processBranch for sessionId, result
5. Update DB with final status, sessionId, result
6. Return RunResult to client
```

### Resume vs Fork

| Aspect | Resume | Fork |
|--------|--------|------|
| Session ID | Same as parent | New (SDK generates) |
| History | Continues from parent | Branches from parent |
| `parentSessionId` | Set in DB | Set in DB |
| SDK option | `resume: sessionId` | `resume: sessionId, forkSession: true` |

**Note:** We always use `forkSession: true` for immutable history support.

## Database Design

### Why SQLite?

- Zero configuration
- File-based (easy backup/restore)
- Sufficient for single-instance deployment
- Good read performance for message queries

### Tables

```sql
-- Runs table: one record per query() invocation
CREATE TABLE ccr_runs (
  id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_session_id TEXT,
  mode TEXT NOT NULL,        -- fresh | resume | fork
  status TEXT NOT NULL,      -- running | completed | error | cancelled
  prompt TEXT NOT NULL,
  result_type TEXT,
  result_json TEXT,
  duration_ms INTEGER,
  created_at TEXT
);

-- Messages table: raw SDKMessage storage
CREATE TABLE ccr_run_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  index INTEGER NOT NULL,    -- Order within run
  message_type TEXT NOT NULL,
  message_json TEXT NOT NULL,
  created_at TEXT
);
```

### Sessions are Derived

Sessions are not stored explicitly. They're derived from runs by grouping on `session_id`:

```typescript
async function getSessions(): Promise<SessionSummary[]> {
  const runs = await db.select().from(runTable);
  const sessionMap = new Map<string, SessionSummary>();

  for (const run of runs) {
    // Group by sessionId, track runCount, first/last timestamps
  }

  return Array.from(sessionMap.values());
}
```

## Design Principles

### 1. Stay Thin

- Use SDK types directly (`SDKMessage`, not custom wrappers)
- No message parsing or transformation
- Store as JSON, return as JSON

### 2. Reuse Battle-Tested Patterns

Patterns adapted from main agents project:
- Promise-based generator blocking
- stream.tee() for dual processing
- Batched WritableStream sinks
- Singleton state utility

### 3. No Docker

Claude Code operates on the host filesystem. Containerization would require:
- Volume mounting entire filesystem
- Path translation (breaks tool outputs)
- Complex security configuration

Run as native process instead.

### 4. Immutable History

All runs use `forkSession: true`:
- Enables branching at any point
- Sessions become tree structures
- No destructive operations on history

## Future Considerations

### Real-Time Streaming (Not Implemented)

Current API blocks until run completion. For real-time updates:

```
Option A: WebSocket
- Client connects via WS
- Server streams SDKMessages as they arrive
- Client receives live updates

Option B: Server-Sent Events (SSE)
- Simpler than WebSocket
- HTTP-based, works through proxies
- One-way stream (server → client)
```

### Active Runs Endpoint (Not Implemented)

```
GET /api/runs/active
- Returns currently running jobs from activeRuns Map
- Useful for dashboards
```

### Horizontal Scaling

Current design is single-instance. For scaling:
- Replace SQLite with PostgreSQL
- Use Redis for activeRuns state
- Add run affinity (runs stay on same instance)
