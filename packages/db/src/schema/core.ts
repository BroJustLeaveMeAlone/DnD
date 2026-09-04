import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/**
 * Core domain tables. Phase 0 pins down the shapes that later phases build on:
 * systems (the dials), entities (the content envelope), characters, campaigns.
 *
 * JSONB columns are deliberate. Entity bodies, dial configuration, and
 * character build state are all schema-defined by the *system*, not by us, so
 * they cannot live in fixed columns. Relational indexes go over the JSONB
 * where queries need them. See PLAN.md §16.
 */

export const visibilityEnum = pgEnum('visibility', ['private', 'campaign', 'public']);

export const contentLicenseEnum = pgEnum('content_license', [
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'all-rights-reserved',
]);

export const entityScopeEnum = pgEnum('entity_scope', ['system', 'character']);

export const campaignRoleEnum = pgEnum('campaign_role', ['gm', 'player', 'spectator']);

// --- Systems -----------------------------------------------------------------

export const systems = pgTable(
  'systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Nothing starts from a blank page. Null only for the seeded 5e modules at
     * the root of the fork tree. Drives the attribution chain in the Commons.
     */
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => systems.id, {
      onDelete: 'set null',
    }),

    /** Partial map of subsystem -> 'inherited' | 'tweaked' | 'replaced'. */
    dials: jsonb('dials')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /**
     * The non-entity half of a SystemModule: attribute definitions, derived
     * stat definitions, and the proficiency scale. Entities live in their own
     * table because they are browsed and queried; these are read only as a
     * whole, when loading the system to resolve a character.
     */
    definition: jsonb('definition')
      .notNull()
      .default(sql`'{}'::jsonb`),

    visibility: visibilityEnum('visibility').notNull().default('private'),
    license: contentLicenseEnum('license').notNull().default('all-rights-reserved'),
    version: integer('version').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('systems_owner_idx').on(table.ownerId),
    index('systems_forked_from_idx').on(table.forkedFromId),
    index('systems_visibility_idx').on(table.visibility),
  ],
);

// --- Characters --------------------------------------------------------------

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => systems.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),

    /**
     * The choices the player made — never computed results. A level 4 ASI is a
     * decision node, not `+2 STR`. This is what makes retroactive recomputation,
     * respec, undo, and time travel work. See PLAN.md §1.
     */
    build: jsonb('build')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /** Mutable at-the-table state: current HP, spent resources, conditions. */
    state: jsonb('state')
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('characters_owner_idx').on(table.ownerId),
    index('characters_system_idx').on(table.systemId),
  ],
);

// --- Entities ----------------------------------------------------------------

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    systemId: uuid('system_id')
      .notNull()
      .references(() => systems.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    scope: entityScopeEnum('scope').notNull().default('system'),

    /** Set if and only if scope = 'character'. Enforced by the check below. */
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),

    /** Stable within a system; survives forking. */
    key: text('key').notNull(),
    name: text('name').notNull(),

    /** { id, name, license } — drives source filtering and CC-BY attribution. */
    source: jsonb('source').notNull(),

    /** Engine territory: effects, grants, predicates. Defined in Phase 1. */
    body: jsonb('body')
      .notNull()
      .default(sql`'{}'::jsonb`),
    grants: jsonb('grants')
      .notNull()
      .default(sql`'[]'::jsonb`),

    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // NULLS NOT DISTINCT is load-bearing. Postgres normally treats NULLs as
    // distinct, so a plain UNIQUE over these three columns would let a system
    // hold unlimited rows with the same key and a NULL character_id. With this,
    // system-scoped keys stay unique per system, while two characters can each
    // own private content under the same key — a technique named `domain`
    // belongs to one character, not to the system.
    unique('entities_system_key_unique')
      .on(table.systemId, table.key, table.characterId)
      .nullsNotDistinct(),
    index('entities_system_type_idx').on(table.systemId, table.type),
    index('entities_character_idx').on(table.characterId),
    // Structured effect queries ("everything that touches AC") use jsonb
    // containment against this column. Without the GIN index every such query
    // is a sequential scan over the whole compendium.
    index('entities_grants_gin_idx').using('gin', table.grants),
    // Mirrors the Zod refinement in @ttrpg/schemas. Enforced in the database too,
    // because character-scoped content is a load-bearing invariant and the app
    // is not the only thing that will ever write to this table.
    check(
      'entities_character_scope_check',
      sql`(${table.scope} = 'character') = (${table.characterId} IS NOT NULL)`,
    ),
  ],
);

// --- Campaigns ---------------------------------------------------------------

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => systems.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),

    /** Campaign-scoped `override` effects — the house-rule mechanism. */
    houseRules: jsonb('house_rules')
      .notNull()
      .default(sql`'[]'::jsonb`),

    /**
     * Bearer token for the join link. Rotating it invalidates every link
     * previously handed out, which is the only way to un-invite someone who
     * shared it.
     */
    inviteToken: text('invite_token').unique(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('campaigns_owner_idx').on(table.ownerId)],
);

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: campaignRoleEnum('role').notNull().default('player'),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A real composite primary key, not a unique constraint that merely looks
    // like one. One membership per user per campaign.
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index('campaign_members_user_idx').on(table.userId),
  ],
);

// --- Codex -------------------------------------------------------------------

export const codexVisibilityEnum = pgEnum('codex_visibility', ['private', 'shared', 'public']);

/**
 * World-building entries: characters, locations, factions, events, deities.
 *
 * The differentiator is `entityKey`: a codex entry can bind to a real content
 * entity, so an NPC carries an actual statblock and an artifact *is* the item.
 * World Anvil has lore without mechanics; D&D Beyond has mechanics without
 * lore. Connecting them is the point. See PLAN.md §6.
 */
export const codexEntries = pgTable(
  'codex_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    systemId: uuid('system_id')
      .notNull()
      .references(() => systems.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** character, location, faction, event, deity, item, language, note. */
    type: text('type').notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    /** Long-form prose. Wiki links are written as [[other-key]]. */
    body: text('body').notNull().default(''),

    /**
     * Outbound wiki links, extracted from the body on write. Denormalised so
     * backlinks are an index lookup rather than a scan of every entry's prose.
     */
    links: jsonb('links')
      .notNull()
      .default(sql`'[]'::jsonb`),

    /** Optional binding to a content entity, by its key within the system. */
    entityKey: text('entity_key'),

    visibility: codexVisibilityEnum('visibility').notNull().default('private'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('codex_system_key_unique').on(table.systemId, table.key),
    index('codex_system_type_idx').on(table.systemId, table.type),
    index('codex_owner_idx').on(table.ownerId),
    // Backlink lookups query containment against this array.
    index('codex_links_gin_idx').using('gin', table.links),
  ],
);

// --- Relations ---------------------------------------------------------------

export const systemsRelations = relations(systems, ({ one, many }) => ({
  owner: one(users, { fields: [systems.ownerId], references: [users.id] }),
  forkedFrom: one(systems, {
    fields: [systems.forkedFromId],
    references: [systems.id],
    relationName: 'fork',
  }),
  forks: many(systems, { relationName: 'fork' }),
  entities: many(entities),
  characters: many(characters),
}));

export const entitiesRelations = relations(entities, ({ one }) => ({
  system: one(systems, { fields: [entities.systemId], references: [systems.id] }),
  character: one(characters, { fields: [entities.characterId], references: [characters.id] }),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  owner: one(users, { fields: [characters.ownerId], references: [users.id] }),
  system: one(systems, { fields: [characters.systemId], references: [systems.id] }),
  ownEntities: many(entities),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
  system: one(systems, { fields: [campaigns.systemId], references: [systems.id] }),
  members: many(campaignMembers),
}));

export const campaignMembersRelations = relations(campaignMembers, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignMembers.campaignId], references: [campaigns.id] }),
  user: one(users, { fields: [campaignMembers.userId], references: [users.id] }),
  character: one(characters, {
    fields: [campaignMembers.characterId],
    references: [characters.id],
  }),
}));
