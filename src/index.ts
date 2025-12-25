/**
 * CC Manager - Entry point
 *
 * A thin API service on top of Claude Code SDK that adds:
 * - Run lifecycle management
 * - Message persistence
 * - Session tracking with immutable history
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import api from './api';
import { logger } from './logger';

// Initialize the Hono app
const app = new Hono();

// Enable CORS for all routes
app.use('*', cors());

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.debug('Request completed', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API info endpoint
app.get('/', (c) => {
  return c.json({
    name: 'cc-manager',
    version: '0.1.0',
    description: 'Claude Code Manager API Service',
    endpoints: {
      runs: {
        start: 'POST /api/runs/start',
        resume: 'POST /api/runs/resume',
        fork: 'POST /api/runs/fork',
        cancel: 'DELETE /api/runs/:runId',
        get: 'GET /api/runs/:runId',
        getMessages: 'GET /api/runs/:runId/messages',
      },
      sessions: {
        list: 'GET /api/sessions',
        get: 'GET /api/sessions/:id',
        getMessages: 'GET /api/sessions/:id/messages',
        getRuns: 'GET /api/sessions/:id/runs',
        getForks: 'GET /api/sessions/:id/forks',
        updateMeta: 'PUT /api/sessions/:id/meta',
      },
    },
  });
});

// Mount API routes
app.route('/api', api);

// Export AppType for RPC client usage
export type AppType = typeof app;

// Start the server
const port = process.env.PORT || 3000;

logger.info('Starting CC Manager', { port });

export default {
  port,
  fetch: app.fetch,
};
