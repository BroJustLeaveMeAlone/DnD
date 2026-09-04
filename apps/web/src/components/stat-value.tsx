import type { DerivedValue } from '@ttrpg/rules-engine';

/**
 * A derived number with its provenance attached.
 *
 * Uses <details>/<summary> rather than a JS popover so it works without
 * hydration, is keyboard-navigable and screen-reader-announced for free, and
 * survives the offline/PWA work in Phase 13 unchanged.
 *
 * Suppressed entries are shown, dimmed, with their reason. "Why is my rage
 * bonus missing" is the question players actually ask, and hiding the losers
 * makes it unanswerable.
 */
export function StatValue({
  label,
  derived,
  format,
}: {
  label: string;
  derived: DerivedValue | undefined;
  format?: (value: number) => string;
}) {
  if (!derived) {
    return (
      <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-400">—</p>
      </div>
    );
  }

  const shown = format ? format(derived.value) : String(derived.value);
  const contributors = derived.trace.filter((e) => e.applied).length;

  return (
    <details className="group rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <summary className="cursor-pointer list-none">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className="mt-1 block text-2xl font-semibold tabular-nums">{shown}</span>
        {derived.trace.length > 0 && (
          <span className="mt-1 block text-[10px] text-neutral-400 group-open:hidden">
            {contributors} {contributors === 1 ? 'source' : 'sources'}
          </span>
        )}
      </summary>

      {derived.trace.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-xs dark:border-neutral-800">
          {derived.trace.map((entry, i) => (
            <li
              key={`${entry.sourceId}-${i}`}
              className={`flex gap-2 ${entry.applied ? '' : 'text-neutral-400 line-through decoration-neutral-300'}`}
            >
              <span className="w-10 shrink-0 text-right font-mono tabular-nums">
                {entry.operation === 'add' && entry.amount >= 0 ? '+' : ''}
                {entry.amount}
              </span>
              <span className="flex-1">
                {entry.sourceName}
                {entry.sourceDetail && (
                  <span className="text-neutral-500"> [{entry.sourceDetail}]</span>
                )}
                {!entry.applied && entry.suppressedBy && (
                  <span className="block text-[10px] text-neutral-400 no-underline">
                    {entry.suppressedBy}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));
