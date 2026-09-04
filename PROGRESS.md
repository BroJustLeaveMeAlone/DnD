# TTRPG Creation Platform — Progress

**Last updated:** 2026-09-04

Living status document. Read this first to answer "where are we, what's done, what's next."
Design intent and full scope live in [PLAN.md](./PLAN.md) — this file tracks execution only.

---

## Current Status

|                  |                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Active arc**   | Arc 1 — Foundation                                                                                                                                              |
| **Active phase** | Phase 1 — Rules engine core                                                                                                                                     |
| **Status**       | Complete                                                                                                                                                        |
| **Summary**      | Formula DSL, predicates, effect vocabulary, stacking, provenance, resolution pipeline. **146 tests** across the workspace, 117 in the engine. Build + DB green. |
| **Caveats**      | OAuth sign-in round-trip still untested (no provider credentials registered).                                                                                   |
| **Repo**         | https://github.com/BroJustLeaveMeAlone/DnD                                                                                                                      |
| **Next up**      | Phase 2 — 5e system modules (2014 + 2024 as independent data modules)                                                                                           |

---

## Phase Checklist

Statuses: `Not started` · `In progress` · `Complete` · `Blocked`

### Arc 1 — Foundation

| #   | Phase             | Status       | Notes                                                                        |
| --- | ----------------- | ------------ | ---------------------------------------------------------------------------- |
| 0   | Foundations       | **Complete** | Monorepo, schemas, Postgres + Drizzle, auth, CI, Docker Compose              |
| 1   | Rules engine core | **Complete** | Generic from day one. Proven by a golden suite with zero 5e concepts in it   |
| 2   | 5e system modules | Not started  | 2014 + 2024 as independent data modules. The forcing function for generality |

### Arc 2 — The 5e Product

| #   | Phase                     | Status      | Notes                                                                    |
| --- | ------------------------- | ----------- | ------------------------------------------------------------------------ |
| 3   | Compendium                | Not started | Browse, search, entity pages, structured queries, source filtering       |
| 4   | Character builder + sheet | Not started | Largest single phase                                                     |
| 5   | Homebrew authoring        | Not started | Entity editors, effect builder, formula editor, character-scoped content |

> **Stopping after Arc 2 still ships a genuinely valuable free 5e character builder.**

### Arc 3 — Creation

| #   | Phase                     | Status      | Notes                                                             |
| --- | ------------------------- | ----------- | ----------------------------------------------------------------- |
| 6   | System Designer           | Not started | Per-subsystem dials, starter kits, forking, auto-generated sheets |
| 7   | Linter + probe characters | Not started | Deterministic. What makes creation freedom survivable             |
| 8   | Codex                     | Not started | Lore entries cross-linked to real mechanics                       |

> **Stopping after Arc 3 ships a creation tool nothing else offers.**

### Arc 4 — Play

| #   | Phase                 | Status      | Notes                                                   |
| --- | --------------------- | ----------- | ------------------------------------------------------- |
| 9   | Campaigns & party     | Not started | Roles, dashboard, GM tools, house rules, party analysis |
| 10  | Dice + combat tracker | Not started | Standalone-usable for in-person tables                  |
| 11  | VTT                   | Not started | Largest risk item. Roughly doubles the project          |

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
- [x] Remote wired to https://github.com/BroJustLeaveMeAlone/DnD — first push exercises the workflow

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
