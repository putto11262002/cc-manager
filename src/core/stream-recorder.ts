/**
 * StreamRecorder - Records SDK message streams to database.
 *
 * Adapted from the main agents project's battle-tested implementation.
 * Uses WritableStream sinks with batched DB writes for performance.
 *
 * ## Usage
 *
 * ```typescript
 * // Tee the stream for recording
 * const [recordBranch, processBranch] = stream.tee();
 *
 * // Record to DB (fire and forget)
 * recordBranch.pipeTo(StreamRecorder.createSink(runId));
 *
 * // Process the other branch
 * for await (const message of processBranch) {
 *   // handle message
 * }
 * ```
 *
 * @module
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { db } from '../db';
import { runMessageTable, runTable, type NewRunMessage } from '../db/schema';
import { eq, gte, and, asc } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a recorder sink.
 */
export interface RecorderOptions {
  /**
   * Batch size for DB inserts.
   * Messages are batched to reduce DB round trips.
   * @default 50
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds.
   * Even if batch size isn't reached, flush after this interval.
   * @default 1000
   */
  flushIntervalMs?: number;
}

/**
 * Options for querying recorded messages.
 */
export interface QueryOptions {
  /** Maximum number of records to return */
  limit?: number;
  /** Number of records to skip */
  offset?: number;
  /** Start from this index (inclusive) */
  fromIndex?: number;
}

// ============================================================================
// Message Recorder Sink
// ============================================================================

/**
 * Create a WritableStream sink that records SDK messages to the database.
 *
 * This is the battle-tested pattern from the main agents project.
 * Uses batching to reduce DB round trips.
 *
 * @param runId - The run ID to associate messages with
 * @param options - Recorder options
 * @returns WritableStream that writes to DB
 */
export function createSink(
  runId: string,
  options: RecorderOptions = {},
): WritableStream<SDKMessage> {
  const { batchSize = 50, flushIntervalMs = 1000 } = options;

  let index = 0;
  let batch: NewRunMessage[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (batch.length === 0) return;

    const toInsert = batch;
    batch = [];

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    await db.insert(runMessageTable).values(toInsert);
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flush().catch(err => {
        console.error(`[StreamRecorder] Flush error:`, err);
      });
    }, flushIntervalMs);
  };

  return new WritableStream<SDKMessage>({
    async write(message) {
      const record: NewRunMessage = {
        runId,
        index: index++,
        messageType: message.type,
        messageJson: JSON.stringify(message),
        createdAt: new Date().toISOString(),
      };

      batch.push(record);

      if (batch.length >= batchSize) {
        await flush();
      } else {
        scheduleFlush();
      }
    },

    async close() {
      await flush();
    },

    async abort(reason) {
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      // Still try to flush what we have
      await flush();
      console.error(`[StreamRecorder] Sink aborted:`, reason);
    },
  });
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get messages for a run from the database.
 *
 * @param runId - The run ID
 * @param options - Query options
 * @returns Array of SDK messages
 */
export async function getMessages(
  runId: string,
  options: QueryOptions = {},
): Promise<SDKMessage[]> {
  const { limit, offset = 0, fromIndex = 0 } = options;

  let query = db
    .select()
    .from(runMessageTable)
    .where(and(eq(runMessageTable.runId, runId), gte(runMessageTable.index, fromIndex)))
    .orderBy(asc(runMessageTable.index))
    .offset(offset);

  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  const results = await query;

  return results.map(row => JSON.parse(row.messageJson) as SDKMessage);
}

/**
 * Get the count of messages for a run.
 *
 * @param runId - The run ID
 * @returns Number of messages
 */
export async function getMessageCount(runId: string): Promise<number> {
  const result = await db
    .select()
    .from(runMessageTable)
    .where(eq(runMessageTable.runId, runId));

  return result.length;
}

// ============================================================================
// Session Query Functions
// ============================================================================

/**
 * Session summary (derived from runs)
 */
export interface SessionSummary {
  sessionId: string;
  cwd: string;
  runCount: number;
  firstRunAt: string;
  lastRunAt: string;
}

/**
 * Get all sessions (derived from runs).
 */
export async function getSessions(): Promise<SessionSummary[]> {
  const runs = await db.select().from(runTable).orderBy(asc(runTable.createdAt));

  // Group by sessionId
  const sessionMap = new Map<string, SessionSummary>();

  for (const run of runs) {
    const existing = sessionMap.get(run.sessionId);
    if (existing) {
      existing.runCount++;
      existing.lastRunAt = run.createdAt || existing.lastRunAt;
    } else {
      sessionMap.set(run.sessionId, {
        sessionId: run.sessionId,
        cwd: run.cwd,
        runCount: 1,
        firstRunAt: run.createdAt || '',
        lastRunAt: run.createdAt || '',
      });
    }
  }

  return Array.from(sessionMap.values());
}

/**
 * Get a single session by ID.
 */
export async function getSession(sessionId: string): Promise<SessionSummary | null> {
  const runs = await db
    .select()
    .from(runTable)
    .where(eq(runTable.sessionId, sessionId))
    .orderBy(asc(runTable.createdAt));

  if (runs.length === 0) return null;

  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];

  return {
    sessionId,
    cwd: firstRun?.cwd || '',
    runCount: runs.length,
    firstRunAt: firstRun?.createdAt || '',
    lastRunAt: lastRun?.createdAt || '',
  };
}

/**
 * Get all messages for a session (across all runs).
 */
export async function getSessionMessages(sessionId: string): Promise<SDKMessage[]> {
  // Get all runs for this session
  const runs = await db
    .select()
    .from(runTable)
    .where(eq(runTable.sessionId, sessionId))
    .orderBy(asc(runTable.createdAt));

  // Get messages for all runs
  const allMessages: SDKMessage[] = [];
  for (const run of runs) {
    const messages = await getMessages(run.id);
    allMessages.push(...messages);
  }

  return allMessages;
}

/**
 * Get all runs for a session.
 */
export async function getSessionRuns(sessionId: string) {
  return db
    .select()
    .from(runTable)
    .where(eq(runTable.sessionId, sessionId))
    .orderBy(asc(runTable.createdAt));
}

/**
 * Get forked sessions (sessions that have this session as parent).
 */
export async function getForkedSessions(sessionId: string): Promise<SessionSummary[]> {
  // Find runs that have this session as parent
  const forkRuns = await db
    .select()
    .from(runTable)
    .where(eq(runTable.parentSessionId, sessionId));

  // Get unique forked session IDs
  const forkedSessionIds = new Set(forkRuns.map(r => r.sessionId));

  // Get summaries for each forked session
  const summaries: SessionSummary[] = [];
  for (const forkedSessionId of forkedSessionIds) {
    const summary = await getSession(forkedSessionId);
    if (summary) {
      summaries.push(summary);
    }
  }

  return summaries;
}

// ============================================================================
// Namespace Export
// ============================================================================

/**
 * StreamRecorder namespace for recording and querying run streams.
 */
export const StreamRecorder = {
  createSink,
  getMessages,
  getMessageCount,
  getSessions,
  getSession,
  getSessionMessages,
  getSessionRuns,
  getForkedSessions,
} as const;
