# 3xl-game

A browser game played over a map of the **Països Catalans**. Towns fly TV shows, their
local festivals hand out booster boxes of cards, and the cards are fighters ripped from
**MUGEN** sprite archives who settle who holds each town in a three-lane stand-off.

**What the game actually is, rule by rule, is in [GAME.md](GAME.md).** This file is only
how to run it.

Everything below assumes the repo root as the working directory.

---

## Requirements

| Thing        | Version                                                              |
| ------------ | -------------------------------------------------------------------- |
| Node         | 22 or newer (CI builds on 22)                                        |
| pnpm         | 10.10.0 — pinned by `packageManager`, so `corepack enable` is enough |
| A Supabase project | Optional for local dev, required for anything a player keeps    |
| A TMDB API key     | Only for the admin's show browser                               |

This is a **pnpm workspace**. Run everything from the root; the scripts delegate with
`pnpm --filter`. Never `npm install` inside a package.

---

## Quick start

```bash
corepack enable
pnpm install
pnpm dev            # frontend :2000 + admin :2001 + backend :2002, in parallel
```

Open <http://localhost:2000>. That is the whole game — the map is the front door.

`pnpm dev:frontend` alone is enough to look at the game; the admin and the backend are
authoring tools and are never shipped.

**Without Supabase configured the app still runs.** The map draws, every town shows the
house team its own geometry seeds, and a fight can be played. What you do not get is
anything that outlives the tab: no sign-in, no claiming, no roster, no territory, and a
fight closed is a fight lost. See [Supabase](#supabase) to wire that up.

---

## The three apps

| Package         | Kind                       | Port | What it is                                                             |
| --------------- | -------------------------- | ---- | ---------------------------------------------------------------------- |
| `@3xl/frontend` | SvelteKit (adapter-static) | 2000 | The player-facing game. The only thing that ships.                     |
| `@3xl/admin`    | SvelteKit (adapter-static) | 2001 | Authoring SPA: characters, shows, music, narration, festes, users.     |
| `@3xl/backend`  | Node/Express 5 via `tsx`   | 2002 | Dev/authoring API. Reads/writes `@3xl/data`, proxies TMDB, talks to PG. |

Ports are hardcoded and `--strictPort`, so the three dev servers always agree. The
backend's CORS allows only `localhost:2001` and `localhost:2000`.

The four packages behind them:

```
packages/
├── frontend/  the game
├── admin/     the authoring SPA
├── backend/   the authoring API
├── shared/    types, utils, adapters, the two Svelte components both apps draw (raw TS, no build)
├── mugen/     character import: MUGEN archives + sprite sheets → frames, manifests, registry
├── assets/    generated frames, auras, icons, ground tiles, music (served at /assets)
└── data/      character registry + definitions + geo layers + authored JSON (served at /data)
```

Both apps build to a static SPA and render sprites with PixiJS. Both install
`@3xl/assets` and `@3xl/data` as `workspace:*` and mount each package's `public/` at
`/assets` and `/data` through the identical `serveWorkspacePublic()` Vite plugin.

---

## Environment variables

There are **two** env files, and they are read by different processes:

**`packages/frontend/.env`** — read by Vite for the player app (start from
`.env.example` in the same folder):

| Var                        | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`      | Supabase project URL. Unset ⇒ the app runs signed-out and stateless.    |
| `PUBLIC_SUPABASE_ANON_KEY` | Anon key. Safe in the browser — it is gated by RLS, not by secrecy.     |
| `PUBLIC_I18N_LOCALE`       | Only ever set by `pnpm dev:qq`. Leave it alone otherwise.               |

**Repo-root `.env`** (git-ignored) — loaded explicitly by the backend:

| Var                  | Purpose                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `TMDB_API_KEY`       | Server-only TMDB key for the admin's show browser. Never reaches a browser.     |
| `SUPABASE_DB_KEY`    | Supabase **database password** — the backend connects to Postgres directly.     |
| `PUBLIC_SUPABASE_URL`| Also read here: the Postgres host is derived from it.                           |
| `SUPABASE_DB_REGION` | Connection-pooler region for that Postgres connection.                          |

---

## Everyday scripts

```bash
pnpm dev            # all three servers
pnpm dev:frontend   # just the game (2000)
pnpm dev:admin      # just the admin (2001)
pnpm dev:backend    # just the API (2002)
pnpm dev:qq         # all three, with the frontend pinned to the pseudo-locale (see below)

pnpm build          # static bundles for frontend + admin
pnpm preview        # preview the frontend build on 2000
pnpm check          # svelte-check (both apps) + tsc (backend)
pnpm test           # the vitest suite (frontend package; covers @3xl/shared too)
pnpm lint           # prettier --check + eslint
pnpm format         # prettier --write
pnpm clean          # drop build output everywhere
```

`pnpm dev:qq` regenerates `qq.json` from the Catalan catalogue (every string becomes
`QQQQQ`) and registers it *alone*, with no fallback. Anything still legible on screen is
text that never went through i18n. The player app speaks Catalan and nothing else; the
admin registers `en` and reads the browser, as an authoring tool for one author may.

---

## Supabase

The game is a pure static SPA that talks to Postgres directly with the anon key, so
**every rule that matters lives in the database**, in security-definer RPCs:
`claim_booster`, `claim_welcome_booster`, `claim_level_booster`, `set_team`,
`start_battle`, `award_combat_exp`, `record_legal_acceptance`, `export_player_data`,
`delete_player_account`. The browser never names an amount, a town, or an outcome it was
not given.

**Provisioning.** The backend creates and migrates every table it knows about on boot
(`ensureTables()` in `packages/backend/src/routes/show-templates.ts`) — so
`pnpm dev:backend` once against a fresh project gets you most of the way. The SQL under
`packages/backend/supabase/*.sql` is the readable reference for the same schema, and any
one file can be applied by hand inside a transaction:

```bash
pnpm --filter @3xl/backend exec tsx scripts/apply-sql.mts supabase/booster_claims.sql
```

**Auth.** Email + password and Google. Provider ids and secrets are *not* env vars —
configure them in the Supabase dashboard (Authentication → Providers), give each
provider Supabase's callback URL, and list every origin the app is served from
(`http://localhost:2000` and the deployed origin) under Authentication → URL
Configuration. Address confirmation is on, so a sign-up ends not-yet-signed-in.

**Filling the game with content**, in the order it has to happen:

1. Import characters (below) so `@3xl/data`'s registry has a roster.
2. Admin `/characters` → sync `character_templates` against the local registry.
3. Admin `/shows` → search TMDB, save shows, then **assign characters to shows**
   (`show_characters`). A show with no renderable character does not exist as far as the
   game is concerned — it is not in the map's pool and nothing can be rolled from it.
4. Admin `/seasons` → sync the local-festival calendar into `festa_locations` /
   `festivities`. **Nothing can be claimed until this is done**: a booster box is a
   town's festa major, and the server reads the dates from those tables.
5. Admin `/narration` → author the lines the fight says over each kind of encounter.
   Unauthored events are simply silent.
6. Admin `/music` → title each vendored mp3 and name the show it opens.

**Wiping the fighting** (destructive, runs against the live project, not reversible):

```bash
pnpm reset:battles              # holders, sieges, challenges, open battles, results, exp
pnpm reset:battles --keep-exp   # fresh map, levels left standing
pnpm reset:battles --dry-run    # do it all and roll it back; the printed counts are real
```

Cards, team slots, boosters, avatars, usernames and legal acceptances all survive it.

---

## Content pipelines

All of these write into the git tree. **Do not hand-edit what they generate**
(`registry.generated.ts`, `manifest.json`, `mugen-moves.json`, `public/geo/*.json`,
`public/icons/shows/*`) — re-run the script instead.

```bash
pnpm import:mugen           # rebuild the registry from MUGEN archives + sprite sheets
pnpm generate:sprites <id>  # re-decode one character
pnpm generate:auras         # the charge auras
pnpm generate:geo           # rebuild the four map layers from the Eurostat LAU dataset
pnpm generate:festes        # rebuild the baked local-festival calendar
pnpm generate:show-icons    # move any root *.svg into the show-icon set
```

A character comes from one of two places and is identical downstream: a **MUGEN archive**
in `packages/mugen/mugen-characters/` (with decode inputs in `characters-src/<id>/`), or a
**ripped sprite sheet** in `packages/mugen/character-sheets/` (a PNG plus a `.json`
sidecar naming its captioned rows). Both land as the same frames folder, manifest,
definition and registry entry.

`generate:geo` needs the Eurostat GISCO "LAU 2024" layer downloaded to the repo root as
`ref-lau-2024-01m.geojson/`; the four dissolved layers it produces are checked in, so you
only need it when the boundaries change.

**What an import must not undo:** hand-authored portraits (`definition.json`), uploaded
faces (`public/characters/<id>/faces/`) and deleted frames
(`public/characters/<id>/frame-edits.json`) all live outside the generated manifests and
are replayed onto every fresh decode. A wipe run deletes that folder deliberately.

---

## Tests

```bash
pnpm test
pnpm --filter @3xl/frontend test:ui
pnpm --filter @3xl/frontend test:coverage
```

Vitest + `@testing-library/svelte`, all under `packages/frontend/test/` — the app's
services and components plus the `@3xl/shared` utils and adapters the frontend consumes.
Playing a turn out in a test means committing it and pressing on from every encounter it
holds at; that is written down once in `test/services/play-turn.ts` and the whole combat
suite goes through it.

---

## Building and deploying

```bash
pnpm build       # frontend → packages/frontend/dist, admin → packages/admin/dist
pnpm preview     # serve the frontend build on 2000
```

`.github/workflows/deploy-pages.yml` builds **only** `@3xl/frontend` on every push to
`main` and publishes it to GitHub Pages. The Supabase values come from repository
*variables* (Settings → Secrets and variables → Actions → Variables):
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`. The admin and the backend are never
built or shipped by it.

The site is served at **<https://6xl.bearni.io>**. Note that
`packages/frontend/static/CNAME` still names the old `3xl.bearni.io` domain — it is
stale; do not take the live origin from it.

---

## Conventions

`CLAUDE.md` is the long-form guide: architecture, the services/adapters/utils split, the
component rules (Tailwind + DaisyUI + `classnames`, never a `<style>` tag), the path
aliases, and the reasoning behind most of the decisions in here. Commits go straight to
`main`, plain text, no emoji.
