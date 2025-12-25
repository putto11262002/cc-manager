/**
 * Zod schemas for runs API endpoints
 */

import { z } from 'zod';

/**
 * Max prompt length (in characters)
 * This is a reasonable limit to prevent abuse; SDK may have its own limits
 */
const MAX_PROMPT_LENGTH = 1_000_000; // 1MB of text

/**
 * Max image data size (in characters of base64)
 * ~20MB of image data when decoded
 */
const MAX_IMAGE_DATA_LENGTH = 27_000_000;

/**
 * Max number of images per request
 */
const MAX_IMAGES = 20;

/**
 * Image attachment schema
 */
const imageSchema = z.object({
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  data: z
    .string()
    .min(1, 'Image data cannot be empty')
    .max(MAX_IMAGE_DATA_LENGTH, 'Image data too large'),
});

/**
 * SDK Options schema (partial - only common fields)
 * We keep this flexible to allow any SDK options
 */
const optionsSchema = z.record(z.string(), z.any()).optional();

/**
 * Trimmed non-empty string
 */
const nonEmptyString = (fieldName: string) =>
  z
    .string()
    .transform(s => s.trim())
    .pipe(z.string().min(1, `${fieldName} is required`));

/**
 * POST /runs/start request body
 */
export const startRunSchema = z.object({
  cwd: nonEmptyString('cwd'),
  prompt: nonEmptyString('prompt').pipe(
    z.string().max(MAX_PROMPT_LENGTH, 'Prompt too long')
  ),
  images: z.array(imageSchema).max(MAX_IMAGES, 'Too many images').optional(),
  options: optionsSchema,
});

export type StartRunRequest = z.infer<typeof startRunSchema>;

/**
 * POST /runs/resume request body
 */
export const resumeRunSchema = z.object({
  sessionId: nonEmptyString('sessionId'),
  prompt: nonEmptyString('prompt').pipe(
    z.string().max(MAX_PROMPT_LENGTH, 'Prompt too long')
  ),
  images: z.array(imageSchema).max(MAX_IMAGES, 'Too many images').optional(),
  options: optionsSchema,
});

export type ResumeRunRequest = z.infer<typeof resumeRunSchema>;

/**
 * POST /runs/fork request body
 */
export const forkRunSchema = z.object({
  sessionId: nonEmptyString('sessionId'),
  prompt: nonEmptyString('prompt').pipe(
    z.string().max(MAX_PROMPT_LENGTH, 'Prompt too long')
  ),
  images: z.array(imageSchema).max(MAX_IMAGES, 'Too many images').optional(),
  options: optionsSchema,
});

export type ForkRunRequest = z.infer<typeof forkRunSchema>;
