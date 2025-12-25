/**
 * API Router - Combines all routes and exports AppType for RPC client
 */

import { Hono } from 'hono';
import runs from './runs/route';
import sessions from './sessions/route';

/**
 * Main API router
 *
 * Routes are chained for Hono RPC type inference
 */
const api = new Hono()
  .route('/runs', runs)
  .route('/sessions', sessions);

/**
 * Export AppType for RPC client usage
 *
 * Example client usage:
 * ```typescript
 * import { hc } from 'hono/client';
 * import type { AppType } from './api';
 *
 * const client = hc<AppType>('http://localhost:3000');
 * const result = await client.api.runs.start.$post({
 *   json: { cwd: '/path', prompt: 'Hello' }
 * });
 * ```
 */
export type AppType = typeof api;

export default api;
