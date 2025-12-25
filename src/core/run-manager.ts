/**
 * RunManager - Orchestrates runs and tracks active runs.
 *
 * Adapted from the main agents project's battle-tested implementation.
 *
 * ## Stream Pattern (from main project run.ts)
 *
 * ```
 * executor.stream()
 *       │
 *       ▼
 *   stream.tee()
 *       │
 *   ┌───┴───┐
 *   ▼       ▼
 * Branch1  Branch2
 *   │         │
 *   ▼         ▼
 * DB Sink   Process
 * (record)  (handle)
 * ```
 *
 * @module
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { db } from '../db';
import { runTable } from '../db/schema';
import type {
  StartParams,
  ResumeParams,
  ForkParams,
  ActiveRun,
  RunMode,
  RunStatus,
  RunResult,
} from '../types';
import { executeFresh, executeResume, executeFork } from './executor';
import { StreamRecorder } from './stream-recorder';
import { eq } from 'drizzle-orm';
import {
  SessionNotFoundError,
  RunAlreadyCompletedError,
  ValidationError,
} from '../errors';
import { logger } from '../logger';

// ============================================================================
// State
// ============================================================================

/**
 * Map of active runs: runId → ActiveRun
 */
const activeRuns = new Map<string, ActiveRun>();

// ============================================================================
// Stream Processing Helper
// ============================================================================

/**
 * Process a stream, recording to DB and extracting session/result info.
 *
 * Uses the battle-tested stream.tee() pattern from main project.
 */
async function processStream(
  runId: string,
  stream: ReadableStream<SDKMessage>,
  activeRun: ActiveRun,
  log: ReturnType<typeof logger.child>,
): Promise<{ sessionId: string; resultMessage: SDKMessage | null }> {
  // Tee the stream: one for recording, one for processing
  const [recordBranch, processBranch] = stream.tee();

  // Record to DB (fire and forget)
  recordBranch.pipeTo(StreamRecorder.createSink(runId)).catch(err => {
    log.error('Recording error', { error: err.message });
  });

  // Process the stream
  let capturedSessionId = '';
  let resultMessage: SDKMessage | null = null;

  const reader = processBranch.getReader();

  try {
    while (true) {
      const { value: message, done } = await reader.read();

      if (done) break;
      if (!message) continue;

      // Capture session ID from init message
      if (message.type === 'system' && message.subtype === 'init') {
        capturedSessionId = message.session_id;
        activeRun.sessionId = capturedSessionId;

        // Update DB with session ID
        await db
          .update(runTable)
          .set({ sessionId: capturedSessionId })
          .where(eq(runTable.id, runId));
      }

      // Capture result message
      if (message.type === 'result') {
        resultMessage = message;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { sessionId: capturedSessionId, resultMessage };
}

// ============================================================================
// Start Run
// ============================================================================

/**
 * Start a fresh run (new session).
 *
 * @param params - Start parameters
 * @returns Run result
 */
export async function start(params: StartParams): Promise<RunResult> {
  // Validate input
  if (!params.prompt || params.prompt.trim().length === 0) {
    throw new ValidationError('Prompt cannot be empty', 'prompt');
  }
  if (!params.cwd || params.cwd.trim().length === 0) {
    throw new ValidationError('Working directory (cwd) is required', 'cwd');
  }

  const runId = crypto.randomUUID();
  const startTime = Date.now();
  const abortController = new AbortController();
  const log = logger.child({ runId, mode: 'fresh' });

  log.info('Starting fresh run', { cwd: params.cwd, promptLength: params.prompt.length });

  // Track as active
  const activeRun: ActiveRun = {
    runId,
    sessionId: '',
    mode: 'fresh',
    status: 'running',
    startedAt: new Date().toISOString(),
    abortController,
  };
  activeRuns.set(runId, activeRun);

  // Create DB record
  await db.insert(runTable).values({
    id: runId,
    cwd: params.cwd,
    sessionId: '',
    parentSessionId: null,
    mode: 'fresh',
    status: 'running',
    prompt: params.prompt,
    createdAt: new Date().toISOString(),
  });

  try {
    // Execute and get stream
    const stream = executeFresh(params, abortController);

    // Process stream with tee pattern
    const { sessionId, resultMessage } = await processStream(
      runId,
      stream,
      activeRun,
      log,
    );

    const durationMs = Date.now() - startTime;

    // Determine status
    const isError = resultMessage && (resultMessage as any).subtype?.startsWith('error');
    const status: RunStatus = isError ? 'error' : 'completed';

    // Update DB record
    await db
      .update(runTable)
      .set({
        status,
        resultType: resultMessage ? (resultMessage as any).subtype : undefined,
        resultJson: resultMessage ? JSON.stringify(resultMessage) : null,
        durationMs,
      })
      .where(eq(runTable.id, runId));

    // Remove from active runs
    activeRuns.delete(runId);

    log.info('Run completed', { sessionId, status, durationMs });

    return {
      runId,
      sessionId,
      parentSessionId: null,
      mode: 'fresh',
      status,
      durationMs,
      result: resultMessage || undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error('Run failed', { error: errorMessage, durationMs });

    await db
      .update(runTable)
      .set({
        status: 'error',
        resultJson: JSON.stringify({ error: errorMessage }),
        durationMs,
      })
      .where(eq(runTable.id, runId));

    activeRuns.delete(runId);

    return {
      runId,
      sessionId: activeRun.sessionId || '',
      parentSessionId: null,
      mode: 'fresh',
      status: 'error',
      durationMs,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Resume Run
// ============================================================================

/**
 * Resume a session (continue conversation).
 *
 * @param params - Resume parameters
 * @returns Run result
 */
export async function resume(params: ResumeParams): Promise<RunResult> {
  // Validate input
  if (!params.prompt || params.prompt.trim().length === 0) {
    throw new ValidationError('Prompt cannot be empty', 'prompt');
  }
  if (!params.sessionId || params.sessionId.trim().length === 0) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  // Look up the session's cwd from DB
  const sessionRuns = await db
    .select()
    .from(runTable)
    .where(eq(runTable.sessionId, params.sessionId))
    .limit(1);

  const firstRun = sessionRuns[0];
  if (!firstRun) {
    throw new SessionNotFoundError(params.sessionId);
  }

  return executeRun(params, firstRun.cwd, 'resume', params.sessionId);
}

// ============================================================================
// Fork Run
// ============================================================================

/**
 * Fork a session (branch conversation).
 *
 * @param params - Fork parameters
 * @returns Run result
 */
export async function fork(params: ForkParams): Promise<RunResult> {
  // Validate input
  if (!params.prompt || params.prompt.trim().length === 0) {
    throw new ValidationError('Prompt cannot be empty', 'prompt');
  }
  if (!params.sessionId || params.sessionId.trim().length === 0) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  // Look up the session's cwd from DB
  const sessionRuns = await db
    .select()
    .from(runTable)
    .where(eq(runTable.sessionId, params.sessionId))
    .limit(1);

  const firstRun = sessionRuns[0];
  if (!firstRun) {
    throw new SessionNotFoundError(params.sessionId);
  }

  return executeRun(params, firstRun.cwd, 'fork', params.sessionId);
}

// ============================================================================
// Internal Execute Run
// ============================================================================

/**
 * Internal helper for executing resume/fork runs.
 */
async function executeRun(
  params: ResumeParams | ForkParams,
  cwd: string,
  mode: RunMode,
  parentSessionId: string,
): Promise<RunResult> {
  const runId = crypto.randomUUID();
  const startTime = Date.now();
  const abortController = new AbortController();
  const log = logger.child({ runId, mode, parentSessionId });

  log.info('Starting run', { cwd, promptLength: params.prompt.length });

  // Track as active
  const activeRun: ActiveRun = {
    runId,
    sessionId: '',
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    abortController,
  };
  activeRuns.set(runId, activeRun);

  // Create DB record
  await db.insert(runTable).values({
    id: runId,
    cwd,
    sessionId: '',
    parentSessionId,
    mode,
    status: 'running',
    prompt: params.prompt,
    createdAt: new Date().toISOString(),
  });

  try {
    // Execute based on mode
    const stream =
      mode === 'resume'
        ? executeResume(params as ResumeParams, cwd, abortController)
        : executeFork(params as ForkParams, cwd, abortController);

    // Process stream with tee pattern
    const { sessionId, resultMessage } = await processStream(
      runId,
      stream,
      activeRun,
      log,
    );

    const durationMs = Date.now() - startTime;

    // Determine status
    const isError = resultMessage && (resultMessage as any).subtype?.startsWith('error');
    const status: RunStatus = isError ? 'error' : 'completed';

    // Update DB record
    await db
      .update(runTable)
      .set({
        status,
        resultType: resultMessage ? (resultMessage as any).subtype : undefined,
        resultJson: resultMessage ? JSON.stringify(resultMessage) : null,
        durationMs,
      })
      .where(eq(runTable.id, runId));

    // Remove from active runs
    activeRuns.delete(runId);

    log.info('Run completed', { sessionId, status, durationMs });

    return {
      runId,
      sessionId,
      parentSessionId,
      mode,
      status,
      durationMs,
      result: resultMessage || undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error('Run failed', { error: errorMessage, durationMs });

    await db
      .update(runTable)
      .set({
        status: 'error',
        resultJson: JSON.stringify({ error: errorMessage }),
        durationMs,
      })
      .where(eq(runTable.id, runId));

    activeRuns.delete(runId);

    return {
      runId,
      sessionId: activeRun.sessionId || '',
      parentSessionId,
      mode,
      status: 'error',
      durationMs,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Cancel Run
// ============================================================================

/**
 * Cancel an active run.
 *
 * @param runId - The run ID to cancel
 */
export async function cancel(runId: string): Promise<void> {
  const activeRun = activeRuns.get(runId);
  if (!activeRun) {
    throw new RunAlreadyCompletedError(runId);
  }

  logger.info('Cancelling run', { runId });

  // Abort the execution
  activeRun.abortController.abort();
  activeRun.status = 'cancelled';

  // Update DB
  await db
    .update(runTable)
    .set({ status: 'cancelled' })
    .where(eq(runTable.id, runId));

  // Remove from active runs
  activeRuns.delete(runId);
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get an active run by ID.
 */
export function getActiveRun(runId: string): ActiveRun | undefined {
  return activeRuns.get(runId);
}

/**
 * List all active runs.
 */
export function listActiveRuns(): ActiveRun[] {
  return Array.from(activeRuns.values());
}

/**
 * Get run from database by ID.
 */
export async function getRun(runId: string) {
  const results = await db
    .select()
    .from(runTable)
    .where(eq(runTable.id, runId))
    .limit(1);

  return results[0] || null;
}

/**
 * Get messages for a run.
 */
export async function getRunMessages(runId: string): Promise<SDKMessage[]> {
  return StreamRecorder.getMessages(runId);
}
