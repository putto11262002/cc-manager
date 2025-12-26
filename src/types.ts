/**
 * Types for the cc-run-service.
 *
 * These types define the core data structures for managing runs.
 */

import type { SDKMessage, Options } from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Run Types
// ============================================================================

/**
 * Run mode - how the run was initiated
 */
export type RunMode = 'fresh' | 'resume' | 'fork';

/**
 * Run status
 */
export type RunStatus = 'running' | 'completed' | 'error' | 'cancelled';

// ============================================================================
// Image Support
// ============================================================================

/**
 * Image attachment for prompts
 */
export interface ImageAttachment {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string; // base64 encoded
}

// ============================================================================
// Start/Resume/Fork Parameters
// ============================================================================

/**
 * Parameters for starting a fresh run
 */
export interface StartParams {
  /** Working directory for the run */
  cwd: string;
  /** User prompt */
  prompt: string;
  /** Optional image attachments */
  images?: ImageAttachment[];
  /** SDK options */
  options?: Partial<Options>;
  /** Optional webhook URL for lifecycle notifications */
  webhookUrl?: string;
}

/**
 * Parameters for resuming a session
 */
export interface ResumeParams {
  /** Session ID to resume from */
  sessionId: string;
  /** User prompt */
  prompt: string;
  /** Optional image attachments */
  images?: ImageAttachment[];
  /** SDK options */
  options?: Partial<Options>;
  /** Optional webhook URL for lifecycle notifications */
  webhookUrl?: string;
}

/**
 * Parameters for forking a session
 */
export interface ForkParams {
  /** Session ID to fork from */
  sessionId: string;
  /** User prompt */
  prompt: string;
  /** Optional image attachments */
  images?: ImageAttachment[];
  /** SDK options */
  options?: Partial<Options>;
  /** Optional webhook URL for lifecycle notifications */
  webhookUrl?: string;
}

// ============================================================================
// Active Run
// ============================================================================

/**
 * An active (in-progress) run
 */
export interface ActiveRun {
  /** Run ID */
  runId: string;
  /** Session ID */
  sessionId: string;
  /** Run mode */
  mode: RunMode;
  /** Current status */
  status: RunStatus;
  /** Start time */
  startedAt: string;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** Optional webhook URL for lifecycle notifications */
  webhookUrl?: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from a completed run
 */
export interface RunResult {
  /** Run ID */
  runId: string;
  /** Session ID */
  sessionId: string;
  /** Parent session ID (if forked) */
  parentSessionId: string | null;
  /** Run mode */
  mode: RunMode;
  /** Status */
  status: RunStatus;
  /** Duration in milliseconds */
  durationMs: number;
  /** The result message from SDK (if completed successfully) */
  result?: SDKMessage;
  /** Error message (if error status) */
  error?: string;
}
