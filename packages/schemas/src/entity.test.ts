import { describe, expect, it } from 'vitest';
import { entity, entityEnvelope } from './entity.js';
import { slug } from './ids.js';
import { gameSystem, validatedGameSystem } from './system.js';

const SYSTEM_UUID = '00000000-0000-4000-8000-000000000001';
const ENTITY_UUID = '00000000-0000-4000-8000-000000000002';
const CHARACTER_UUID = '00000000-0000-4000-8000-000000000003';
const USER_UUID = '00000000-0000-4000-8000-000000000004';

const baseEntity = {
  id: ENTITY_UUID,
  systemId: SYSTEM_UUID,
  type: 'power',
  key: 'fireball',
  name: 'Fireball',
  source: { id: 'srd-5-2-1', name: 'SRD 5.2.1', license: 'CC-BY-4.0' },
  body: {},
};

describe('slug', () => {
  it.each(['fireball', 'srd-5-1', 'a', 'cursed-technique-limitless'])('accepts %s', (value) => {
    expect(slug.safeParse(value).success).toBe(true);
  });

  it.each(['Fireball', 'fire ball', 'fire_ball', '-fireball', 'fireball-', ''])(
    'rejects %s',
    (value) => {
      expect(slug.safeParse(value).success).toBe(false);
    },
  );
});

describe('entityEnvelope', () => {
  it('applies defaults for scope, version, and grants', () => {
    const parsed = entityEnvelope.parse(baseEntity);
    expect(parsed.scope).toBe('system');
    expect(parsed.characterId).toBeNull();
    expect(parsed.version).toBe(0);
    expect(parsed.grants).toEqual([]);
  });

  it('leaves body untouched — it is Phase 1 territory', () => {
    const body = { arbitrary: ['not', 'yet', 'validated'] };
    expect(entityEnvelope.parse({ ...baseEntity, body }).body).toEqual(body);
  });
});

describe('entity scope invariant', () => {
  it('accepts a system-scoped entity with no characterId', () => {
    expect(entity.safeParse(baseEntity).success).toBe(true);
  });

  it('accepts a character-scoped entity that names its character', () => {
    const result = entity.safeParse({
      ...baseEntity,
      scope: 'character',
      characterId: CHARACTER_UUID,
      key: 'limitless',
      name: 'Limitless',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a character-scoped entity with no characterId', () => {
    const result = entity.safeParse({ ...baseEntity, scope: 'character' });
    expect(result.success).toBe(false);
  });

  it('rejects a system-scoped entity that names a character', () => {
    const result = entity.safeParse({ ...baseEntity, characterId: CHARACTER_UUID });
    expect(result.success).toBe(false);
  });
});

describe('gameSystem', () => {
  const baseSystem = {
    id: SYSTEM_UUID,
    slug: 'dnd5e-2024',
    name: 'D&D 5e (2024)',
    ownerId: USER_UUID,
  };

  it('defaults every dial to inherited by leaving them unset', () => {
    const parsed = gameSystem.parse(baseSystem);
    expect(parsed.dials).toEqual({});
    expect(parsed.visibility).toBe('private');
    expect(parsed.forkedFromId).toBeNull();
  });

  it('allows a fork to mix dial states', () => {
    const parsed = gameSystem.parse({
      ...baseSystem,
      slug: 'jujutsu-kaisen',
      forkedFromId: '00000000-0000-4000-8000-00000000000a',
      dials: {
        attributes: 'replaced',
        progression: 'replaced',
        resources: 'replaced',
        powers: 'replaced',
        'combat-resolution': 'inherited',
        items: 'tweaked',
      },
    });
    expect(parsed.dials.attributes).toBe('replaced');
    expect(parsed.dials['combat-resolution']).toBe('inherited');
  });

  it('rejects a rootless system that tries to inherit', () => {
    const result = validatedGameSystem.safeParse({
      ...baseSystem,
      forkedFromId: null,
      dials: { attributes: 'inherited' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a rootless system that replaces everything it declares', () => {
    const result = validatedGameSystem.safeParse({
      ...baseSystem,
      forkedFromId: null,
      dials: { attributes: 'replaced', powers: 'replaced' },
    });
    expect(result.success).toBe(true);
  });
});
