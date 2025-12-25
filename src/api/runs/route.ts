/**
 * Runs API routes
 *
 * Endpoints:
 * - POST /start - Start a fresh run
 * - POST /resume - Resume a session
 * - POST /fork - Fork a session
 * - DELETE /:runId - Cancel a run
 * - GET /:runId - Get run details
 * - GET /:runId/messages - Get run messages
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { startRunSchema, resumeRunSchema, forkRunSchema } from './schema';
import * as runManager from '../../core/run-manager';
import { isServiceError, wrapError } from '../../errors';
import { logger } from '../../logger';

/**
 * Runs router - chained for type inference
 */
/**
 * Handle errors uniformly
 */
function handleError(c: any, error: unknown) {
  const serviceError = isServiceError(error) ? error : wrapError(error);
  logger.error('API error', {
    code: serviceError.code,
    message: serviceError.message,
    path: c.req.path,
  });
  return c.json(serviceError.toJSON(), serviceError.statusCode);
}

const runs = new Hono()
  // POST /runs/start
  .post('/start', zValidator('json', startRunSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      logger.info('POST /runs/start', { cwd: body.cwd });
      const result = await runManager.start({
        cwd: body.cwd,
        prompt: body.prompt,
        images: body.images,
        options: body.options,
      });
      return c.json(result);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // POST /runs/resume
  .post('/resume', zValidator('json', resumeRunSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      logger.info('POST /runs/resume', { sessionId: body.sessionId });
      const result = await runManager.resume({
        sessionId: body.sessionId,
        prompt: body.prompt,
        images: body.images,
        options: body.options,
      });
      return c.json(result);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // POST /runs/fork
  .post('/fork', zValidator('json', forkRunSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      logger.info('POST /runs/fork', { sessionId: body.sessionId });
      const result = await runManager.fork({
        sessionId: body.sessionId,
        prompt: body.prompt,
        images: body.images,
        options: body.options,
      });
      return c.json(result);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // DELETE /runs/:runId
  .delete('/:runId', async (c) => {
    try {
      const runId = c.req.param('runId');
      logger.info('DELETE /runs/:runId', { runId });
      await runManager.cancel(runId);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /runs/:runId
  .get('/:runId', async (c) => {
    try {
      const runId = c.req.param('runId');
      const run = await runManager.getRun(runId);

      if (!run) {
        return c.json({ error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
      }

      return c.json(run);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /runs/:runId/messages
  .get('/:runId/messages', async (c) => {
    try {
      const runId = c.req.param('runId');
      const messages = await runManager.getRunMessages(runId);
      return c.json(messages);
    } catch (error) {
      return handleError(c, error);
    }
  });

export default runs;
