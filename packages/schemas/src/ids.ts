import { z } from 'zod';

/**
 * Branded ID schemas.
 *
 * Structurally strings at runtime, but the brand stops a SystemId being passed
 * where a CharacterId is expected. With five different UUID-shaped IDs in play,
 * that mix-up is a matter of when, not if.
 *
 * `.brand()` rather than `.transform()`: branding composes with `.nullable()`
 * and `.default()`, transforms do not compose as cleanly.
 */
export const userIdSchema = z.uuid().brand<'UserId'>();
export const systemIdSchema = z.uuid().brand<'SystemId'>();
export const entityIdSchema = z.uuid().brand<'EntityId'>();
export const characterIdSchema = z.uuid().brand<'CharacterId'>();
export const campaignIdSchema = z.uuid().brand<'CampaignId'>();

export type UserId = z.infer<typeof userIdSchema>;
export type SystemId = z.infer<typeof systemIdSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type CharacterId = z.infer<typeof characterIdSchema>;
export type CampaignId = z.infer<typeof campaignIdSchema>;

/**
 * Human-readable, URL-safe identifier. Used for system slugs and for stable
 * cross-references inside content bodies (e.g. `dnd5e-2024:spell.fireball`),
 * which must survive a fork even though UUIDs do not.
 */
export const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case');

export type Slug = z.infer<typeof slug>;
