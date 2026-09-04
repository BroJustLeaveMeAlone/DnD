# TTRPG Creation Platform — Product Vision

## Context

This started as a D&D Beyond alternative without the paywalls. Investigating the gap changed the target.

D&D Beyond's real moat is **licensed content**, and it cannot be crossed. The SRD grants us one subclass per class; they have hundreds, plus every sourcebook and published adventure. That is a legal wall, not a technical one, and no architecture defeats it. Competing there means losing to a better-funded product on its strongest axis.

So the product is aimed where they structurally cannot follow: **creation freedom**.

This is a platform for **making and playing tabletop RPGs**. 5e (2014 and 2024) ships as the flagship starter kit — fully playable, fully supported, and free of every paywall D&D Beyond puts on homebrew and sharing. But 5e is a starting point you fork, not a ceiling you bend against. A user can change one house rule, or build Jujutsu Kaisen from scratch with cursed energy, grades, and character-unique techniques, using the same tools.

**Target outcome:** anyone can build a game world at any depth — reskin, remix, or ground-up — write its story and characters, design its look, publish it freely for others to fork, and actually play it at a virtual table.

### Decisions locked in

| Decision       | Choice                                                              |
| -------------- | ------------------------------------------------------------------- |
| Positioning    | TTRPG creation platform; 5e is the starter kit, not the product     |
| Platform       | Web app, responsive, installable PWA with offline support           |
| Bundled rules  | 5e 2014 (SRD 5.1) and 5e 2024 (SRD 5.2.1), side by side             |
| Creation depth | Per-subsystem dials — inherit, tweak, or replace, independently     |
| VTT            | **Included.** World maps and battle maps, tokens, fog, live play.   |
| Story/lore     | Full codex, cross-linked to mechanics                               |
| Commons        | Free publishing, forking-first, attribution chains                  |
| AI             | Optional, bring-your-own-key. Drafts and organizes; never verifies. |
| Audience       | Public service with accounts; self-host mode supported              |
| Monetization   | None planned. No paywalls on content, homebrew, or sharing.         |

---

## The Central Architectural Bet

**5e is not the engine. 5e is the first system module.**

```
┌──────────────────────────────────────────────────────────┐
│  Apps: sheet · compendium · codex · campaign · VTT       │
├──────────────────────────────────────────────────────────┤
│  Renderers: sheet layout · statblock · map · card        │
├──────────────────────────────────────────────────────────┤
│  System modules (data, not code)                         │
│   • dnd5e-2014   • dnd5e-2024   • <your world>           │
├──────────────────────────────────────────────────────────┤
│  Rules engine — generic, pure, deterministic             │
│   entities · grants · effects · formulas · stacking      │
└──────────────────────────────────────────────────────────┘
```

Everything 5e-specific — six abilities, proficiency bonus, AC, spell slots, class levels, short and long rests — is **defined in the `dnd5e-2024` module using the exact primitives a user gets.** Nothing about 5e is hardcoded in the engine.

This cannot be retrofitted. If the engine ships with `character.strength` as a field, custom worlds are permanently impossible. If it ships with `character.attributes[id]`, they aren't.

The corollary that keeps this from becoming an unusable abstraction: **generality lives in the engine, polish lives in the module.** The 5e modules ship hand-authored sheet layouts, bespoke components, and curated creation flows. Custom systems get auto-generated equivalents plus tools to refine them. Someone building a 5e character should never see or feel the abstraction.

---

## 1. Rules Engine

Pure TypeScript, zero runtime dependencies, identical on server and client (required for offline). Everything else is UI over this.

### Primitives

- **Entity** — any content: species, class, subclass, background, feat, spell/power, item, monster, condition, rule. Uniform envelope: `{ id, type, systemId, scope, source, version, name, body, grants[] }`.
- **Scope** — an entity lives in a system's shared library **or on a single character.** Character-scoped content is a first-class case, not an afterthought: a JJK cursed technique is unique to one person, and most systems outside D&D have content like this. Retrofitting it later is painful.
- **Grant** — what an entity gives, and when: at creation, at class level 3, while equipped, while attuned, while a condition is active.
- **Effect** — a typed mechanical change:
  - `modifier` — typed numeric change to a target stat
  - `set` / `floor` / `cap` — force, raise-to, or clamp
  - `proficiency` — none / half / proficient / expertise
  - `resource` — a pool: max formula, recharge trigger, spend granularity, optional tiers
  - `advantage` / `disadvantage` on a named roll category
  - `resistance` / `immunity` / `vulnerability`
  - `action` — grants a usable action, bonus action, or reaction
  - `casting` — grants a power list, progression, casting attribute, preparation model
  - `choice` — prompts the player to decide
  - `sense` — darkvision, tremorsense, custom senses
  - `movement` — walk/fly/swim/climb/burrow, absolute or derived
  - `override` — replace a core formula outright (the house-rule mechanism)
- **Predicate** — when an effect applies: `always`, `while raging`, `wearing no armor`, `vs. spell saves`, `if level >= 5`. Composable with and/or/not. Permanent predicates cover self-imposed tradeoffs like binding vows.
- **Formula** — a sandboxed expression DSL: `10 + attr.dex.mod + prof`. **No `eval`, no arbitrary JS** — mandatory for security (all user content is untrusted), determinism, and offline execution. Typed, with autocomplete and static validation.

### Resolution pipeline

1. **Collect** — species, background, class levels, feats, equipped and attuned items, active conditions, buffs, campaign house rules, character-scoped content
2. **Flatten** into one effect list
3. **Filter** by predicate against current state
4. **Group** by target stat
5. **Stack** — untyped sums; same-type takes highest; `set` beats `add`; competing base calculations resolve highest-wins; floors and caps last
6. **Emit** a derived sheet **plus a provenance trace for every number**

### Provenance

Tap any value and see where it came from:

```
AC 18 = 11  Studded Leather (base)
         +3  DEX modifier
         +1  Ring of Protection      [attuned]
         +1  Defense fighting style  [wearing armor]
         +2  Shield of Faith         [concentration, 10 min]
```

A genuine differentiator, the only sane way to debug homebrew, and the engine's own test oracle.

### Decisions, not results

A character stores **the choices the player made**, never computed outcomes. A level 4 ASI is a decision node, not `+2 STR`.

This buys retroactive recomputation when homebrew changes, working respec and level-down, flagged-not-vanished invalidated choices, and a full event log with real undo and version history.

---

## 2. System Designer — Per-Subsystem Dials

The core creation surface. **There are no difficulty tiers and no graduation.** A system is a set of independent subsystems, each in one of three states:

- **Inherited** — using 5e's, untouched
- **Tweaked** — 5e's, modified through guided UI, no formulas required
- **Replaced** — yours, built from scratch

Every dial moves on its own. Jujutsu Kaisen made concrete:

| Subsystem         | State                                                 |
| ----------------- | ----------------------------------------------------- |
| Attributes        | Replaced                                              |
| Progression       | Replaced — Grade 4 → Special Grade, not levels        |
| Resources         | Replaced — cursed energy, variable spend              |
| Powers            | Replaced — cursed techniques, mostly character-unique |
| Combat resolution | Inherited from 5e                                     |
| Health & damage   | Inherited from 5e                                     |
| Items, conditions | Tweaked                                               |

That is not a "tier." It is six dials moved and three left alone. A 5e homebrew with one house rule is the same interface with one dial moved. Same tool, no cliff.

**Two properties make this work:**

- **Always playable.** Anything not replaced falls back to inherited, so there is no broken half-built state. You can run a session at any point during construction.
- **Incrementally extractable.** Start a normal 5e campaign, decide mid-way you want mana instead of spell slots, flip that one dial, and existing characters migrate.

### What each dial can define

- **Attributes** — your own stat block. Name, abbreviation, derivation (`floor((v-10)/2)`, `= v`, or custom), range, defaults, display order.
- **Derived stats** — AC is not special. Define Dodge, Ward, Resolve, Sanity Threshold, anything with a formula and stacking behavior.
- **Resources & power systems** — pools with max formulas and recharge triggers (short rest, long rest, dawn, per encounter, per turn, cooldown N rounds, never). Flat pools (cursed energy, mana, stamina, momentum), tiered pools (spell slots), or charges.
- **Power taxonomy** — "spell" is not hardcoded. Define categories with their own axes (level, tier, school, element, discipline), preparation model (known, prepared, at-will, slotted, deck), and cost model.
- **Progression** — class levels, XP tables, milestone, named ranks, or parallel tracks that aren't levels at all (skill trees, cultivation realms, mutation trees).
- **Conditions, damage types, and interactions** — including harm models that aren't hit points: stress tracks, wound severity, clocks.
- **Item taxonomy** — slots, attunement analogs, encumbrance, charges, crafting.
- **Character creation flow** — the steps, their order, and what happens at each.
- **Resolution mechanic** — d20 + modifier vs. target number is the default and the only fully hand-polished path. Pluggable alternatives (dice pools counting successes, 2d6+mod, d100 roll-under, 3d6) are a supported extension point.

### Nothing starts from a blank page

- **Everything is a fork.** You never create from nothing; you always fork something that works.
- **Starter kits** — playable templates: 5e, 5e-with-mana, grimdark low-magic, superhero, survival horror, shonen-action.
- **Attribution chains** — lineage tracked automatically, credits generated.

---

## 3. Correctness: Linter and Simulator

Freedom is only survivable if the platform can tell you when you've broken something. Both of these are **deterministic** — no AI, no API key, works offline.

### System linter

Static analysis over a system definition, like a compiler:

- Formulas referencing attributes or stats that don't exist
- Circular derived-stat dependencies
- Resources with no recharge trigger, or unreachable progression tiers
- Unreferenced or orphaned entities
- Type errors in effects (a `resistance` pointing at a damage type you deleted)
- Choices with no valid options

### Probe characters

Auto-generate test characters at every level or rank, and check for NaN, negative maximums, absurd values, unresolvable choices, and effects that never fire.

### Playtest simulator

Run thousands of simulated combats between your custom classes. Report win rates, time-to-kill, damage-per-round curves, resource attrition.

Then plot those curves **against the 5e baselines**. Not a verdict on whether your design is balanced — a map of where it diverges from a known reference. This turns system design from guesswork into iteration, and nothing else in this space does it.

---

## 4. Content & Compendium

Entity types modeled: Species and lineages · Backgrounds · Classes · Subclasses · Feats · Spells and powers · Items (weapons, armor, gear, magic items, consumables) · Monsters and statblocks · Conditions · Damage types · Rules and glossary · Encounter tables · Vehicles · Hazards and diseases · Deities · Languages · Tools · Crafting recipes · Downtime activities.

- Unified search with per-type faceted filters
- Instant client-side search locally; server-side full-text for community browsing
- Rich entity pages with cross-links and "what grants this / what uses this" back-references
- Source filtering — see only what's legal at your table
- Side-by-side 2014 vs. 2024 comparison
- **Structured queries** — because content is data, not licensed text: "every spell granting advantage on saves," "every item scaling with proficiency." D&D Beyond structurally cannot do this.
- Seeded from SRD 5.1 and SRD 5.2.1 (both CC-BY-4.0)

---

## 5. Character Builder & Sheet

### Creation

- Flows: **Guided** (step-by-step with recommendations), **Standard**, **Expert** (one page), **Import**
- Ability scores: standard array, point buy (configurable budget), manual, or in-app rolling that records the actual rolls
- Multiclassing with prerequisite checking (toggleable per campaign)
- Level up, level down, full respec, retraining of individual past choices

### The sheet

- **Core block** — attributes, modifiers, proficiency, provenance on every number
- **Skills & saves** — proficiency, expertise, half-proficiency, custom bonuses
- **HP** — current, max, temporary, hit dice, death saves, exhaustion
- **AC** — shows all competing calculations, lets you pick
- **Initiative, movement (all types), senses, passive scores**
- **Attacks & actions** — computed to-hit and damage, extra attack, versatile/thrown/finesse, 2024 weapon masteries
- **Spellcasting/powers** — known vs. prepared, slots or pools, pact magic, rituals, concentration, upcast preview, attack bonus and save DC, multiclass slot tables, innate casting from items and feats
- **Inventory** — weight and encumbrance (variants toggleable), containers, attunement, currency, equip/attune state driving real effects, charges
- **Features & traits** — grouped by source, with usage counters
- **Conditions & effects panel** — apply a buff and watch the sheet recalculate
- **Character-scoped content** — author a power that exists only for this character
- **Description** — backstory, appearance, portrait, personality/ideals/bonds/flaws, allies, organizations
- **Notes & journal** with custom user-defined tabs
- **Companions** — familiars, mounts, wild shape, summons, sidekicks as linked mini-sheets
- **Validation panel** — "2 unspent choices," "this spell isn't on your list." Warnings, never hard blocks.
- **Version history** with real undo, and **time travel** — "show me my sheet as it was at session 12"
- Folders, tags, archiving
- Mobile-first layout — most real usage is a phone at a table
- Print and PDF export

### Sheet rendering

- **Auto-generated** from the system schema — every system gets a working sheet with zero effort
- **Visual designer** — drag blocks (stat block, resource tracker, ability list, counter, table, text) onto a responsive grid, bound to engine values
- 5e ships hand-authored layouts as its default
- Layouts are shareable, forkable artifacts

---

## 6. Codex — Story, Lore, and Characters

A full world-building workspace, and the differentiator is that **lore links to mechanics.** World Anvil has lore without mechanics. D&D Beyond has mechanics without lore. Nobody connects them.

- **Entry types** — characters, locations, factions, organizations, deities, events, items, species, languages, cosmology, timelines
- **Cross-linking** — wiki-style, with backlinks and a relationship graph
- **Mechanical binding** — an NPC entry carries a real statblock; a location carries an encounter table and a map; a faction grants a background; an artifact entry _is_ the item entity
- **Long-form writing** — chapters, prose, session recaps, in-world documents, with a clean distraction-free editor
- **Character writing** — backstory, arcs, relationships, secrets, personal quests, tied to the actual character sheet
- **Timelines and calendars** — custom calendars per world, in-world dates on events
- **Visibility control** — DM-private, party-shared, or public per entry
- **Reveal mechanics** — unlock entries to players as they discover them
- **Search across everything**

---

## 7. Campaigns & Party

- Campaign creation, invite links, roles (GM / player / spectator)
- **Party dashboard** — everyone's HP, AC, passive scores, saves, resources, conditions at a glance
- Shared party inventory, loot distribution, currency splitting
- GM tools: view and edit player sheets with permission, award XP, levels, items, inspiration
- **House rules panel** — `override` effects scoped to the campaign: ability caps, multiclass restrictions, rest rules, crit rules, encumbrance, arbitrary formulas
- Content scoping — which sources and homebrew are legal here
- Session log; notes with private/shared visibility
- Quests, plot threads, factions, NPC roster (shared with the Codex)
- Handouts, images, secret notes
- In-world calendar and downtime tracking
- Milestone vs. XP progression
- Party-wide rest resolution
- **Party composition analysis** — no healer, no darkvision, nobody who can pick a lock
- **Encounter difficulty against your actual party** — real sheets, real resources, real current HP, not CR math against a hypothetical group

---

## 8. Virtual Tabletop

Full VTT. Built on the same data-driven principle as everything else: **a custom system's tokens, statuses, measurement rules, and targeting come from its system module**, so custom worlds get a first-class play experience rather than a 5e VTT with the serial numbers filed off.

### Maps

- **World, region, and settlement maps** — atlas layer for the Codex. Pan, zoom, pins linked to Codex entries, layered reveal, player-visible vs. GM-only.
- **Battle maps** — grid (square/hex/gridless), multiple layers (background, objects, GM, lighting), snapping, elevation.
- **Procedural generation** — dungeon layouts, settlements, region maps, with seeds and re-rolls.
- **Import** — bring in map images from anywhere.

### Play

- Tokens: placement, movement, drag paths, size categories, auras, elevation, status icons driven by real conditions
- Fog of war, dynamic lighting, vision and line of sight, walls and doors
- Measurement respecting the system's own distance rules
- Drawing, annotation, ping, and pointer tools
- **Sheet integration** — attack from your sheet, target a token, apply damage with resistances and temp HP handled
- Initiative and turn order on the map; start-of-turn and end-of-turn effect triggers
- Real-time multiplayer with authoritative server state
- Combat log
- Asset library with upload and reuse

### Combat tracker (usable standalone, for in-person tables)

- Initiative mixing PCs, NPCs, and monsters; grouping; tiebreakers
- Damage and healing auto-applying temp HP and resistances
- Conditions with duration tracking and automatic expiry
- Concentration prompts with the save DC pre-calculated
- Death saves and instant-death thresholds
- Editable per-encounter statblock instances
- Legendary and lair actions, recharge rolls
- **Encounter builder** — XP/CR budget, difficulty estimates, random tables

---

## 9. Dice

- Expression parser: `2d6+3`, `4d6kh3`, advantage/disadvantage, rerolls, exploding, min/max
- Rolls from the sheet carry full context — which modifiers applied and why
- Shared campaign roll feed with GM secret rolls
- Roll history and statistics
- Optional 3D dice or instant results
- **Physical dice mode** — enter what you rolled, the app does the math
- Custom dice and resolution mechanics defined by the system module

---

## 10. Studio — Visual Design

For designing rather than describing. Later, but it's what makes a world feel like a published game instead of a database.

- **Map editor** — draw and paint maps, not just generate them
- **Token and portrait composer** — layered parts, palettes, for people who can't draw
- **Card designer** — spell, item, and ability cards that look like a real game's
- **Statblock designer** — layout and styling for your system's statblocks
- **Sheet designer** — (see §5)
- **Heraldry and symbols** — faction banners, sigils, icons
- **Theming** — fonts, colors, borders, textures applied across your world's sheets, cards, and exports

---

## 11. The Commons

Free publishing, forever, with no paywall on anything.

- **Publish** — systems, sourcebooks, individual entities, sheet layouts, maps, codex worlds
- **Forking is the primary interaction**, not downloading. You take someone's work and make it yours, and the lineage is recorded.
- **Attribution chains** — "forked from X, which forked from Y," with credits generated automatically. Makes the commons feel fair, which is what keeps people publishing.
- **Per-work licensing** — CC0, CC-BY, or all-rights-reserved, chosen by the creator
- **Quality signals** — fork counts, "used in N campaigns," playtested badges, ratings, curated collections
- **Discovery** — search, tags, featured, follow authors
- **Versioning** — consumers pin a version and opt into updates, so an author's edit never silently breaks someone's campaign
- **Co-authoring** — shared editing, comments, suggestions, roles. Worlds are usually built by groups.
- **Moderation** — reporting, review queue, takedowns, DMCA process

---

## 12. AI Layer — Optional

**Division of labor: AI drafts and organizes. The linter and simulator verify.** AI never decides whether something is correct — the deterministic layer does that, and it is better at it.

What it does:

- **System scaffolding** — describe your world in plain language, get a draft system definition (attributes, resources, progression, power categories) you then edit
- **Bulk drafting** — you need 40 cursed techniques, not one. Generates structured, editable entities.
- **Consistency auditing** — find contradictions across a 200-entry codex. Genuinely hard deterministically; AI is good at it.
- **Ingestion assist** — turn a pile of notes or a wiki dump into structured entries
- **Explaining linter warnings** — why this matters and how to fix it
- **Interpreting simulator output** — what these curves mean for your design

Guardrails:

- Optional, off by default, **bring-your-own-key**
- Output is always editable structured data, never opaque text
- **Every workflow is completable without it**; the product is fully functional with AI disabled
- No AI in the resolution path — game math is never non-deterministic

---

## 13. Import, Export, Publishing

- **Native JSON** for characters, content, systems, campaigns, and codices — documented, versioned schema
- **D&D Beyond character import** (unofficial endpoint; will break periodically, best-effort only)
- **Export to Foundry VTT / Roll20 / Fantasy Grounds** — characters and generated maps
- **Import homebrew formats** — Foundry compendium packs, 5e.tools-style JSON
- **PDF/text ingestion** — upload → parse → **human review queue to correct extraction** → commit as private content. Private-only, never publishable.
- **Sourcebook export** — your world compiles to a formatted, printable PDF book. Cheap to build since everything is structured, and it's the artifact creators show people.
- Full account data export and deletion
- Printable character sheets

---

## 14. Accounts, Self-Hosting

- Email + password, OAuth (Google, Discord), magic links
- Profiles, avatars, friends/following, notifications
- Public read-only sheet and world links, embeds
- **Self-host mode** — single-tenant flag disabling public registration and community browsing
- **Open public API** — we don't sell content, so we have no reason to lock it down. They do.

---

## 15. Offline & Sync

- Service worker with cached app shell
- IndexedDB holds your characters, campaigns, codex, and the content subset you use
- Full offline read **and write**, mutations queued
- Because characters are event logs, concurrent edits merge rather than clobber. Scalars use last-write-wins; genuine conflicts get explicit resolution UI.
- Content is content-addressed and versioned, so it caches aggressively
- **VTT requires connectivity** for live play — this is the one area offline can't fully cover

---

## 16. Tech Stack

| Layer                   | Choice                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| Repo                    | pnpm workspaces + Turborepo                                      |
| `packages/rules-engine` | Pure TypeScript, zero deps, isomorphic                           |
| `packages/schemas`      | Zod schemas shared by client, server, importers                  |
| `apps/web`              | Next.js (App Router), React, TypeScript                          |
| UI                      | Tailwind + shadcn/ui, TanStack Query                             |
| API                     | tRPC                                                             |
| DB                      | Postgres + Drizzle. JSONB entity bodies with relational indexes. |
| Auth                    | Auth.js                                                          |
| Realtime                | WebSockets; Postgres LISTEN/NOTIFY, Redis if it outgrows that    |
| VTT rendering           | PixiJS (WebGL) canvas layer                                      |
| Offline                 | Dexie (IndexedDB) + custom sync layer                            |
| Search                  | Orama client-side; Postgres FTS for community browse             |
| Files                   | S3-compatible object storage + CDN                               |
| Deploy                  | Docker Compose for self-host; Fly/Railway for hosted             |
| Testing                 | Vitest (engine), Playwright (E2E)                                |

---

## 17. Non-Functional Requirements

- **Usability is a hard constraint, not a nice-to-have.** Unlimited power with a simple surface is achievable only through inheritance defaults, guided forms, forking over blank pages, and progressive disclosure. When simplicity and power conflict, the common path stays simple and the depth goes behind a door.
- **Onboarding** — first run ends with you rolling dice as a character in under three minutes, not reading documentation.
- **Accessibility** — keyboard navigation, screen reader support on the sheet, colorblind-safe palettes, reduced motion, scalable text. D&D Beyond is weak here; cheap differentiation if built in from the start.
- **Performance** — sheet recompute under 16ms; instant search; VTT at 60fps on a mid-range tablet.
- **Security** — sandboxed formula DSL with no `eval`, because all user content is untrusted. Rate limiting, CSRF/XSS hardening, upload scanning.
- **Testing** — a large **golden test suite** on the rules engine: known builds mapped to expected derived stats, across both 5e rulesets, multiclassing, and edge-case stacking. Every rules bug becomes a permanent test case.
- **i18n-ready** — externalized strings from day one.
- Observability, automated backups, documented restore.

---

## 18. Legal

- SRD 5.1 and SRD 5.2.1 are released under **CC-BY-4.0**. Attribution required and displayed.
- **Product Identity is off-limits** — beholders, mind flayers, named settings and characters are not in the SRD.
- No D&D logos or trade dress. Not affiliated with or endorsed by Wizards of the Coast, and it must say so.
- User-uploaded book content stays private to the uploader, never publishable.
- **Third-party IP in the Commons is a real exposure.** A publicly published "Jujutsu Kaisen system" infringes someone's copyright regardless of how good it is. Needed: clear guidance that fan systems stay private or are transformative, a DMCA agent and takedown process, and safe-harbor compliance. Private personal use is a different risk profile from public distribution, and the UI should make that distinction obvious at the publish step.
- Worth a lawyer's review before public launch, not just before writing code.

---

## Work Order

Each phase should leave the product working and demoable.

### Arc 1 — Foundation

| #   | Phase             | Contents                                                                                                                           |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Foundations       | Monorepo, schemas, Postgres + Drizzle, auth, CI, Docker Compose                                                                    |
| 1   | Rules engine core | Entities, scopes, grants, effects, formula DSL, predicates, stacking, provenance. Golden tests. **No UI** — proven by tests alone. |
| 2   | 5e system modules | Encode 2014 and 2024 as data modules; ingest both SRDs. The starter kit, and the proof the engine is general.                      |

### Arc 2 — The 5e Product

| #   | Phase                     | Contents                                                                                    |
| --- | ------------------------- | ------------------------------------------------------------------------------------------- |
| 3   | Compendium                | Browse, search, entity pages, structured queries, source filtering                          |
| 4   | Character builder + sheet | Creation flows, full interactive sheet, leveling, inventory, casting. Largest single phase. |
| 5   | Homebrew authoring        | Entity editors, effect builder, formula editor, versioning, character-scoped content        |

### Arc 3 — Creation

| #   | Phase                     | Contents                                                               |
| --- | ------------------------- | ---------------------------------------------------------------------- |
| 6   | System Designer           | Per-subsystem dials, starter kits, forking, auto-generated sheets      |
| 7   | Linter + probe characters | Static analysis, validation, generated test characters                 |
| 8   | Codex                     | Lore entries, cross-linking, mechanical binding, timelines, visibility |

### Arc 4 — Play

| #   | Phase                 | Contents                                                                        |
| --- | --------------------- | ------------------------------------------------------------------------------- |
| 9   | Campaigns & party     | Roles, dashboard, GM tools, house rules, party analysis                         |
| 10  | Dice + combat tracker | Dice engine, initiative, conditions, concentration, encounter builder, realtime |
| 11  | VTT                   | Maps, tokens, fog, lighting, vision, sheet integration, live sync               |

### Arc 5 — Community & Depth

| #   | Phase              | Contents                                                                 |
| --- | ------------------ | ------------------------------------------------------------------------ |
| 12  | The Commons        | Publishing, forking, attribution chains, licensing, curation, moderation |
| 13  | Offline & PWA      | Service worker, IndexedDB, sync, conflict resolution                     |
| 14  | Import & export    | Native JSON, DDB import, VTT exports, PDF ingestion, sourcebook export   |
| 15  | Playtest simulator | Combat simulation, balance curves against 5e baselines                   |
| 16  | Studio             | Map editor, token composer, card and statblock designers, theming        |
| 17  | AI layer           | Optional BYOK: scaffolding, bulk drafting, consistency audit             |
| 18  | Polish & launch    | Accessibility audit, i18n, onboarding, self-host packaging, legal review |

**Note:** the _engine_ is generic from phase 1 — non-negotiable, non-retrofittable. Phase 6 adds the authoring UI. Building 2014 and 2024 as two independent modules in phase 2 is the forcing function proving that generality is real long before anyone builds a new world in it.

---

## Verification

- **Phases 1–2** — `pnpm test`: golden suite passes. A hand-verified level 12 multiclass character produces correct AC, saves, slots, and attacks under both rulesets.
- **Phase 4** — build a character end to end in the browser; every number's provenance trace is correct and complete.
- **Phase 5** — author a homebrew class with a conditional effect; confirm sheet math changes and that editing recomputes existing characters.
- **Phase 6** — build a system with attributes, resources, progression, and powers all replaced; create a playable character in it. **The JJK test:** cursed energy pool, named grades instead of levels, a character-unique technique, combat inherited from 5e.
- **Phase 7** — introduce a deliberate error (formula referencing a deleted attribute); confirm the linter catches it before a character breaks.
- **Phase 10** — two-browser combat; initiative, damage, conditions, and concentration sync live.
- **Phase 11** — two-browser VTT session; token movement, fog, and vision sync; attack from sheet applies damage to a target token.
- **Phase 13** — go offline, edit a character on two devices, reconnect, confirm the merge is correct.
- **Throughout** — Playwright E2E on critical paths: signup, create character, level up, join campaign, run combat.

---

## Key Risks

1. **Scope.** This is a large multi-year project. The arc ordering is the mitigation — stopping after Arc 2 still yields a genuinely valuable free 5e character builder, and after Arc 3 a unique creation tool that nothing else offers.
2. **Freedom vs. usability.** The hardest design constraint in the product. Mitigated by inheritance defaults, fork-don't-create, guided forms, and progressive disclosure — but it needs defending in every UI decision.
3. **The VTT roughly doubles the project** and puts us against Foundry, which is mature and excellent. Accepted deliberately: a world-creation platform that can't run the world is incomplete.
4. **Generality vs. 5e polish.** Mitigated structurally — 5e ships hand-tuned layouts and bespoke components; auto-generation is the fallback, never the 5e path.
5. **Content encoding volume.** Encoding the SRD as structured effects is a large, unglamorous, manual data job on the critical path.
6. **Cold-start problem.** A commons with nothing in it is worthless. Seeding it with high-quality starter kits and complete example worlds is a launch requirement, not a follow-up.
7. **Moderation and IP exposure** scale with success and are easy to underestimate — especially given that fan-recreation systems are exactly what users will want to publish.
