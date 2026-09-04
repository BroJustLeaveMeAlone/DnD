import type { DerivedSheet, SystemModule } from '@ttrpg/rules-engine';
import { StatValue, signed } from './stat-value';

/**
 * A character sheet generated from a system's own schema.
 *
 * Nothing here knows what an ability score or an Armor Class is. Sections come
 * from the module's attribute and derived-stat definitions, so a system built
 * around cursed energy and named grades renders as naturally as 5e does — which
 * is the point of PLAN.md's central bet.
 *
 * The 5e modules get better-organised sections by naming their stats with the
 * conventional prefixes below. That is a presentation nicety a custom system
 * can adopt or ignore; nothing depends on it.
 */

interface Section {
  title: string;
  /** Matches a derived stat key to this section. */
  match: (key: string) => boolean;
  /** Rendered as a signed modifier rather than a bare number. */
  signed?: boolean;
}

const SECTIONS: Section[] = [
  { title: 'Saving throws', match: (k) => k.startsWith('save.') && k !== 'save.all', signed: true },
  { title: 'Skills', match: (k) => k.startsWith('skill.'), signed: true },
  { title: 'Spellcasting', match: (k) => k.startsWith('spell.') },
];

const humanise = (key: string) =>
  key
    .replace(/^[a-z]+\./, '')
    .replace(/[._]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

export function AutoSheet({ module, sheet }: { module: SystemModule; sheet: DerivedSheet }) {
  const named = new Map(module.derived.map((d) => [d.key, d.name]));
  const display = new Map(module.derived.map((d) => [d.key, d.display]));

  /** Module-declared formatting, falling back to a section default. */
  const formatFor = (key: string, sectionSigned?: boolean) => {
    const hint = display.get(key);
    const useSign = hint?.signed ?? sectionSigned ?? false;
    const suffix = hint?.suffix ? ` ${hint.suffix}` : '';
    if (!useSign && !suffix) return undefined;
    return (value: number) => `${useSign ? signed(value) : value}${suffix}`;
  };

  const attributeKeys = new Set(
    module.attributes.flatMap((a) => [`attr.${a.key}.score`, `attr.${a.key}.mod`]),
  );

  const sectioned = new Set<string>();
  const sections = SECTIONS.map((section) => {
    const keys = Object.keys(sheet.stats)
      .filter((key) => !attributeKeys.has(key) && section.match(key))
      .sort();
    for (const key of keys) sectioned.add(key);
    return { ...section, keys };
  }).filter((section) => section.keys.length > 0);

  // Everything the module declares that no section claimed. Declared order is
  // the author's order, which is more meaningful than alphabetical.
  const core = module.derived
    .map((d) => d.key)
    .filter(
      (key) =>
        !attributeKeys.has(key) &&
        !sectioned.has(key) &&
        key !== 'save.all' &&
        sheet.stats[key] !== undefined,
    );

  return (
    <>
      {module.attributes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Attributes</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {module.attributes.map((attribute) => (
              <StatValue
                key={attribute.key}
                label={attribute.abbreviation || attribute.name}
                derived={sheet.stats[`attr.${attribute.key}.mod`]}
                format={signed}
              />
            ))}
          </div>
        </section>
      )}

      {core.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Core</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {core.map((key) => {
              const format = formatFor(key);
              return (
                <StatValue
                  key={key}
                  label={named.get(key) ?? humanise(key)}
                  derived={sheet.stats[key]}
                  {...(format ? { format } : {})}
                />
              );
            })}
          </div>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="mb-3 text-sm font-medium">{section.title}</h2>
          {section.title === 'Skills' ? (
            <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {section.keys.map((key) => {
                const proficiency = sheet.proficiencies[key]?.level;
                return (
                  <li
                    key={key}
                    className="flex items-baseline justify-between border-b border-neutral-100 py-1 dark:border-neutral-900"
                  >
                    <span>
                      {named.get(key) ?? humanise(key)}
                      {proficiency && proficiency !== 'none' && (
                        <span className="ml-2 text-[10px] uppercase text-neutral-500">
                          {proficiency}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      {signed(sheet.stats[key]!.value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {section.keys.map((key) => {
                const format = formatFor(key, section.signed);
                return (
                  <StatValue
                    key={key}
                    label={named.get(key) ?? humanise(key)}
                    derived={sheet.stats[key]}
                    {...(format ? { format } : {})}
                  />
                );
              })}
            </div>
          )}
        </section>
      ))}

      {Object.keys(sheet.resources).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Resources</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(sheet.resources).map(([key, resource]) => (
              <li
                key={key}
                className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <p className="text-xs text-neutral-500">{humanise(key)}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{resource.max}</p>
                <p className="text-[10px] text-neutral-400">per {resource.recharge}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.keys(sheet.damageResponses).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Damage responses</h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {Object.entries(sheet.damageResponses).map(([type, response]) => (
              <li
                key={type}
                className="rounded-full border border-neutral-300 px-3 py-1 dark:border-neutral-700"
              >
                {response} to {type}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheet.grants.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Features &amp; traits</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {sheet.grants.map((grant, i) => (
              <li key={`${grant.target}-${i}`} className="flex justify-between gap-4 py-0.5">
                <span>{humanise(grant.target)}</span>
                <span className="text-xs text-neutral-500">{grant.sourceName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
