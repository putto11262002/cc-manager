/**
 * Sessions API routes
 *
 * Endpoints:
 * - GET / - List all sessions
 * - GET /:id - Get session details
 * - GET /:id/messages - Get all messages for session
 * - GET /:id/runs - Get all runs for session
 * - GET /:id/forks - Get forked sessions
 * - PUT /:id/meta - Update session metadata
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { updateSessionMetaSchema } from './schema';
import {
  getSessions,
  getSession,
  getSessionMessages,
  getSessionRuns,
  getForkedSessions,
} from '../../core/stream-recorder';
import { isServiceError, wrapError } from '../../errors';
import { logger } from '../../logger';

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

/**
 * Sessions router - chained for type inference
 */
const sessions = new Hono()
  // GET /sessions
  .get('/', async (c) => {
    try {
      const sessions = await getSessions();
      return c.json(sessions);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /sessions/:id
  .get('/:id', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const session = await getSession(sessionId);

      if (!session) {
        return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
      }

      return c.json(session);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /sessions/:id/messages
  .get('/:id/messages', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const messages = await getSessionMessages(sessionId);
      return c.json(messages);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /sessions/:id/runs
  .get('/:id/runs', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const runs = await getSessionRuns(sessionId);
      return c.json(runs);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // GET /sessions/:id/forks
  .get('/:id/forks', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const forks = await getForkedSessions(sessionId);
      return c.json(forks);
    } catch (error) {
      return handleError(c, error);
    }
  })

  // PUT /sessions/:id/meta
  .put('/:id/meta', zValidator('json', updateSessionMetaSchema), async (c) => {
    try {
      const sessionId = c.req.param('id');
      const body = c.req.valid('json');

      // For V1, we'll just return success
      // In the future, we can add a session_meta table to store this
      // For now, metadata like "name" would need to be stored client-side
      return c.json({
        sessionId,
        meta: body,
        message: 'Session metadata update not yet implemented (coming in future version)',
      });
    } catch (error) {
      return handleError(c, error);
    }
  });

export default sessions;
