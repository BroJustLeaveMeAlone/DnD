import type { CharacterBuild, DerivedSheet, SystemModule } from '@ttrpg/rules-engine';
import { compile, resolve } from '@ttrpg/rules-engine';
import { dnd5e2014 } from './dnd5e-2014.js';
import { dnd5e2024 } from './dnd5e-2024.js';

export * from './authoring.js';
export { dnd5e2014 } from './dnd5e-2014.js';
export { dnd5e2024 } from './dnd5e-2024.js';

export const MODULES: Readonly<Record<string, SystemModule>> = {
  'dnd5e-2014': dnd5e2014,
  'dnd5e-2024': dnd5e2024,
};

/**
 * Both editions score proficiency the same way. It lives here rather than in
 * the engine because "expertise doubles your bonus" is a 5e rule, not a
 * universal one — a system where expertise is a flat +3 sets its own scale.
 */
export const DND5E_PROFICIENCY_SCALE = {
  none: 0,
  half: 0.5,
  proficient: 1,
  expertise: 2,
} as const;

/**
 * Convenience for tests and the sheet layer: module + build -> derived sheet.
 * The flags a build declares are augmented by `state` grants, so an equipped
 * suit of chain mail sets `armour.heavy` and the Defense fighting style's
 * condition can see it.
 */
export function buildSheet(module: SystemModule, build: CharacterBuild): DerivedSheet {
  const input = compile(module, build);

  // First pass discovers `state` grants (armour.heavy, shield) that later
  // predicates depend on. Cheap, and it keeps state derivation as data rather
  // than a special case in the compiler.
  const discovered = resolve({ ...input, proficiencyScale: DND5E_PROFICIENCY_SCALE });
  const stateFlags = discovered.grants.filter((g) => g.category === 'state').map((g) => g.target);

  return resolve({
    ...input,
    flags: [...(input.flags ?? []), ...stateFlags, ...(stateFlags.length ? ['armour.any'] : [])]
      // `armour.any` should only appear when actual armour is worn, not merely
      // because some state grant exists.
      .filter((flagName, i, all) => all.indexOf(flagName) === i)
      .filter(
        (flagName) => flagName !== 'armour.any' || stateFlags.some((s) => s.startsWith('armour.')),
      ),
    proficiencyScale: DND5E_PROFICIENCY_SCALE,
  });
}
