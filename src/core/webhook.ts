/**
 * Webhook dispatcher for run lifecycle notifications.
 *
 * Sends HTTP POST notifications to client-provided webhook URLs when run events occur.
 * All webhook calls are fire-and-forget with a timeout, and failures don't affect run execution.
 */

import { logger } from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types for webhook notifications
 */
export type WebhookEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.error';

/**
 * Base webhook event structure
 */
export interface WebhookEvent {
  /** Event type */
  event: WebhookEventType;
  /** Run identifier */
  runId: string;
  /** Session identifier (may be empty for run.started) */
  sessionId: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event-specific payload */
  payload: WebhookPayload;
}

/**
 * Payload for run.started event
 */
export interface RunStartedPayload {
  mode: 'fresh' | 'resume' | 'fork';
  cwd: string;
}

/**
 * Payload for run.completed event
 */
export interface RunCompletedPayload {
  subtype: 'success';
  durationMs: number;
  totalCostUsd?: number;
  result?: string;
}

/**
 * Payload for run.failed event
 */
export interface RunFailedPayload {
  subtype: string;
  durationMs: number;
  error: string;
}

/**
 * Payload for run.error event
 */
export interface RunErrorPayload {
  code: string;
  message: string;
}

/**
 * Union type for all webhook payloads
 */
export type WebhookPayload =
  | RunStartedPayload
  | RunCompletedPayload
  | RunFailedPayload
  | RunErrorPayload;

// ============================================================================
// Constants
// ============================================================================

/**
 * Timeout for webhook HTTP calls (10 seconds)
 */
const WEBHOOK_TIMEOUT_MS = 10_000;

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Dispatch a webhook notification to the specified URL.
 *
 * This function is fire-and-forget: it runs asynchronously and doesn't block the caller.
 * Successes and failures are logged but don't affect run execution.
 *
 * @param url - The webhook URL to POST to
 * @param event - The webhook event to send
 */
export function dispatchWebhook(url: string, event: WebhookEvent): void {
  // Fire and forget - don't await
  sendWebhook(url, event).catch(err => {
    // Already logged in sendWebhook, but catch to prevent unhandled rejection
  });
}

/**
 * Internal async function to send the webhook
 */
async function sendWebhook(url: string, event: WebhookEvent): Promise<void> {
  const log = logger.child({ webhookUrl: url, event: event.event, runId: event.runId });

  log.info('Dispatching webhook', { sessionId: event.sessionId });

  try {
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), WEBHOOK_TIMEOUT_MS);

    // Make HTTP POST request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CC-Manager/1.0',
      },
      body: JSON.stringify(event),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Log response status
    if (response.ok) {
      log.info('Webhook delivered successfully', { status: response.status });
    } else {
      const responseText = await response.text().catch(() => '(could not read response)');
      log.warn('Webhook returned non-2xx status', {
        status: response.status,
        statusText: response.statusText,
        response: responseText.substring(0, 500),
      });
    }
  } catch (error) {
    // Handle timeout and other errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        log.error('Webhook timeout', { timeoutMs: WEBHOOK_TIMEOUT_MS });
      } else {
        log.error('Webhook failed', { error: error.message });
      }
    } else {
      log.error('Webhook failed', { error: String(error) });
    }
  }
}
