import { getDatabase, listCharacters } from '@ttrpg/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function CharactersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const characters = await listCharacters(getDatabase(), session.user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Characters</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {characters.length === 0
              ? 'Nothing here yet.'
              : `${characters.length} ${characters.length === 1 ? 'character' : 'characters'}`}
          </p>
        </div>
        <Link
          href="/characters/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          New character
        </Link>
      </header>

      {characters.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Create one to see the sheet compute itself.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {characters.map((character) => {
            const classes = character.build.classes ?? [];
            const level = classes.reduce((sum, c) => sum + c.level, 0);
            return (
              <li key={character.id}>
                <Link
                  href={`/characters/${character.id}`}
                  className="-mx-2 block rounded px-2 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{character.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {character.systemName}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {level > 0
                      ? `Level ${level} ${classes.map((c) => c.key).join(' / ')}`
                      : 'No class chosen'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
