import Link from 'next/link';

/**
 * Renders codex prose, turning `[[key]]` into a link.
 *
 * Deliberately not a Markdown renderer. The body is user-authored text that
 * other people will read, so anything that interprets HTML would need
 * sanitising; splitting on a single known pattern and emitting React elements
 * cannot inject markup at all. Richer formatting can come later, through a
 * renderer chosen for its escaping rather than its feature list.
 *
 * A link to an entry that does not exist renders dashed rather than broken —
 * writing a link before its target is a normal way to build a world.
 */

const WIKI_LINK = /(\[\[\s*[a-z0-9]+(?:-[a-z0-9]+)*\s*\]\])/g;
const KEY = /\[\[\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\]\]/;

export function CodexBody({
  body,
  slug,
  existingKeys,
}: {
  body: string;
  slug: string;
  existingKeys: ReadonlySet<string>;
}) {
  if (!body.trim()) {
    return <p className="text-sm italic text-neutral-500">Nothing written yet.</p>;
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {body.split(/\n{2,}/).map((paragraph, p) => (
        <p key={p}>
          {paragraph.split(WIKI_LINK).map((part, i) => {
            const match = KEY.exec(part);
            if (!match?.[1]) return <span key={i}>{part}</span>;

            const key = match[1];
            const exists = existingKeys.has(key);

            return (
              <Link
                key={i}
                href={
                  exists
                    ? `/systems/${slug}/codex/${key}`
                    : `/systems/${slug}/codex/new?key=${encodeURIComponent(key)}`
                }
                className={
                  exists
                    ? 'underline underline-offset-4 hover:no-underline'
                    : 'text-neutral-500 underline decoration-dashed underline-offset-4'
                }
                title={exists ? undefined : 'Not written yet — click to create'}
              >
                {key.replace(/-/g, ' ')}
              </Link>
            );
          })}
        </p>
      ))}
    </div>
  );
}
