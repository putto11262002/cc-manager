/**
 * Zod schemas for sessions API endpoints
 */

import { z } from 'zod';

/**
 * PUT /sessions/:id/meta request body
 */
export const updateSessionMetaSchema = z.object({
  name: z.string().min(1).optional(),
  // Can be extended with more metadata fields later
});

export type UpdateSessionMetaRequest = z.infer<typeof updateSessionMetaSchema>;
