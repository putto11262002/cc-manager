/**
 * Executor - Executes a single run using the Claude Code SDK.
 *
 * Uses the streaming input pattern (AsyncGenerator) to support image attachments.
 * This is the core execution logic that calls SDK query() and yields SDKMessages.
 *
 * ## Pattern (battle-tested from main agents project)
 *
 * The SDK query() accepts an AsyncGenerator for streaming input. We use a
 * Promise-based pattern to:
 * 1. Yield the user message immediately
 * 2. Block until we receive the result message
 * 3. Return a ReadableStream for consumption
 *
 * This pattern is proven in production and handles the SDK's behavior correctly.
 */

import { query, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StartParams, ResumeParams, ForkParams } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal execution parameters (unified for all run modes)
 */
interface ExecuteParams {
  /** Working directory */
  cwd: string;
  /** User prompt */
  prompt: string;
  /** Optional image attachments */
  images?: Array<{ mediaType: string; data: string }>;
  /** SDK options */
  options?: Partial<Options>;
  /** Session ID to resume/fork from (undefined for fresh) */
  sessionId?: string;
  /** Abort controller for cancellation */
  abortController?: AbortController;
}

// ============================================================================
// Content Block Types (from SDK)
// ============================================================================

type TextBlock = {
  type: 'text';
  text: string;
};

type ImageBlock = {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
};

type ContentBlock = TextBlock | ImageBlock;

// ============================================================================
// Execute Function - Returns ReadableStream
// ============================================================================

/**
 * Execute a run using the SDK with streaming input pattern.
 *
 * This uses the battle-tested pattern from the main agents project:
 * 1. Create a Promise that resolves when we receive the result
 * 2. Yield user message in AsyncGenerator
 * 3. Block generator until result received
 * 4. Convert to ReadableStream using pull-based approach
 *
 * @param params - Execution parameters
 * @returns ReadableStream of SDKMessages
 */
function execute(params: ExecuteParams): ReadableStream<SDKMessage> {
  const { cwd, prompt, images, options, sessionId, abortController } = params;

  // Battle-tested pattern: Promise that resolves when we receive result
  // See: https://github.com/anthropics/claude-code/issues/4775#issuecomment-3141104425
  let done: () => void;
  const receivedResult = new Promise<void>(resolve => {
    done = resolve;
  });

  // Build SDK user message with content blocks
  const content: ContentBlock[] = [{ type: 'text', text: prompt }];

  if (images?.length) {
    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.data,
        },
      });
    }
  }

  // Create SDK user message
  const sdkUserMessage: SDKUserMessage = {
    type: 'user',
    message: { role: 'user', content: content as any },
    parent_tool_use_id: null,
    session_id: crypto.randomUUID(),
  };

  // SDK options - always fork for immutable history
  const sdkOptions: Options = {
    ...options,
    cwd,
    forkSession: true,
    resume: sessionId,
    abortController,
  };

  // Create the SDK stream using streaming input pattern
  const sdkStream = query({
    prompt: (async function* () {
      yield sdkUserMessage;
      // Block until AI turn completes - single message semantics
      await receivedResult;
    })(),
    options: sdkOptions,
  });

  // Convert AsyncGenerator to ReadableStream using pull-based approach
  // This is the battle-tested pattern from claude.ts
  return new ReadableStream<SDKMessage>({
    async pull(controller) {
      try {
        const { value, done: isDone } = await sdkStream.next();

        // Check if we received the result message
        if (value && value.type === 'result') {
          done(); // Resolve the promise to unblock the generator
        }

        if (isDone) {
          controller.close();
        } else if (value) {
          controller.enqueue(value);
        }
      } catch (error) {
        console.error('[Executor] Stream error:', error);
        controller.error(error);
      }
    },
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Execute a fresh run (new session).
 *
 * @param params - Start parameters
 * @param abortController - Optional abort controller
 * @returns ReadableStream of SDKMessages
 */
export function executeFresh(
  params: StartParams,
  abortController?: AbortController,
): ReadableStream<SDKMessage> {
  return execute({
    cwd: params.cwd,
    prompt: params.prompt,
    images: params.images,
    options: params.options,
    abortController,
  });
}

/**
 * Execute a resume run (continue session).
 *
 * @param params - Resume parameters
 * @param cwd - Working directory (derived from session)
 * @param abortController - Optional abort controller
 * @returns ReadableStream of SDKMessages
 */
export function executeResume(
  params: ResumeParams,
  cwd: string,
  abortController?: AbortController,
): ReadableStream<SDKMessage> {
  return execute({
    cwd,
    prompt: params.prompt,
    images: params.images,
    options: params.options,
    sessionId: params.sessionId,
    abortController,
  });
}

/**
 * Execute a fork run (branch session).
 *
 * @param params - Fork parameters
 * @param cwd - Working directory (derived from session)
 * @param abortController - Optional abort controller
 * @returns ReadableStream of SDKMessages
 */
export function executeFork(
  params: ForkParams,
  cwd: string,
  abortController?: AbortController,
): ReadableStream<SDKMessage> {
  return execute({
    cwd,
    prompt: params.prompt,
    images: params.images,
    options: params.options,
    sessionId: params.sessionId,
    abortController,
  });
}
