'use client';

import type { DialSettings, SystemDefinition } from '@ttrpg/schemas';
import { useMemo, useState } from 'react';

/**
 * The System Designer, per PLAN.md §2.
 *
 * There are no difficulty tiers and no graduation. Each subsystem is a dial set
 * on its own, and anything left `inherited` falls back to the parent, so a
 * system is always playable mid-construction. Jujutsu Kaisen is six dials moved
 * and three left alone; a 5e house rule is one dial moved. Same interface.
 */

const input =
  'w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

const SUBSYSTEMS = [
  ['attributes', 'Attributes'],
  ['derived-stats', 'Derived stats'],
  ['progression', 'Progression'],
  ['resources', 'Resources & power systems'],
  ['powers', 'Power taxonomy'],
  ['combat-resolution', 'Combat resolution'],
  ['health-damage', 'Health & damage'],
  ['items', 'Items'],
  ['conditions', 'Conditions'],
  ['creation-flow', 'Character creation'],
] as const;

const DIAL_STATES = [
  ['inherited', 'Inherited', 'using the parent’s, untouched'],
  ['tweaked', 'Tweaked', 'the parent’s, modified'],
  ['replaced', 'Replaced', 'built from scratch'],
] as const;

export function SystemDesigner({
  systemSlug,
  hasParent,
  initialDefinition,
  initialDials,
  action,
}: {
  systemSlug: string;
  hasParent: boolean;
  initialDefinition: SystemDefinition;
  initialDials: DialSettings;
  action: (form: FormData) => void;
}) {
  const [definition, setDefinition] = useState<SystemDefinition>(initialDefinition);
  const [dials, setDials] = useState<DialSettings>(initialDials);

  const serialisedDefinition = useMemo(() => JSON.stringify(definition), [definition]);
  const serialisedDials = useMemo(() => JSON.stringify(dials), [dials]);

  const patchAttribute = (
    index: number,
    changes: Partial<SystemDefinition['attributes'][number]>,
  ) =>
    setDefinition((prev) => ({
      ...prev,
      attributes: prev.attributes.map((a, i) => (i === index ? { ...a, ...changes } : a)),
    }));

  const patchDerived = (index: number, changes: Partial<SystemDefinition['derived'][number]>) =>
    setDefinition((prev) => ({
      ...prev,
      derived: prev.derived.map((d, i) => (i === index ? { ...d, ...changes } : d)),
    }));

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="systemSlug" value={systemSlug} />
      <input type="hidden" name="definition" value={serialisedDefinition} />
      <input type="hidden" name="dials" value={serialisedDials} />

      <section>
        <h2 className="text-sm font-medium">Subsystem dials</h2>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          {hasParent
            ? 'Anything left inherited falls back to the parent ruleset, so this system stays playable while you build it.'
            : 'This system has no parent, so every dial it declares must be replaced.'}
        </p>
        <ul className="space-y-2">
          {SUBSYSTEMS.map(([key, label]) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <span className="flex gap-1">
                {DIAL_STATES.map(([state, stateLabel, hint]) => {
                  const active = (dials[key] ?? 'inherited') === state;
                  const disabled = !hasParent && state !== 'replaced';
                  return (
                    <button
                      key={state}
                      type="button"
                      disabled={disabled}
                      title={hint}
                      aria-pressed={active}
                      onClick={() => setDials((prev) => ({ ...prev, [key]: state }))}
                      className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                          : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                      }`}
                    >
                      {stateLabel}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-medium">Attributes</h2>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          Your own stat block. Six D&amp;D abilities are just what the bundled rulesets answered
          here. Modifier formulas reference{' '}
          <code className="font-mono">attr.&lt;key&gt;.score</code>.
        </p>

        <ul className="space-y-2">
          {definition.attributes.map((attribute, index) => (
            <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_2fr_auto]">
              <input
                value={attribute.name}
                onChange={(e) => patchAttribute(index, { name: e.target.value })}
                placeholder="Name"
                aria-label={`Attribute ${index + 1} name`}
                className={input}
              />
              <input
                value={attribute.key}
                onChange={(e) => patchAttribute(index, { key: e.target.value })}
                placeholder="key"
                aria-label={`Attribute ${index + 1} key`}
                className={`${input} font-mono`}
              />
              <input
                value={attribute.abbreviation}
                onChange={(e) => patchAttribute(index, { abbreviation: e.target.value })}
                placeholder="ABV"
                aria-label={`Attribute ${index + 1} abbreviation`}
                className={input}
              />
              <input
                value={attribute.modifier ?? ''}
                onChange={(e) => patchAttribute(index, { modifier: e.target.value || undefined })}
                placeholder="floor((attr.str.score - 10) / 2)"
                aria-label={`Attribute ${index + 1} modifier formula`}
                className={`${input} font-mono`}
              />
              <button
                type="button"
                onClick={() =>
                  setDefinition((prev) => ({
                    ...prev,
                    attributes: prev.attributes.filter((_, i) => i !== index),
                  }))
                }
                className="text-xs text-neutral-500 underline underline-offset-4"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setDefinition((prev) => ({
              ...prev,
              attributes: [
                ...prev.attributes,
                { key: '', name: '', abbreviation: '', default: 10 },
              ],
            }))
          }
          className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Add an attribute
        </button>
      </section>

      <section>
        <h2 className="text-sm font-medium">Derived stats</h2>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          Armor Class is not special — it is one of these. Give a stat a base, a formula, or both.
        </p>

        <ul className="space-y-2">
          {definition.derived.map((stat, index) => (
            <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_2fr_auto]">
              <input
                value={stat.name}
                onChange={(e) => patchDerived(index, { name: e.target.value })}
                placeholder="Name"
                aria-label={`Stat ${index + 1} name`}
                className={input}
              />
              <input
                value={stat.key}
                onChange={(e) => patchDerived(index, { key: e.target.value })}
                placeholder="key"
                aria-label={`Stat ${index + 1} key`}
                className={`${input} font-mono`}
              />
              <input
                type="number"
                value={stat.base ?? ''}
                onChange={(e) =>
                  patchDerived(index, {
                    base: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                placeholder="base"
                aria-label={`Stat ${index + 1} base`}
                className={input}
              />
              <input
                value={stat.formula ?? ''}
                onChange={(e) => patchDerived(index, { formula: e.target.value || undefined })}
                placeholder="10 + attr.dex.mod"
                aria-label={`Stat ${index + 1} formula`}
                className={`${input} font-mono`}
              />
              <button
                type="button"
                onClick={() =>
                  setDefinition((prev) => ({
                    ...prev,
                    derived: prev.derived.filter((_, i) => i !== index),
                  }))
                }
                className="text-xs text-neutral-500 underline underline-offset-4"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setDefinition((prev) => ({
              ...prev,
              derived: [...prev.derived, { key: '', name: '', base: 0 }],
            }))
          }
          className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Add a derived stat
        </button>
      </section>

      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Save design
      </button>
    </form>
  );
}
