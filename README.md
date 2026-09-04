# TTRPG Creation Platform

A platform for **making and playing tabletop RPGs**. D&D 5e (2014 and 2024) ships as the starter
kit — fully playable, no paywalls on homebrew or sharing — but it is a starting point you fork,
not a ceiling you bend against. Change one house rule, or build an entirely new system with its
own attributes, resources, progression, and power systems, using the same tools.

See [PLAN.md](./PLAN.md) for the full product vision and [PROGRESS.md](./PROGRESS.md) for current
status.

> **Status: Phase 0 (Foundations) complete.** The rules engine lands in Phase 1.

## Requirements

- Node.js >= 20.9 (developed on 24.x)
- pnpm 10 — `npm install -g pnpm@10`
- Docker (for Postgres)

## Setup

```bash
pnpm install
cp .env.example .env          # then fill in AUTH_SECRET
npx auth secret               # generates one, or: openssl rand -base64 32

pnpm run db:up                # start Postgres
pnpm run db:migrate           # apply migrations
pnpm run dev                  # http://localhost:3000
```

Verify the stack end to end:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","checks":{"app":"ok","rulesEngine":"...","database":"ok"}}
```

> **Port conflicts.** If 5432 or 3000 are already taken, change `POSTGRES_PORT` and the port in
> `DATABASE_URL` together, and run the app with `PORT=3001`. Compose reads `POSTGRES_PORT` for the
> host-side binding.

## Layout

```
apps/
  web/              Next.js App Router — UI, API routes, auth
packages/
  rules-engine/     Pure, deterministic, zero-dependency. The crown jewel.
  schemas/          Zod schemas shared by client, server, and importers
  db/               Drizzle schema, migrations, client
```

## Commands

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `pnpm run dev`         | Run everything in watch mode                 |
| `pnpm run check`       | format + lint + typecheck + test             |
| `pnpm run build`       | Production build of every package            |
| `pnpm run test`        | Test suites                                  |
| `pnpm run db:up/down`  | Start / stop Postgres                        |
| `pnpm run db:generate` | Generate a migration from the Drizzle schema |
| `pnpm run db:migrate`  | Apply pending migrations                     |
| `pnpm run db:studio`   | Drizzle Studio                               |

## Architecture

**5e is not the engine. 5e is the first system module.**

Everything 5e-specific — six abilities, proficiency bonus, AC, spell slots, class levels, rests —
is defined in a `dnd5e-*` data module using the same primitives a user gets. Nothing about 5e is
hardcoded in `packages/rules-engine`.

This is not retrofittable. If the engine ships with `character.strength` as a field, custom worlds
are permanently impossible. If it ships with `character.attributes[id]`, they aren't.

The rules engine holds to four constraints, enforced by lint rules and tests:

- **Zero runtime dependencies** — asserted by a test in the package
- **Isomorphic** — identical on server and client; offline play depends on it
- **Deterministic** — randomness is injected by the caller, never sourced internally
- **Sandboxed** — the formula DSL is parsed and interpreted; no `eval`, no `new Function`, because
  all content is untrusted user input

## Licensing

SRD 5.1 and SRD 5.2.1 are used under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
Product Identity (beholders, mind flayers, named settings and characters) is not in the SRD and is
not included. This project is not affiliated with or endorsed by Wizards of the Coast.
