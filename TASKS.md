# CC Manager - Tasks & Implementation Notes

## Completed Phases

### Phase 1: Foundation

**Status:** Done

| Task | Notes |
|------|-------|
| Project setup | Bun + TypeScript |
| Database schema | Drizzle ORM + bun:sqlite |
| Type definitions | `src/types.ts` |
| Error handling | `src/errors.ts` - ServiceError class with status codes |
| Logging | `src/logger.ts` - Simple structured logger |

**Pattern Established:** Drizzle with bun:sqlite for zero-config SQLite.

### Phase 2: Core Execution

**Status:** Done

| Task | Notes |
|------|-------|
| Executor module | `src/core/executor.ts` |
| SDK integration | Uses `query()` from claude-agent-sdk |
| Streaming input | AsyncGenerator pattern for multi-turn support |
| ReadableStream output | Pull-based stream conversion |

**Pattern Established:** Promise-based generator blocking.

```typescript
// Block generator until result received
let done: () => void;
const receivedResult = new Promise<void>(resolve => { done = resolve; });

const sdkStream = query({
  prompt: (async function* () {
    yield sdkUserMessage;
    await receivedResult;  // <- Blocks here
  })(),
});
```

**Caveat:** The SDK's AsyncGenerator needs to stay open until the result is received. If we close it early, the SDK may behave unexpectedly.

### Phase 3: Run Manager

**Status:** Done

| Task | Notes |
|------|-------|
| Run orchestration | `src/core/run-manager.ts` |
| Active run tracking | In-memory Map (not persisted) |
| Start/Resume/Fork | All three modes implemented |
| Cancellation | AbortController support |

**Pattern Established:** stream.tee() for dual processing.

```typescript
const [recordBranch, processBranch] = stream.tee();
recordBranch.pipeTo(StreamRecorder.createSink(runId));  // Fire and forget
// Process the other branch...
```

**Caveat:** Active runs are stored in memory. On restart, running jobs are lost. The DB will show them as "running" but they're orphaned.

### Phase 4: Stream Recorder

**Status:** Done

| Task | Notes |
|------|-------|
| Batched DB writes | `src/core/stream-recorder.ts` |
| WritableStream sink | Implements WritableStream interface |
| Session queries | getSessions, getSession, etc. |

**Pattern Established:** Batched inserts with time-based flush.

```typescript
const { batchSize = 50, flushIntervalMs = 1000 } = options;
// Flush when batch is full OR after 1 second
```

**Flag:** `batchSize` and `flushIntervalMs` are configurable via options.

### Phase 5: API Routes

**Status:** Done

| Task | Notes |
|------|-------|
| Hono setup | `src/index.ts` |
| Runs endpoints | `src/api/runs/route.ts` |
| Sessions endpoints | `src/api/sessions/route.ts` |
| Validation | Zod schemas with @hono/zod-validator |
| Error handling | Uniform error responses |

**Pattern Established:** Chained Hono routes for type inference.

```typescript
const runs = new Hono()
  .post('/start', ...)
  .post('/resume', ...)
  // Chained for AppType export
```

### Phase 6: Code Reuse from Main Project

**Status:** Done

| Task | Notes |
|------|-------|
| State utility | Copied `src/utils/state.ts` |
| Executor refactor | Adapted streaming pattern from claude.ts |
| Stream recorder | Adapted batching from stream-recorder.ts |
| Run manager | Adapted tee pattern from run.ts |

**Major Decision:** Use SDK types directly, NOT the abstracted types from main project.

- Use: `SDKMessage` from SDK
- Do NOT use: `StreamMessageChunks`, `BaseMessagePart`, `createClaudeCodeAgentStreamParser`

**Rationale:** Stay thin. The main project's abstractions add complexity we don't need for a simple run service.

---

## Not Implemented

### Real-Time Streaming

**Why not done:** Current REST API blocks until run completion. For long Claude Code sessions, this is impractical.

**Options:**
1. WebSocket - Full duplex, client can cancel
2. SSE - Simpler, HTTP-based, one-way

**Recommendation:** SSE for simplicity. Add `GET /api/runs/:id/stream` endpoint.

### Active Runs Endpoint

**Why not done:** Low priority.

**Implementation:**
```typescript
app.get('/api/runs/active', (c) => {
  return c.json(runManager.listActiveRuns());
});
```

### Docker

**Why not done:** Fundamentally incompatible.

Claude Code operates on host filesystem. Docker would require:
- Volume mounting `/Users:/Users` (security nightmare)
- Path translation (breaks everything)

**Decision:** Run as native process only.

---

## Known Issues & Caveats

### 1. Orphaned Runs on Restart

If the service restarts while runs are in progress:
- In-memory `activeRuns` Map is lost
- DB shows runs as "running" but they're dead
- No automatic cleanup

**Mitigation:** Add startup cleanup that marks orphaned runs as "error".

### 2. Session ID Timing

Session ID is captured from the SDK's `init` message. If recording starts before init is received, the DB record has empty sessionId briefly.

**Current handling:** Update DB when init is received.

### 3. No Pagination

Session and message queries return all results. For large histories:

```typescript
// Current
const messages = await getSessionMessages(sessionId);  // Could be 10000+

// Should add
const messages = await getSessionMessages(sessionId, { limit: 100, offset: 0 });
```

### 4. Single Instance Only

No support for horizontal scaling:
- SQLite is file-based
- activeRuns is in-memory
- No distributed state

---

## Configuration Flags

| Flag | Location | Default | Description |
|------|----------|---------|-------------|
| `PORT` | env | `3000` | Server port |
| `DATABASE_PATH` | env | `./db.sqlite` | SQLite file path |
| `LOG_LEVEL` | env | `info` | Logging verbosity |
| `batchSize` | RecorderOptions | `50` | Messages per DB insert |
| `flushIntervalMs` | RecorderOptions | `1000` | Max time before flush |

---

## Implementation Timeline

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation (DB, types, errors) | Done |
| 2 | Core Execution (Executor) | Done |
| 3 | Run Manager (orchestration) | Done |
| 4 | Stream Recorder (persistence) | Done |
| 5 | API Routes (Hono) | Done |
| 6 | Code Reuse (battle-tested patterns) | Done |
| 7 | Real-Time Streaming | Not started |
| 8 | Production Hardening | Not started |

---

## Future Tasks

### High Priority

- [ ] Real-time streaming (WebSocket or SSE)
- [ ] Orphaned run cleanup on startup
- [ ] Pagination for queries

### Medium Priority

- [ ] Active runs endpoint
- [ ] Run timeout handling
- [ ] Metrics/observability

### Low Priority

- [ ] PostgreSQL support for scaling
- [ ] Redis for distributed state
- [ ] Rate limiting
