# TTRPG Creation Platform — Progress

**Last updated:** 2026-09-04

Living status document. Read this first to answer "where are we, what's done, what's next."
Design intent and full scope live in [PLAN.md](./PLAN.md) — this file tracks execution only.

---

## Current Status

|                  |                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Active arc**   | Arc 4 — Play                                                                                   |
| **Active phase** | Phase 10 — Dice + combat tracker                                                               |
| **Status**       | Complete                                                                                       |
| **Summary**      | Full dice notation, pure combat transitions, and a working initiative tracker. **356 tests**.  |
| **Caveats**      | No realtime sync — players refresh to see changes. House rules still raw JSON. OAuth untested. |
| **Repo**         | https://github.com/BroJustLeaveMeAlone/DnD                                                     |
| **Next up**      | Phase 11 — VTT (largest risk item; roughly doubles the project)                                |

---

## Phase Checklist

Statuses: `Not started` · `In progress` · `Complete` · `Blocked`

### Arc 1 — Foundation

| #   | Phase             | Status       | Notes                                                                      |
| --- | ----------------- | ------------ | -------------------------------------------------------------------------- |
| 0   | Foundations       | **Complete** | Monorepo, schemas, Postgres + Drizzle, auth, CI, Docker Compose            |
| 1   | Rules engine core | **Complete** | Generic from day one. Proven by a golden suite with zero 5e concepts in it |
| 2   | 5e system modules | **Complete** | Vertical slice of both editions. Engine needed no 5e special case          |

### Arc 2 — The 5e Product

| #   | Phase                     | Status       | Notes                                                                      |
| --- | ------------------------- | ------------ | -------------------------------------------------------------------------- |
| 3   | Compendium                | **Complete** | Browse, search, facets, entity pages, structured effect queries            |
| 4   | Character builder + sheet | **Complete** | Builds from DB content. Provenance on every stat                           |
| 5   | Homebrew authoring        | **Complete** | Forking, effect builder, live formula validation, character-scoped content |

> **Stopping after Arc 2 still ships a genuinely valuable free 5e character builder.**

### Arc 3 — Creation

| #   | Phase                     | Status       | Notes                                                           |
| --- | ------------------------- | ------------ | --------------------------------------------------------------- |
| 6   | System Designer           | **Complete** | Dials, custom attributes and derived stats, schema-driven sheet |
| 7   | Linter + probe characters | **Complete** | Deterministic. Caught a real bug in the 2024 module immediately |
| 8   | Codex                     | **Complete** | Wiki links, backlinks, and entries bound to real mechanics      |

> **Stopping after Arc 3 ships a creation tool nothing else offers.**

### Arc 4 — Play

| #   | Phase                 | Status       | Notes                                                  |
| --- | --------------------- | ------------ | ------------------------------------------------------ |
| 9   | Campaigns & party     | **Complete** | Roles, invites, party dashboard, house rules in traces |
| 10  | Dice + combat tracker | **Complete** | Dice notation, pure transitions, initiative tracker    |
| 11  | VTT                   | Not started  | Largest risk item. Roughly doubles the project         |

### Arc 5 — Community & Depth

| #   | Phase              | Status      | Notes                                                                  |
| --- | ------------------ | ----------- | ---------------------------------------------------------------------- |
| 12  | The Commons        | Not started | Publishing, forking, attribution chains, licensing, moderation         |
| 13  | Offline & PWA      | Not started | Service worker, IndexedDB, sync, conflict resolution                   |
| 14  | Import & export    | Not started | Native JSON, DDB import, VTT exports, PDF ingestion, sourcebook export |
| 15  | Playtest simulator | Not started | Combat simulation, balance curves vs. 5e baselines                     |
| 16  | Studio             | Not started | Map editor, token composer, card/statblock designers, theming          |
| 17  | AI layer           | Not started | Optional BYOK. Drafts and organizes; never verifies                    |
| 18  | Polish & launch    | Not started | Accessibility, i18n, onboarding, self-host packaging, legal review     |

---

## Phase 0 — Foundations (Complete)

**Goal:** a monorepo that installs, typechecks, builds, tests, and runs against a local Postgres.

### Repo & tooling

- [x] `git init` (branch `main`) + `.gitignore`
- [x] pnpm workspace (`pnpm-workspace.yaml`) — `onlyBuiltDependencies` allowlist for pnpm 10
- [x] Turborepo pipeline (`turbo.json`)
- [x] Root `package.json` with workspace scripts
- [x] Shared `tsconfig.base.json` — strict, `noUncheckedIndexedAccess`
- [x] ESLint flat config + Prettier — includes `no-eval` / `no-new-func` to protect the formula DSL
- [x] Vitest per package via turbo

### Packages

- [x] `packages/schemas` — entity envelope, entity scope, sources, subsystem dials, licences (20 tests)
- [x] `packages/rules-engine` — stub. Zero runtime deps, **asserted by a test**; Phase 1 fills it.
- [x] `packages/db` — Drizzle schema, client, migration runner, health ping (8 tests)

### App

- [x] `apps/web` — Next.js 15 App Router + React 19 + TypeScript
- [x] Tailwind v4 configured, `prefers-reduced-motion` honoured from day one
- [x] App boots and renders; `/api/health` reports app + engine + database

### Data

- [x] Drizzle schema — users, accounts, sessions, systems, entities, characters, campaigns, members
- [x] JSONB for entity bodies, dials, character build/state (PLAN.md §16)
- [x] DB-level CHECK enforcing the character-scope invariant, mirroring the Zod refinement
- [x] Migration generated and applied — 10 tables live
- [x] `docker-compose.yml` — Postgres 17, healthcheck, named volume
- [x] `.env.example` documenting every variable

### Auth

- [x] Auth.js v5 wired to the Drizzle adapter, lazy config so builds don't need a live DB
- [x] Providers registered conditionally — a clone with no OAuth apps still boots
- [ ] **Sign-in round-trip untested** — needs real Discord/Google credentials. Adapter and session
      read path work; the redirect flow itself has never been exercised.

### CI

- [x] GitHub Actions workflow: install → migrate → format → lint → typecheck → test → build
- [x] Remote wired to https://github.com/BroJustLeaveMeAlone/DnD
- [x] **CI verified green** on Node 24 against a real Postgres service container.
      First run failed: `pnpm/action-setup` rejects a `version` input when
      `packageManager` is set in package.json. Fixed by dropping the input.

---

## Phase 1 — Rules Engine Core (Complete)

**Goal:** a generic, deterministic, sandboxed engine proven by tests alone. No UI.

### Delivered

- [x] **Formula DSL** — tokenizer, Pratt parser, tree-walking interpreter. Arithmetic,
      comparison, boolean logic, 8 functions, dotted references. No `eval`, no `new Function`.
- [x] **Predicates** — `always` / `never` / `flag` / `expression` / `all` / `any` / `not`
- [x] **Effect vocabulary** — numeric, proficiency, roll-bias, damage-response, resource, grant
- [x] **Stacking** — set (highest wins) → typed/untyped adds → floors → caps
- [x] **Provenance** — every number carries a trace, including entries that did _not_ apply
- [x] **Resolution pipeline** — lazy dependency resolution, so authors never order declarations
- [x] **Diagnostics** — circular dependency, unknown reference, formula error, contradictory bounds
- [x] **117 engine tests**, including a golden suite for a system containing no 5e concepts

### Guardrails now enforced by tests

- Zero runtime dependencies
- No `eval` / `new Function` / `process.env` anywhere in engine source (comments stripped first)
- No 5e vocabulary in engine source — `spellSlot`, `armorClass`, `proficiencyBonus` etc. are banned
- Prototype-chain keys (`constructor`, `__proto__`) cannot be reached through a formula

### Deliberately deferred

- `override` effects (campaign house rules) — the mechanism exists via `set`; the campaign-scoped
  wiring lands with Phase 9.
- Resistance/vulnerability **cancellation** is not modelled. The engine reports the strongest
  response present; whether they annul each other is a per-system rules question.

---

## Phase 2 — 5e System Modules (Complete)

**Goal:** encode 2014 and 2024 independently, and prove the engine needs no 5e special case.

### Delivered

- [x] `SystemModule` type in the engine — attributes, derived stats, entities, grants. Generic.
- [x] `compile(module, build)` — turns a character's _decisions_ into engine input
- [x] `packages/systems-dnd5e` with **two independent modules** sharing only authoring helpers
- [x] Vertical slice each: 3 species, 2 backgrounds, 2 classes + subclasses, feats, armour,
      weapons, magic items, spells, conditions
- [x] **25 module tests**, over half of them asserting edition _differences_

### Edition differences encoded (the forcing function)

| Difference               | 2014                   | 2024                       |
| ------------------------ | ---------------------- | -------------------------- |
| Ability increases        | Species (human +1 all) | Background (+2/+1)         |
| Background feat          | none                   | yes                        |
| Weapon mastery           | absent                 | present, scales with level |
| Dwarf speed / darkvision | 25 ft / 60 ft          | 30 ft / 120 ft             |
| Wizard prepared spells   | INT + level            | fixed table                |
| Exhaustion               | six-rung ladder        | one scaling penalty        |
| Second Wind uses         | 1                      | 2, then 3                  |

**The engine was not modified to accommodate either edition.** Every difference is data.

### Bugs found by the post-phase review

- **Ability score increases never reached modifiers.** `compile` derived `attr.X.mod` from the raw
  chosen score before effects ran, so species and background increases landed on a stat nobody
  read. Silent — the sheet looked plausible and every derived value was wrong. Scores are now
  bases, and modifiers derive from the resolved score.
- **`save.all` was referenced by all six save formulas but never declared.** Any character without
  a Ring of Protection got six unknown-reference diagnostics and zeroed saves — the common case
  was broken, the exotic one worked.
- **Chain mail emitted duplicate effects** for a wearer with Strength below 13.
- **Hyphens in formula identifiers made `level-1` ambiguous** and silently parse as a reference
  instead of subtraction. Hyphens are now banned from identifiers; paths use underscores.

### Deliberately deferred

- Bulk SRD ingestion. Structured CC-BY datasets exist, so this becomes a mapping-and-verification
  job rather than transcription.
- `buildSheet` resolves twice to discover `state` grants (armour category, shield) that later
  predicates read. It works and is cheap, but a single-pass design would be cleaner.

---

## Phase 3 — Compendium (Complete)

**Goal:** get content out of TypeScript and into Postgres, and make it browsable.

### Delivered

- [x] JSON serialisation for effects, predicates, and grants. Formulas store as **source text**,
      so stored content stays readable and diffable for homebrew version history.
- [x] `seedSystemModule` — idempotent module → Postgres ingestion, plus `pnpm db:seed`
- [x] Query layer: search, type facets, single-entity fetch, ruleset scoping
- [x] **Structured effect queries** — "everything that touches AC", "every source of resistance".
      Possible only because content is data rather than licensed prose.
- [x] `/compendium` — search, ruleset filter, type facets with counts
- [x] `/compendium/[system]/[key]` — details, human-readable mechanics, back-references
- [x] **14 integration tests against real Postgres**, loading `.env` so they run locally too
      rather than silently skipping

### Verified live

All routes returned 200 against a booted production server with seeded data: browse, filtered
browse, search, and both entity pages. The Ring of Protection page correctly cross-links to Chain
Mail, Mage Armor, Shield, and the Defense fighting style purely by structural effect matching.

### Review findings fixed

- **`findByEffect` used a lateral `jsonb_array_elements` join**, which forces a sequential scan
  over the whole compendium. Rewritten as nested jsonb containment and backed by a GIN index —
  fine at 50 entities, not fine at 50,000.
- Effect descriptions rendered "sets ac by 16"; each operation now reads correctly in English.
- `aria-current="true"` on facet links corrected to `aria-current="page"`.

---

## Phase 4 — Character Builder + Sheet (Complete)

**Goal:** characters that build from database content and a sheet that shows its own reasoning.

### Delivered

- [x] `systems.definition` column — attributes, derived stats, source. The non-entity half of a
      SystemModule, so a system can be reconstructed entirely from the database.
- [x] `loadSystemModule(db, slug)` — DB rows → `SystemModule`, deserialising grants
- [x] Character CRUD with **ownership enforced in the WHERE clause**, not a prior read
- [x] `/characters`, `/characters/new` (options scoped to the chosen ruleset), `/characters/[id]`
- [x] `StatValue` — provenance via `<details>`/`<summary>`, so it works with no JS, is
      keyboard-navigable and screen-reader-announced, and survives the Phase 13 offline work
- [x] Equip / attune toggles that recompute the sheet
- [x] Development-only sign-in (see CREDENTIALS.md) — without it no authenticated page was
      reachable, since no OAuth app is registered
- [x] `characterBuild` Zod schema validating untrusted build JSON

### The load-bearing test

**A DB-loaded module must produce a byte-identical sheet to the TypeScript module.** If
serialisation loses a formula, a predicate, or a level gate, every user's sheet is silently wrong.
Asserted for both editions, plus explicit coverage that conditional predicates and level gates
survive the round-trip.

### Verified live

Signed in, created a level 5 Champion fighter, and confirmed against a booted production server:
AC 20 with a five-line trace, HP 49, saves including the ring bonus, skills with proficiency, and
the chain-mail speed penalty correctly _suppressed_ with its reason shown. Unauthenticated access
to a character sheet returns a 307 redirect.

### Review findings fixed

- **`updateBuildAction` wrote unvalidated JSON from a hidden form field straight to the database.**
  Now validated against a Zod schema, with tests covering the payloads an attacker would actually
  send.
- The web app imported `drizzle-orm` directly for dev sign-in. Session helpers moved into
  `@ttrpg/db`, which owns the ORM — the same boundary fixed in Phase 0.

---

## Phase 5 — Homebrew Authoring (Complete) — Arc 2 finished

**Goal:** a non-programmer can fork a ruleset and author content that actually calculates.

### Delivered

- [x] **Forking** — copies every entity into a system the user owns. A snapshot, not a reference:
      the point of forking is that the original stops moving under you.
- [x] `upsertEntity` / `deleteEntity`, ownership enforced in the WHERE clause
- [x] **Structured effect builder** — dropdowns and typed fields, not raw JSON. Six effect kinds,
      conditions, level gates, trace notes.
- [x] **Live formula validation** against the real parser, so an accepted formula cannot fail
      later. Shows which references a formula depends on.
- [x] Server-side re-validation: schema shape _and_ every formula parsed before any DB write
- [x] `/systems`, `/systems/[slug]`, `/systems/[slug]/new`, `/systems/[slug]/[key]`
- [x] Character-scoped content — private to one character, excluded from compendium listings
- [x] Version bump on edit, so pinned consumers can opt in

### Verified live

Forked a ruleset (26 entities copied), authored a feat granting
`floor(level / 4) + 1` AC and lightning immunity gated on `level >= 3`, and confirmed a level 8
character resolves to AC 19 with the homebrew in its provenance trace and zero diagnostics.
Unauthenticated access to an owned system returns a 307.

### Review finding — a silent data-loss bug

**`UNIQUE (system_id, key)` meant two characters could not each own private content under the
same key** — and the upsert would have _overwritten_ one character's content with another's rather
than failing. Two sorcerers both naming a technique `domain` is the ordinary case, not an edge
case. Fixed with `UNIQUE NULLS NOT DISTINCT (system_id, key, character_id)`: system keys stay
unique per system, character keys stay unique per character. Postgres treats NULLs as distinct by
default, so `NULLS NOT DISTINCT` is the load-bearing half — without it the constraint would permit
unlimited duplicate system-scoped keys.

### Deliberately deferred

- The effect builder edits **one grant per entity**. Enough for feats, items, species, and
  conditions; a full class needs many grants at different levels, which is a repeater UI rather
  than a new concept.
- No fork _diff_ view yet — you cannot see what your fork changed relative to its parent. That
  belongs with the Commons attribution work in Phase 12.

---

## Phase 6 — System Designer (Complete)

**Goal:** define what a system _is_, and render any system's sheet from its own schema.

### Delivered

- [x] **Per-subsystem dials** — ten subsystems, each independently inherited / tweaked / replaced.
      A system with no parent may only declare `replaced`, enforced in the UI and the schema.
- [x] **Attribute editor** — your own stat block, with modifier formulas
- [x] **Derived stat editor** — AC is not special; it is one of these
- [x] **Per-system proficiency scale** — "expertise doubles your bonus" is a 5e rule, so it moved
      out of the engine and into the module
- [x] **`AutoSheet`** — the character sheet now renders from `module.attributes` and
      `module.derived`. Nothing in it knows what an ability score or an Armor Class is.
- [x] Server-side validation of the whole definition, including parsing every formula
- [x] **6 designer tests**, building a cursed-energy system entirely through the database

### The test that matters

A system with **no 5e concepts at all** — cursed energy and body instead of ability scores, a
named grade track instead of levels, technique output and barrier instead of AC — built through
the same data path a user would use, and resolved from database rows. Verified live: the sheet
renders `CE +14 · BDY +10 · Grade 4 · Technique Output 70 · Barrier 15`, with no 5e stat present.

### Review finding

Replacing the hardcoded 5e sheet with `AutoSheet` **silently regressed formatting** — Initiative
lost its `+` sign and critical range lost its `+` suffix, because those were hardcoded 5e
formatters. Fixed by moving presentation into module data (`display: { signed, suffix }`) rather
than reintroducing 5e assumptions into generic code or letting the renderer guess.

### Deliberately deferred

- **Starter kits.** Forking 5e is the only starting point; PLAN.md also wants grimdark, superhero,
  and shonen-action templates. Those are content, not mechanism.
- The designer has no **live formula feedback** — the server rejects a bad formula with a message,
  but the effect builder's as-you-type validation is not wired in here yet.
- Removing an attribute that formulas reference degrades with a diagnostic rather than warning
  first. That warning is exactly Phase 7.

---

## Phase 7 — Linter + Probe Characters (Complete)

**Goal:** find broken content at authoring time, before a player does.

### Delivered

- [x] **Static analysis** in the engine — zero dependencies, deterministic, works offline.
      Ten rules: unknown references, unparseable formulas, duplicate keys, shadowed attributes,
      undeclared effect targets, unreachable level grants, inert entities, unused attributes.
- [x] **Probe characters** — one build per class at every level, resolved and checked for
      non-finite values, runaway magnitudes, and resolution diagnostics
- [x] `/systems/[slug]/lint` — findings grouped by severity, each linking to the editor that
      fixes it
- [x] **20 linter tests**, plus a test asserting **both bundled rulesets lint clean**

### It found a real bug on its first run

The 2024 exhaustion condition referenced `exhaustion.level`, which nothing declared. The predicate
read the missing reference as 0, so **2024 exhaustion silently never fired** — no error, no
diagnostic, just a rule that did nothing. This is precisely the failure mode the phase exists for.

Also surfaced: the Wizard's spell attack bonus, save DC, and prepared-spell count computed
correctly but were never declared, so they rendered nowhere. Now declared, with a rule in
`AutoSheet` that hides a stat nothing has touched — so a fighter does not see "Spell Save DC 0".

### Review finding

The linter's first run also produced 15 false positives: it treated attribute score paths as
undeclared because it only consulted `module.derived`. Every species that raises an ability score
looked broken. Fixed before the rule could train anyone to ignore it.

### Deliberately deferred

- **Balance diagnostics** — damage-per-round and AC curves plotted against 5e baselines. That
  needs the combat simulator and belongs with Phase 15.
- The linter runs on demand. Running it automatically on save, and blocking a publish with errors,
  belongs with the Commons in Phase 12.

---

## Phase 8 — Codex (Complete) — Arc 3 finished

**Goal:** world-building prose that connects to mechanics.

### Delivered

- [x] `codex_entries` — ten entry types, per-system, with visibility
- [x] **Wiki links** written `[[key]]`, extracted on write and stored denormalised so backlinks are
      an indexed lookup rather than a scan over everyone's prose
- [x] **Backlinks** — an entry sees everything that references it
- [x] **Mechanical binding** — `entityKey` ties an entry to a real content entity, so an NPC
      carries an actual statblock and an artifact _is_ the item. World Anvil has lore without
      mechanics; D&D Beyond has mechanics without lore. This is the join.
- [x] **Dangling links** surfaced as "Unwritten" rather than errors — writing a link before its
      target is a normal way to build a world, and each one is a one-click stub
- [x] `/systems/[slug]/codex`, entry pages, and a combined create/edit form
- [x] **14 codex tests**

### A deliberate non-choice

`CodexBody` is **not** a Markdown renderer. Entry bodies are user-authored text that other people
will read, so anything interpreting HTML would need sanitising to be safe. Splitting on one known
pattern and emitting React elements cannot inject markup at all. Richer formatting can come later
through a renderer chosen for its escaping rather than its feature list.

### Deliberately deferred

- The Codex is **system-scoped**. Campaign-scoped lore, DM-private notes, and reveal-to-players
  mechanics need campaigns, which is Phase 9.
- No timelines or calendars yet.

---

## Phase 9 — Campaigns & Party (Complete)

**Goal:** a table, with roles, a party view, and rules the GM can bend.

### Delivered

- [x] Campaigns with **membership-scoped** reads — a player is not the owner but must still see the
      party, so authorisation is membership in the WHERE clause, never a prior read
- [x] **Invite tokens**, rotatable. Rotating invalidates every link previously handed out, which is
      the only way to un-invite someone who shared one. Only the GM ever sees the token.
- [x] Roles (gm / player / spectator), with **the last GM protected** from demotion and removal —
      a campaign nobody can administer is unrecoverable through the UI
- [x] **Party dashboard** resolving every member's sheet against the campaign's ruleset
- [x] **House rules as ordinary effects**, bound to the campaign as their source — so a capped AC
      shows "Campaign house rule" in the provenance trace rather than silently disagreeing with the
      book
- [x] **19 campaign tests**, mostly authorisation edge cases

### Invariants worth naming

- The campaign creator is inserted as a **GM member**, not merely recorded as owner. Otherwise
  every membership-scoped read would exclude them from their own table.
- Joining is **idempotent** — following an invite twice must not fail, and must never demote a GM
  who clicks their own link.
- A character must belong to the assigning user **and** to the campaign's system. A mismatched
  character would be resolved against the wrong ruleset on the dashboard.
- A malformed house rule is skipped rather than throwing, so one bad rule cannot take down the
  whole party view.

### Deliberately deferred

- House rules are edited as **raw JSON**. The effect builder from Phase 5 should be reused here;
  it needs a mode that is not tied to an entity.
- No session log, quest tracker, or shared party inventory yet.

---

## Phase 10 — Dice + Combat Tracker (Complete)

**Goal:** run a fight, with real dice.

### Delivered

- [x] **Dice notation** — counts, sides, constants, signs, keep/drop highest/lowest, rerolls
      (`r` and `ro`), exploding, min/max clamps. Bounded at 1000 dice and 1000 sides.
- [x] **Randomness is injected, never sourced.** A seeded generator replays a roll exactly, which
      the shared roll feed will depend on — a client and a server replaying one roll must agree.
- [x] **Pure combat transitions** in the engine: damage, healing, temporary hit points, conditions,
      concentration, death saves, turn advance. State in, new state out, no mutation, no I/O.
- [x] `encounters` table — one JSONB document per encounter, so a turn advance is one atomic write
- [x] Initiative tracker UI: add combatants, damage/heal (accepts `2d6+3`), temp HP, conditions
      with durations, death saves, turn advance, roll log
- [x] **72 new engine tests** (44 dice, 28 combat)

### Rules decisions worth naming

- **Temporary hit points are a separate pool** absorbing damage before it reaches current HP, and
  they replace rather than stack. Getting either backwards silently inflates effective health.
- **Dropping to zero ends concentration outright** — no save is offered, which is correct 5e and
  easy to get wrong.
- **Healing from negative HP heals from zero**, not from the deficit. Healing 5 at −6 gives 5.
- **Conditions tick at the end of the affected combatant's turn**, not the end of the round.
  Ticking per round would make "1 round" mean different lengths depending on initiative. A
  condition applied during the target's own turn therefore expires when that turn ends — documented
  and tested rather than special-cased.
- **Initiative tiebreaks are rolled once and stored.** Re-deriving them per render would reorder
  the list mid-combat.
- The 10-point concentration threshold is **passed in, not assumed** — that number is a 5e rule, so
  a system without concentration passes null.

### Deliberately deferred

- **No realtime sync.** Players must refresh to see the tracker change. PLAN.md wants WebSockets
  here; the state document is already shaped for it, but it is a phase of its own.
- No encounter builder, XP budgets, or monster import from the compendium.

### Phase 0 exit criteria

- [x] `pnpm install` succeeds
- [x] `pnpm run format:check` passes
- [x] `pnpm run lint` passes
- [x] `pnpm run typecheck` passes
- [x] `pnpm run test` passes — 28 tests
- [x] `pnpm run build` passes — 4 routes
- [x] `docker compose up` brings up Postgres; migrations apply
- [x] Web app boots; `/api/health` returns `{"status":"ok"}` with `database: ok`

---

## Environment Notes

Real facts about this machine. **Read before running anything** — several of these will bite a future session.

|             |                             |
| ----------- | --------------------------- |
| OS          | Windows 10 Pro (10.0.19045) |
| Working dir | `C:\dev\DnD`                |

**Port conflicts on this machine.** Unrelated running containers hold the defaults, so this repo's
`.env` is remapped. `.env.example` keeps the standard defaults for a clean machine.

| Service  | Default | Used here | Held by                                   |
| -------- | ------- | --------- | ----------------------------------------- |
| Postgres | 5432    | **5433**  | `dm-clean-postgres-1` (unrelated project) |
| Web      | 3000    | **3001**  | `dm-clean-ui-1` (unrelated project)       |

Do not stop those containers — they belong to other work.
| Node | v24.14.0 |
| npm | 11.9.0 |
| pnpm | 10.34.5 |
| Docker | 29.6.1 |
| git | 2.53.0.windows.2 |

### Gotchas

- **`corepack enable` FAILS** — `EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm'`. It needs admin rights. Do not use it.
  → pnpm was installed instead via `npm install -g pnpm@10`, landing in `C:\Users\owner\AppData\Roaming\npm` (user-writable, already on PATH).

- **Git Bash coreutils are BROKEN.** `ls`, `rm`, `head` and friends all fail with:
  `msys-intl-8.dll: cannot open shared object file: No such file or directory`
  → **Use PowerShell for all shell operations, not the Bash tool.** Node, npm, pnpm, git and docker binaries themselves work fine from either shell; it is specifically the msys coreutils that are broken.

- Repo is **not yet a git repository** — `git init` is part of Phase 0.

---

## Decisions Log

Rationale, so it isn't re-litigated or lost.

| Date       | Decision                                                         | Why                                                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | **Repositioned from D&D Beyond clone → TTRPG creation platform** | D&D Beyond's moat is licensed content and it is legally uncrossable — SRD grants one subclass per class vs. their hundreds. Competing there means losing on their strongest axis. Aim where they structurally cannot follow: creation freedom. |
| 2026-09-04 | **5e is a data module, not the engine**                          | Non-retrofittable. If the engine ships `character.strength` as a field, custom worlds are permanently impossible. It must ship `character.attributes[id]`. Generality lives in the engine; polish lives in the module.                         |
| 2026-09-04 | **Per-subsystem dials, not complexity tiers**                    | Tiers are a false discretization with cliffs. Each subsystem is independently inherited / tweaked / replaced. JJK = six dials moved, three left alone; a 5e house rule = one dial moved. Same interface, no graduation.                        |
| 2026-09-04 | **VTT included** (world + battle maps)                           | A world-creation platform that can't run the world is incomplete. Accepted knowing it roughly doubles the project and puts us against Foundry.                                                                                                 |
| 2026-09-04 | **AI is an optional BYOK layer that drafts but never verifies**  | "Won't break" is a validation problem, better solved deterministically by the linter and simulator. AI drafts and organizes; the deterministic layer decides correctness. Every workflow must be completable with AI disabled.                 |
| 2026-09-04 | **Character-scoped content is first-class in the schema**        | Most systems outside D&D have content unique to one character (a JJK cursed technique). Entities carry a `scope` — system library or single character. Painful to retrofit later.                                                              |
| 2026-09-04 | **Characters store decisions, not computed results**             | A level 4 ASI is a decision node, not `+2 STR`. Enables retroactive recomputation on homebrew edits, respec, level-down, undo, and sheet time-travel.                                                                                          |
| 2026-09-04 | **Sandboxed formula DSL, no `eval`**                             | All user content is untrusted. Also required for determinism and offline execution.                                                                                                                                                            |

---

## Open Questions & Risks

Carried from [PLAN.md](./PLAN.md) §Key Risks. Reviewed each phase boundary.

| Risk                                                   | Severity | Mitigation                                                                                                                                           | Status   |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Scope** — large multi-year project                   | High     | Arc ordering: Arc 2 ships a real 5e builder, Arc 3 a unique creation tool. Each arc independently valuable.                                          | Accepted |
| **Freedom vs. usability** — hardest design constraint  | High     | Inheritance defaults, fork-don't-create, guided forms, progressive disclosure. Needs defending in _every_ UI decision.                               | Ongoing  |
| **VTT roughly doubles the project**                    | High     | Deliberately accepted. Build data-driven so custom systems aren't second-class.                                                                      | Accepted |
| **Generality vs. 5e polish**                           | Medium   | Structural: 5e ships hand-tuned layouts and bespoke components; auto-generation is the fallback, never the 5e path.                                  | Ongoing  |
| **Content encoding volume** — SRD → structured effects | Medium   | Large, unglamorous, manual data job on the critical path. No architectural fix. Budget for it in Phase 2.                                            | Open     |
| **Cold-start problem** — empty commons is worthless    | Medium   | Seeding with high-quality starter kits and complete example worlds is a launch requirement, not a follow-up.                                         | Open     |
| **Moderation & IP exposure**                           | Medium   | DMCA agent + takedown process; publish-step UI making private-vs-public obvious. Fan-recreation systems are exactly what users will want to publish. | Open     |

### Unresolved

- [ ] Hosting target for the public instance (Fly vs. Railway) — deferred, not needed until Arc 4
- [ ] Object storage provider for maps/tokens/portraits — deferred until Phase 11 (VTT) / Phase 16 (Studio)
- [ ] Legal review before public launch — required, not yet scheduled

---

## Changelog

| Date       | Change                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | PLAN.md rewritten: repositioned to creation platform, VTT added, custom systems promoted to Arc 3, AI layer added, Studio/Codex/Commons pillars added, work order expanded to 19 phases across 5 arcs |
| 2026-09-04 | PROGRESS.md created. Phase 0 started — tooling verified, pnpm installed                                                                                                                               |
