'use client';

import type { AuthoredEffect, AuthoredEntity } from '@ttrpg/schemas';
import { useMemo, useState, useTransition } from 'react';
import { checkFormula } from '@/server/authoring';

/**
 * Structured effect authoring.
 *
 * Effects are composed from dropdowns and typed fields rather than written as
 * JSON, because the whole promise of the platform is that a person who is not a
 * programmer can make a homebrew class that actually calculates. Raw JSON would
 * put that behind a syntax wall.
 *
 * Formulas are validated against the real parser on the server as you type —
 * the same parser the engine uses, so an accepted formula cannot fail later.
 */

const input =
  'w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

const KINDS: { value: AuthoredEffect['kind']; label: string; hint: string }[] = [
  { value: 'numeric', label: 'Change a number', hint: 'AC, a save, hit points, speed' },
  { value: 'proficiency', label: 'Grant proficiency', hint: 'a skill, a save, a tool' },
  { value: 'roll-bias', label: 'Advantage / disadvantage', hint: 'on a named roll' },
  { value: 'damage-response', label: 'Resistance / immunity', hint: 'to a damage type' },
  { value: 'resource', label: 'Grant a resource', hint: 'a pool with a recharge' },
  { value: 'grant', label: 'Grant something', hint: 'a sense, an action, a trait' },
];

function FormulaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [status, setStatus] = useState<{ ok: boolean; message?: string } | null>(null);
  const [, startTransition] = useTransition();

  const validate = (next: string) => {
    if (!next.trim()) return setStatus(null);
    startTransition(async () => {
      const result = await checkFormula(next);
      setStatus(
        result.ok
          ? {
              ok: true,
              message: result.references?.length
                ? `uses ${result.references.join(', ')}`
                : 'constant',
            }
          : { ok: false, message: result.error },
      );
    });
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          validate(e.target.value);
        }}
        placeholder="e.g. 2, or attr.dex.mod + proficiency_bonus"
        className={`${input} font-mono ${
          status && !status.ok ? 'border-red-500 dark:border-red-500' : ''
        }`}
        aria-invalid={status ? !status.ok : undefined}
      />
      {status && (
        <span
          role={status.ok ? undefined : 'alert'}
          className={`mt-1 block text-xs ${status.ok ? 'text-neutral-500' : 'text-red-600 dark:text-red-400'}`}
        >
          {status.message}
        </span>
      )}
    </label>
  );
}

const blank = (kind: AuthoredEffect['kind']): AuthoredEffect => {
  switch (kind) {
    case 'numeric':
      return { kind, target: 'ac', operation: 'add', value: '1' };
    case 'proficiency':
      return { kind, target: 'skill.stealth', level: 'proficient' };
    case 'roll-bias':
      return { kind, target: 'attack', bias: 'advantage' };
    case 'damage-response':
      return { kind, target: 'fire', response: 'resistance' };
    case 'resource':
      return { kind, target: 'my_pool', max: '1', recharge: 'long-rest' };
    case 'grant':
      return { kind, category: 'trait', target: 'my-trait' };
  }
};

export function EffectBuilder({
  systemSlug,
  initial,
  action,
}: {
  systemSlug: string;
  initial: AuthoredEntity;
  action: (form: FormData) => void;
}) {
  const [entity, setEntity] = useState<AuthoredEntity>(initial);

  const effects = entity.grants[0]?.effects ?? [];
  const when = entity.grants[0]?.when;
  const detail = entity.grants[0]?.detail ?? '';
  const atLevel = entity.grants[0]?.atLevel;

  const setEffects = (next: AuthoredEffect[]) =>
    setEntity((prev) => ({
      ...prev,
      grants: next.length === 0 ? [] : [{ ...prev.grants[0], effects: next }],
    }));

  const patch = (index: number, changes: Partial<AuthoredEffect>) =>
    setEffects(
      effects.map((effect, i) =>
        i === index ? ({ ...effect, ...changes } as AuthoredEffect) : effect,
      ),
    );

  const serialised = useMemo(() => JSON.stringify(entity), [entity]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="systemSlug" value={systemSlug} />
      <input type="hidden" name="entity" value={serialised} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input
            value={entity.name}
            onChange={(e) => setEntity({ ...entity, name: e.target.value })}
            className={input}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Key</span>
          <input
            value={entity.key}
            onChange={(e) => setEntity({ ...entity, key: e.target.value })}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="lowercase kebab-case"
            className={`${input} font-mono`}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Type</span>
          <select
            value={entity.type}
            onChange={(e) =>
              setEntity({ ...entity, type: e.target.value as AuthoredEntity['type'] })
            }
            className={input}
          >
            {[
              'species',
              'background',
              'class',
              'subclass',
              'feat',
              'power',
              'item',
              'condition',
            ].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Effects</legend>

        {effects.length === 0 && (
          <p className="rounded-md border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700">
            No effects yet. This entity will appear in the compendium but change nothing.
          </p>
        )}

        {effects.map((effect, index) => (
          <div
            key={index}
            className="space-y-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-3">
              <select
                value={effect.kind}
                onChange={(e) =>
                  setEffects(
                    effects.map((current, i) =>
                      i === index ? blank(e.target.value as AuthoredEffect['kind']) : current,
                    ),
                  )
                }
                className={`${input} max-w-xs`}
                aria-label={`Effect ${index + 1} kind`}
              >
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEffects(effects.filter((_, i) => i !== index))}
                className="text-xs text-neutral-500 underline underline-offset-4"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {effect.kind === 'numeric' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Stat</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Operation</span>
                    <select
                      value={effect.operation}
                      onChange={(e) =>
                        patch(index, {
                          operation: e.target.value as 'add' | 'set' | 'floor' | 'cap',
                        })
                      }
                      className={input}
                    >
                      <option value="add">add to it</option>
                      <option value="set">set it (highest wins)</option>
                      <option value="floor">raise it to at least</option>
                      <option value="cap">cap it at</option>
                    </select>
                  </label>
                  <FormulaField
                    label="Value"
                    value={effect.value}
                    onChange={(value) => patch(index, { value })}
                  />
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">
                      Bonus type (optional — same type does not stack)
                    </span>
                    <input
                      value={effect.bonusType ?? ''}
                      onChange={(e) => patch(index, { bonusType: e.target.value || undefined })}
                      className={input}
                    />
                  </label>
                </>
              )}

              {effect.kind === 'proficiency' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Target</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Level</span>
                    <select
                      value={effect.level}
                      onChange={(e) =>
                        patch(index, {
                          level: e.target.value as 'half' | 'proficient' | 'expertise',
                        })
                      }
                      className={input}
                    >
                      <option value="half">half</option>
                      <option value="proficient">proficient</option>
                      <option value="expertise">expertise</option>
                    </select>
                  </label>
                </>
              )}

              {effect.kind === 'roll-bias' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Roll</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Bias</span>
                    <select
                      value={effect.bias}
                      onChange={(e) =>
                        patch(index, { bias: e.target.value as 'advantage' | 'disadvantage' })
                      }
                      className={input}
                    >
                      <option value="advantage">advantage</option>
                      <option value="disadvantage">disadvantage</option>
                    </select>
                  </label>
                </>
              )}

              {effect.kind === 'damage-response' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Damage type</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Response</span>
                    <select
                      value={effect.response}
                      onChange={(e) =>
                        patch(index, {
                          response: e.target.value as 'resistance' | 'immunity' | 'vulnerability',
                        })
                      }
                      className={input}
                    >
                      <option value="resistance">resistance</option>
                      <option value="immunity">immunity</option>
                      <option value="vulnerability">vulnerability</option>
                    </select>
                  </label>
                </>
              )}

              {effect.kind === 'resource' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Resource key</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Recharges on</span>
                    <select
                      value={effect.recharge}
                      onChange={(e) =>
                        patch(index, { recharge: e.target.value as typeof effect.recharge })
                      }
                      className={input}
                    >
                      {['short-rest', 'long-rest', 'dawn', 'encounter', 'turn', 'never'].map(
                        (r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <FormulaField
                    label="Maximum"
                    value={effect.max}
                    onChange={(max) => patch(index, { max })}
                  />
                </>
              )}

              {effect.kind === 'grant' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Category</span>
                    <input
                      value={effect.category}
                      onChange={(e) => patch(index, { category: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Target</span>
                    <input
                      value={effect.target}
                      onChange={(e) => patch(index, { target: e.target.value })}
                      className={`${input} font-mono`}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setEffects([...effects, blank('numeric')])}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Add an effect
        </button>
      </fieldset>

      {effects.length > 0 && (
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">When does this apply?</legend>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Condition</span>
            <select
              value={when?.kind ?? 'always'}
              onChange={(e) => {
                const kind = e.target.value;
                setEntity((prev) => ({
                  ...prev,
                  grants: [
                    {
                      ...prev.grants[0]!,
                      when:
                        kind === 'always'
                          ? undefined
                          : kind === 'flag'
                            ? { kind: 'flag', flag: '' }
                            : { kind: 'expression', formula: '' },
                    },
                  ],
                }));
              }}
              className={input}
            >
              <option value="always">always</option>
              <option value="flag">while a state is active</option>
              <option value="expression">when an expression is true</option>
            </select>
          </label>

          {when?.kind === 'flag' && (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">State</span>
              <input
                value={when.flag}
                onChange={(e) =>
                  setEntity((prev) => ({
                    ...prev,
                    grants: [{ ...prev.grants[0]!, when: { kind: 'flag', flag: e.target.value } }],
                  }))
                }
                placeholder="raging"
                className={`${input} font-mono`}
              />
            </label>
          )}

          {when?.kind === 'expression' && (
            <FormulaField
              label="Expression"
              value={when.formula}
              onChange={(formula) =>
                setEntity((prev) => ({
                  ...prev,
                  grants: [{ ...prev.grants[0]!, when: { kind: 'expression', formula } }],
                }))
              }
            />
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">From class level (optional)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={atLevel ?? ''}
              onChange={(e) =>
                setEntity((prev) => ({
                  ...prev,
                  grants: [
                    {
                      ...prev.grants[0]!,
                      atLevel: e.target.value ? Number(e.target.value) : undefined,
                    },
                  ],
                }))
              }
              className={input}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">
              Trace note (shown in brackets on the sheet)
            </span>
            <input
              value={detail}
              onChange={(e) =>
                setEntity((prev) => ({
                  ...prev,
                  grants: [{ ...prev.grants[0]!, detail: e.target.value || undefined }],
                }))
              }
              placeholder="wearing armor"
              className={input}
            />
          </label>
        </fieldset>
      )}

      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Save
      </button>
    </form>
  );
}
