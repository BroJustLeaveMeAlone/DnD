import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { accounts, sessions, users, verificationTokens } from './auth.js';
import { campaignMembers, campaigns, characters, entities, systems } from './core.js';

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table)
    .columns.map((c) => c.name)
    .sort();

/**
 * The Auth.js Drizzle adapter addresses these columns by name. A rename here is
 * silent at compile time and breaks sign-in at runtime, so pin the contract.
 */
describe('Auth.js adapter table contract', () => {
  it('users has the adapter columns', () => {
    expect(columnNames(users)).toEqual(
      ['id', 'name', 'email', 'emailVerified', 'image', 'handle', 'created_at'].sort(),
    );
  });

  it('accounts has the adapter columns', () => {
    expect(columnNames(accounts)).toEqual(
      [
        'userId',
        'type',
        'provider',
        'providerAccountId',
        'refresh_token',
        'access_token',
        'expires_at',
        'token_type',
        'scope',
        'id_token',
        'session_state',
      ].sort(),
    );
  });

  it('sessions and verification tokens keep their camelCase names', () => {
    expect(columnNames(sessions)).toEqual(['sessionToken', 'userId', 'expires'].sort());
    expect(getTableConfig(verificationTokens).name).toBe('verificationToken');
  });
});

describe('core domain tables', () => {
  it('entities enforce the character-scope invariant in the database', () => {
    const checks = getTableConfig(entities).checks.map((c) => c.name);
    expect(checks).toContain('entities_character_scope_check');
  });

  it('entity keys are unique within a system, not globally', () => {
    const constraint = getTableConfig(entities).uniqueConstraints.find(
      (u) => u.name === 'entities_system_key_unique',
    );
    expect(constraint?.columns.map((c) => c.name)).toEqual(['system_id', 'key']);
  });

  it('systems can reference a parent, so forks form a tree', () => {
    const config = getTableConfig(systems);
    expect(config.columns.map((c) => c.name)).toContain('forked_from_id');
  });

  it('characters and campaigns cannot outlive the system they use', () => {
    // onDelete: 'restrict' — deleting a system with live characters must fail
    // loudly rather than cascade away someone's character.
    for (const table of [characters, campaigns]) {
      const fk = getTableConfig(table).foreignKeys.find(
        (f) => f.reference().foreignTable === systems,
      );
      expect(fk?.onDelete).toBe('restrict');
    }
  });

  it('a user holds at most one membership per campaign', () => {
    const [pk] = getTableConfig(campaignMembers).primaryKeys;
    expect(pk?.columns.map((c) => c.name)).toEqual(['campaign_id', 'user_id']);
  });

  it('entity and system versions are integers, matching the Zod schemas', () => {
    // These round-trip through @ttrpg/schemas, where version is z.number().
    // A text column here would fail to parse on read.
    for (const table of [entities, systems]) {
      const column = getTableConfig(table).columns.find((c) => c.name === 'version');
      expect(column?.getSQLType()).toBe('integer');
    }
  });
});
