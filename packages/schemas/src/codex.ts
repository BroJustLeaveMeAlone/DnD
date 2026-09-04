import { z } from 'zod';
import { slug } from './ids.js';

/**
 * Codex entries: world-building prose bound to real mechanics. See PLAN.md §6.
 */

export const codexType = z.enum([
  'character',
  'location',
  'faction',
  'organization',
  'deity',
  'event',
  'item',
  'species',
  'language',
  'note',
]);

export const codexVisibility = z.enum(['private', 'shared', 'public']);

export const codexEntry = z.object({
  key: slug,
  type: codexType,
  title: z.string().min(1).max(200),
  body: z.string().max(100_000).default(''),
  /**
   * Binds this entry to a content entity by key, so an NPC carries a real
   * statblock rather than a description of one.
   */
  entityKey: slug.nullable().default(null),
  visibility: codexVisibility.default('private'),
});

export type CodexEntryInput = z.input<typeof codexEntry>;
export type CodexEntry = z.output<typeof codexEntry>;
