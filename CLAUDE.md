# 3xl-game — Development Guidelines

This document guides Claude (and developers) on implementing features in this
project: a browser game built on SvelteKit whose characters are imported from
**MUGEN** sprite archives, with a **Països Catalans** (Catalan Countries) Leaflet
map and Supabase auth (email + password, Google). It's a pnpm monorepo with two SvelteKit apps
(player + admin) and a small authoring backend. Follow these conventions strictly
to keep the codebase consistent.

## Monorepo Structure

This is a **pnpm workspace** (`pnpm-workspace.yaml` → `packages/*`). Run everything
from the repo root; scripts delegate to the right package via `pnpm --filter`.

```
packages/
├── frontend/  (@3xl/frontend)  SvelteKit player web app (port 2000)
├── admin/     (@3xl/admin)      SvelteKit authoring SPA (port 2001)
├── backend/   (@3xl/backend)    Express authoring API (port 2002)
├── shared/    (@3xl/shared)     framework-agnostic types + utils + adapters (TS source)
├── mugen/     (@3xl/mugen)      character import/assembly scripts (write assets + data)
├── assets/    (@3xl/assets)     generated sprite frames + manifests + auras + icons/music (public/)
└── data/      (@3xl/data)       character registry module + JSON definitions + movesets + geo
```

**Apps and ports** (all hardcoded / `--strictPort`, so the dev servers always agree):

| Package        | Kind                     | Port | Notes                                        |
| -------------- | ------------------------ | ---- | -------------------------------------------- |
| `@3xl/frontend`| SvelteKit (adapter-static) | 2000 | The player-facing game. Ships to a static bundle. |
| `@3xl/admin`   | SvelteKit (adapter-static) | 2001 | Character/TMDB authoring SPA. Talks to the backend. |
| `@3xl/backend` | Node/Express 5 (`tsx`)     | 2002 | Dev/authoring only — reads/writes `@3xl/data`, proxies TMDB. |

Both SvelteKit apps build to a **static SPA** (`@sveltejs/adapter-static`,
`fallback: index.html`) and render MUGEN sprites with **PixiJS**.

**Data flow — MUGEN:** `@3xl/mugen` reads raw archives (`mugen-characters/`) + decode
inputs (`characters-src/<id>/`) and *writes into* `@3xl/assets` (`public/<id>/frames/`,
`public/auras/`) and `@3xl/data` (`registry.generated.ts`, plus each character's
`public/characters/<id>/definition.json` and `public/characters/<id>/mugen-moves.json`).

**A character need not come from MUGEN.** Some exist only as a **ripped sprite sheet** —
one PNG off a site like The Spriters Resource, every animation the original game holds laid
out in captioned rows of framed cells. Those are dropped in `character-sheets/` (a PNG and a
`.json` sidecar per character) and imported by the *same* `pnpm import:mugen` run, through
`sprite-sheets.js`. Past the decode there is one kind of character: the same frames folder,
the same `manifest.json`, the same `spr_<a>_<b>.png` / `spr_9000_<n>.png` names, the same
auto-bound definition, the same registry — nothing downstream knows or asks which it was.
The five *Keroro RPG* (DS) characters are the sheet-imported ones today.

Reading a sheet is reading its own conventions, and only one thing about it is authored: a
sheet's **captions are pixels**, so what each row is called is written in the sidecar
(`strips`, one name per captioned row, in reading order) rather than OCR'd. Everything else
is measured — the page background is the corner's colour, a cell is a solid rectangle of the
sheet's cell colour, a row is cut where its captions say (above the first cell or beside the
last, whichever that sheet does), an over-long row wraps to the next line uncaptioned, and
what is left uncaptioned and is *not* a wrap is the promo art the sheet closes on, read as
the character's portraits. So a sidecar naming a different number of rows than the sheet
captions is the one thing that can silently drift, and the decode says so loudly when it
does. A sheet also has no **axis** and no **timings**: the axis is recovered by sliding each
frame over the one it follows until they overlap best (a walk cycle has to hold the body
still while the legs move), and one `frameMs` covers every frame.

**What an import must not undo.** A re-import — additive mode included — rebuilds every
decoded manifest whole from the raw `.sff`/`.air` (or sheet), so anything the author edited has to live
outside it. Three things the admin authors per character, and where each survives:

- **The portrait** picked (and cropped) on `/characters/dashboard/<id>/faces` is `face`/`faceCrop` on that
  character's `definition.json`, and an additive import writes a definition only when there
  isn't one — so the pick is kept as-is. It names a manifest file (`spr_9000_2.png`), so an
  archive re-imported with a different set of group-9000 sprites can leave it pointing at
  nothing; the importer says so and changes nothing, since which face a character wears is
  the author's call.
- **The portrait uploaded** on that same screen is not in the archive at all, so it is stored
  in `public/characters/<id>/faces/` and copied into the decoded frames folder — which is
  deleted and rebuilt whole by every decode — on each run, with an entry appended to the
  manifest's `faces` list, by `@3xl/mugen/custom-faces.js` (which the backend's upload route
  also writes through, so an upload and a decode leave the same folder either way round). Once
  copied it *is* a face like any other: same folder, same list, named by bare filename in the
  definition, which is what the `custom_` prefix keeps clear of the decoded `spr_<group>_<image>`
  ones. Its pixel size is read off the file's own header (PNG/JPEG/WebP/GIF), so the folder is
  the whole record and nothing beside it can drift. A **video** may be picked too, and never
  reaches that folder as one: the browser is the only thing in this project that can decode a
  clip, so `@3xl/shared/utils/image/video-frame` draws its first frame onto a canvas and the
  PNG of *that* is what is uploaded — the store keeps its rule that a face is an image it can
  measure, and no decoder has to be installed to hold it. An upload is selected on the spot; it
  is framed by the default square until someone drags it and saves.
- **The frames deleted** on `/characters/dashboard/<id>/frames` are *not* kept in the manifest
  they were deleted from — that file is generated. Each deletion is recorded in
  `public/characters/<id>/frame-edits.json` (authored data, beside the definition, in the
  folder additive imports keep) and replayed onto every fresh decode by
  `@3xl/mugen/frame-edits.js`, which both the decoder and the backend's delete route live off.
  Indices in it are positions in the *freshly decoded* animation, and each entry carries the
  frame's own content, so a re-imported archive that shifted the animation still loses the
  right frame — and an entry whose frame is gone is retired rather than mis-applied. To put a
  frame back, delete its entry and re-run `pnpm generate:sprites <id>`. A **wipe** run deletes
  the whole per-character folder, frame edits and hand-tuned definition together, which is
  what a wipe is for.

`@3xl/frontend` and `@3xl/admin` *install* `@3xl/assets` + `@3xl/data` as `workspace:*`
deps: they import the registry as a module (`import { characters } from '@3xl/data'`) and
serve each package's `public/` dir at the `/assets` and `/data` URL prefixes via the
identical `serveWorkspacePublic()` Vite plugin in each app's `vite.config.ts` (dev/preview
mount it as middleware; build copies the dirs into `dist/`).

**Data flow — geo:** `@3xl/data`'s `generate-geo.js` reads the Eurostat GISCO "LAU 2024"
municipalities layer (downloaded to the repo root as `ref-lau-2024-01m.geojson/`) and
writes four dissolved GeoJSON layers under `public/geo/` (`municipis.json`,
`comarques.json`, `provincies.json`, `territoris.json`), served to the frontend map at
`/data/geo/*`. The comarca tier (between municipality and province) is assigned per
municipality at build time from Wikidata (Catalunya / Catalunya Nord), a GADM-derived
layer (País Valencià), and the comarques de les illes Balears (Illes Balears); Andorra and
l'Alguer have no comarca tier. See the script header for the full sourcing notes.

**Which show a town flies** is not authored and is not baked: it is
`seededShowId(coordinateSeed(polygon), pool)` (`@3xl/shared/utils/geo/municipality-show.ts`),
computed in the browser by the map (`+page.svelte`'s `buildSeededShows`) and handed from
there to the booster panel, so one town has one show wherever it is drawn. The **pool** is
every show with at least one renderable character cast in it — the Supabase `show_characters`
assignment the album and the claim roll already read, narrowed to the local registry — in
**id** order, never name order, since a name is translated data that a TMDB refresh can
change under it. So a show enters the map by being given its first character in the admin
and leaves it by losing its last; nothing has to be re-run, and a town whose polygon does not
move keeps its show as long as the pool does not change. A town somebody **holds** flies its
holder's lead's show instead, which overrides the seed everywhere the map, the pins and the
boxes name a show.

**Data flow — show icons:** `@3xl/assets`' `generate-show-icons.js` takes the Noun
Project SVGs dropped at the repo root, strips the attribution `<text>` baked into every
download, crops the viewBox to the artwork, and re-emits it at `width`/`height` `1em`
with `fill="currentColor"`, into `public/icons/shows/<slug>.svg` — then deletes the root
original (it is a move) and records the stripped credit in that folder's `license.txt`.

Which show gets which glyph is **authored, not coded**: it is `icon` on that show's own
entry in `shows.json` (`<folder>/<slug>`, e.g. `shows/straw-hat` or
`delapouite/pirate-hat`), picked in the admin `/shows` screen from the whole vendored set
and held to `GET /api/shows/icons` on save. It was a hand-kept table in
`@3xl/shared/utils/show/show-icon.ts` until then, which is why exactly three shows had a
mark; that file now only turns the collection into a lookup (`showIconsByShow`). A show
with no icon picked is named without one — there is deliberately no placeholder glyph.

**Icons.** Where an icon is *drawn* decides how it is stored, and the two are not
interchangeable:

- **Into the document** — a show's glyph, wherever the game names a show in a line of
  text, rendered by `ShowIcon.svelte`. An `<img>` is an opaque document whose artwork
  cannot inherit anything from the page, so the markup is *inlined* — which is what lets
  `fill="currentColor"` resolve against the surrounding text, colour *and* size following
  whatever the glyph sits in. Since the pairing is authored, the markup cannot be globbed
  into the bundle: `shows.service.ts` fetches each picked glyph by URL, runs it through
  `@3xl/shared/utils/icon/inline-svg.ts` — the baked white becomes `currentColor`, the
  artwork's own size becomes `1em`, idempotently, so either vendored set may be picked —
  and publishes them as the `showGlyphs` store, keyed by TMDB show id. Subscribing to that
  store is what starts the load, so no surface has to remember to ask for the collection
  first.
- **Into a canvas** — the game-icons.net artwork under `public/icons/<artist>/`:
  the combat orders' glyphs go into a Pixi texture, which is not a place a stylesheet
  reaches, so these are fetched by URL and carry a baked **white** fill, which the
  canvas then tints (tinting only
  ever darkens, so white artwork is what makes any colour reachable). The **whole**
  game-icons.net collection is vendored here — ~4,200 glyphs across 36 contributor
  folders, downloaded in the site's `ffffff / transparent` variant, which is why
  nothing had to be stripped: that variant is already white artwork on nothing, the
  form both the canvas and the admin's glyph picker want. Take the same variant when
  adding more (the site also offers white-on-an-opaque-black-square, whose background
  path would have to come out first). Attribution for the set is
  `public/icons/license.txt`; keep it with the folders.

**Ground tiles.** Artwork the combat board lays its cells with, vendored under
`public/tiles/<artist>/` with the set's credit in `public/tiles/license.txt` — the same
arrangement as the icons, and for the same reason: it is somebody's work, kept whole and
unmodified beside the note saying whose. Today that is one sheet of 16px grass tiles, laid
out as **blocks of three rows**, one green per block: the block's fills down its left-hand
column and, beside them, a ring of edges and corners drawn to meet whatever the grass
borders on. The board takes one block whole — the vivid green — so every tile on the field
is the same grass: its three fills alternated over every cell, nine squares to a cell,
and its upper and lower edges along the field's first and last rows. It is ground and not a
marking, so both halves and the column between them stand on the same earth, and which cell
is whose is said by the red lattice ruled over it. Each tile is cut out of the sheet as it
loads
(`createImageBitmap`'s own crop) rather than pointed at inside it: a magnified sample near
the edge of a frame reaches past it, and inside a page of tiles what it reaches is the next
tile. See `mugen-board.ts`'s ground section.

Inlining a canvas glyph *untouched* would put white on white, which is why nothing
reaches the document except through `inlineIconMarkup`. The admin's glyph picker is the
one place a glyph is shown outside both a canvas and that rewrite — it stays `<img>`s by
URL (`GameIcon.svelte`), so the tile under one is picked from the folder it came out of:
dark for the game-icons white, light for a `shows/` mark, whose `currentColor` resolves
to black inside an `<img>`.

**The typeface.** The game is set in **Genos**, fetched from Google Fonts by an
`@import` at the head of `css/app.css` — an import may only precede other rules, which is
why it sits above Tailwind's own. The family is taken **whole**
(`ital,wght@0,100..900;1,100..900`): every weight in both uprights and italics, which
costs one file per style because Genos is variable, and means a `font-bold` anywhere in
the app lands on a real weight rather than a synthesised one. Unlike the icons and the
songs the font is not vendored: it is the one asset asked of a third-party host at run
time. It is applied once, as
`--font-sans` / `--font-serif` / `--font-mono` in the `@theme` block, all three named
after it. Tailwind's preflight resolves `html`'s family through `--font-sans`, so every
element inherits it and **no component ever names a font**; the three tokens rather than
one mean a stray `font-mono` cannot land outside the typeface either. Canvas text is the
exception CSS cannot reach — a Pixi `TextStyle` names its own `fontFamily` and is
unaffected.

**Do not hand-edit generated files** (`registry.generated.ts`, `manifest.json`,
`mugen-moves.json`, `public/geo/*.json`, `public/icons/shows/*`) or decoded assets —
re-run the relevant script. (`frame-edits.json` is the exception that proves it: it is
authored, and exists precisely so an edit to a `manifest.json` need never be.)

**Root scripts** (from repo root):

```
pnpm dev            # frontend + admin + backend in parallel
pnpm dev:frontend   # just the player app (2000)
pnpm dev:admin      # just the admin SPA (2001)
pnpm dev:backend    # just the Express API (2002)
pnpm build          # build frontend + admin static bundles
pnpm preview        # preview the frontend build
pnpm check          # svelte-check (frontend + admin) + tsc (backend)
pnpm test           # frontend vitest suite
pnpm import:mugen   # (re)build the registry from MUGEN archives + sprite sheets
pnpm generate:sprites
pnpm generate:auras
pnpm generate:geo   # rebuild the Països Catalans map layers
pnpm generate:show-icons  # move any root *.svg into the show-icon set
pnpm reset:battles  # wipe all fighting from Supabase (see below) — destructive
pnpm clean          # remove build output across all packages
```

### App structure (`packages/frontend/src/`, and `packages/admin/src/` similarly)

```
src/
├── components/core/      # Reusable UI components (per app)
├── routes/               # SvelteKit pages and layouts
├── services/classes/     # State management with localStorage persistence
├── css/                  # Global styles (Tailwind imports)
└── services/i18n/        # Internationalization
```

Frontend routes: `/` (home), `/map` (Països Catalans map), `/roster` (the player's claimed
cards). Neither claiming nor combat has a route of its own — the booster packs live on the
map's right-hand panel (its Booster tab), and `CombatArena` is raised by the Challenge
button on a municipality. The roster has no route either. All of them
are full-view modals over the map, drawn on the shared `FullScreenModal` sheet — the roster
raised from the panel's account row, combat from the town — so there is one
kind of full-view surface in this app and not one per feature. Everything that is not the map
is behind the **burger menu** — the `<aside>` drawer summoned from the far end of the
breadcrumb bar: the block of buttons that raise those sheets, the sign-in, and at its foot
`MusicPlayer.svelte`. The plate draws nothing until a song is loaded, and the audio element
belongs to `music.service.ts` rather than to the component, so the sound outlives the drawer
being closed — or anything else that opens over the map.

**The player is a radio, and a show is a station.** Nothing on the plate chooses a song: a
station's songs are put in an order drawn from the day's seed (`utils/music/daily-shuffle`,
a UTC day — deliberately *not* the game's Catalan day, since nothing is awarded off it),
they run end to end from that day's midnight and start again when they run out, and what is
playing is whichever song the clock lands in, at the second it lands on
(`utils/music/station`). So two players hear the same bar of the same song without anything
being stored, sent or agreed on, and a listener who pauses rejoins where the station has got
to rather than resuming. The radio's two controls are play/pause (`MusicToggle.svelte`) and
the **dial** (`StationDial.svelte`) — a select naming the stations, which *is* the second
line, since that line was already naming the show and a radio says its station once. There is
no skip: a radio has no next song.

**The map turns the dial.** `musicService.follow` tunes it to the show the place the map is
open on flies — a town's own show, the plurality of the towns under a region, the plurality of
the whole map at the top view — so what is playing is about where the reader is standing. It
moves the dial whether or not there is sound: a running radio changes station at once, and a
silent one is tuned just the same, so the band on the map letters that place's station while
it is quiet and the press that turns it on starts what the band was already saying. Turning
the dial is never turning the sound on — sound only ever starts from a gesture. It is never
written down as the listener's choice of station, and a place that names no show, or one whose
show has no songs, moves nothing: there is no station to go to, so it stays where it is rather
than going quiet. A change of
station is therefore common and unasked-for, so it is **crossfaded** rather than cut: the
arriving station gets an audio element of its own and comes up equal-power over 1.2s while the
leaving one plays its own song out. Only the *station* fades; the songs within one hand over
the way a station's do. The dial as a *select* survives in one place only — the menu's plate —
which is where a listener goes to hear something other than where they are.

So the radio stands twice, and only one of them is the whole of it: the plate at the foot of
the menu, and on the map **the row naming the open place**, at the head of the column beside
it. There the radio *is* that row's second line — the play/pause mark (`MusicGlyph.svelte`)
and the song behind it (`MusicLine.svelte`) — in place of the show that line used to letter. A
station *is* a show and the map tunes the radio to the open place's own, so where the two
would stand one under the other the line says the more particular of them, and the show goes
on being said by the tile at the head of the same row. The **whole row is the press**: it was
the press with the least to do, being the place the map is already open on, and a row lettered
with a play mark and a song reads as the thing to press. That is `RegionListRow`'s `line` slot
and `pressLabel` plus `RegionSubdivisions`' `pressHead`; with no song loaded the line is the
show and the press opens the place, exactly as before there was a radio. Nothing on the map
draws a second play button — a plain one stood on a row under this for a while, saying the
same two things twice running, which is one radio too many in a column of places.

Before that the play/pause stood *on* the open place's show tile, coming up under the pointer,
with the song in the far corner of that row — which is what `MapBreadcrumb`'s `tile` prop and
`RegionListRow`'s `lead`/`end` slots existed for (a button does not stand inside a button); a
control nobody sees until they point at it is why it came off. Before that the radio was a card
at the foot of the map, and before that a `MapBreadcrumb` at the far end of the bar, where it
took room a path needs. A song's title is a **banner** rather than a
truncation (`MarqueeText.svelte`, whose keyframes are the one piece of CSS in `css/app.css` a
component could not spell as a class): it scrolls end to end, and only when the line is wider
than the box measures. Both
copies of the radio are the same components over the same store, and the map's is what asks
for the collection at all, since the plate is mounted only while the drawer is open. Both
of the listener's choices — which station, and whether it was left on — are remembered in
localStorage (`music-player`) and restored on the next visit. The play is asked for twice:
on the spot, which the browser may refuse since a reload is not a gesture, and then at the
listener's first `click` or `keyup` anywhere on the page, whatever that press was for — a
gesture is a gesture, and that one is allowed. So a radio left on comes back on the moment
its listener touches anything, and until then the plate honestly says Play. A refusal is
never written back as their having turned it off. The lengths that clock is
built out of are the files' and nobody authors them: they are read off audio elements that
load metadata and nothing else, one per song, which is why a station that has not been
measured yet (or holds a file that will not decode) falls back to playing its day order from
the top. The admin `/music` screen's Radio tab is the same three things drawn as a table.
Admin routes: `/characters` (definition editor) — whose `/characters/dashboard` lists
every character in one table, each row headed by the very portrait the game wears and
leading to that character's own pages (`dashboard/<id>/{definition,stats,faces,frames,imported}`);
so a character is authored in one place and there are no per-topic screens over the
whole roster —
`/shows` (TMDB browser), `/music`
(what each vendored song is called and which show it opens) and `/posters` — the whole
roster idling at once on one PixiJS canvas (`@3xl/shared`'s `mugen-poster-grid`), each
character drawn at the size the **combat board** draws it. Not a resemblance: the wall
calls the board's own `characterFitScale` over a box of `CHAR_HEIGHT_RATIO` cell widths,
with that character's `renderScale`, shifted by the same `crownCorrection` its definition
asks for — so a correction authored on `/characters` is judged here against the rest of
the roster, which is the only place a size means anything. One canvas for the lot, because
a browser only allows a handful of WebGL contexts and the roster is dozens of characters.

**Types, utils, and adapters no longer live in the apps** — they moved to `@3xl/shared`
(see below). Only `components/`, `routes/`, `services/`, `css/`, and `i18n/` are per-app.

### Path Aliases

Import aliases are declared identically in each app's `svelte.config.js`. Note that
`$components`/`$services` stay **local to the app**, while
`$utils`/`$types`/`$adapters`/`$sharedComponents` resolve into the **`@3xl/shared`**
package:

```typescript
$components       → src/components/*              (this app)
$services         → src/services/*                (this app)
$adapters         → ../shared/src/adapters/*      (@3xl/shared)
$utils            → ../shared/src/utils/*         (@3xl/shared)
$types            → ../shared/src/types/*         (@3xl/shared)
$sharedComponents → ../shared/src/components/*    (@3xl/shared)
```

So `import { ThemeColors } from '$types/core.type'` and
`import type { CharacterDefinition } from '@3xl/shared/types/character-definition.type'`
reach the same files — use the `$`-alias form inside the SvelteKit apps, and the
`@3xl/shared/...` subpath form from `@3xl/backend` (which has no aliases).

The character registry is **not** an alias — import it from the workspace package:
`import { characters, defaultCharacterId, type CharacterOption } from '@3xl/data';`

---

## Shared package (`@3xl/shared`)

Code consumed by more than one runtime package (`frontend`, `admin`, `backend`). It
**ships raw source** — no build step; consumers transpile it (the SvelteKit apps via
Vite, the backend via `tsx`). It has four subpath exports, which map to the app
aliases above:

```
@3xl/shared/types/*       → src/types/*.ts         ($types  in the apps)
@3xl/shared/utils/*       → src/utils/*.ts         ($utils  in the apps)
@3xl/shared/adapters/*    → src/adapters/*.ts      ($adapters in the apps)
@3xl/shared/components/*  → src/components/*.svelte ($sharedComponents in the apps)
```

Everything but `components/` is framework-agnostic and reachable from the backend
too.

What lives here today:

- **types** — `core.type` (`ThemeColors`, `ThemeSizes`, `ID`, …), `character-definition.type`,
  `mugen-move.type`, `map.type`, `location.type`, `profile.type`, `player-card.type`,
  `tmdb.type`, `navigation.type`.
- **utils** — `mugen/*` (frame sheets, animation, board engine, square board grid,
  PixiJS player),
  `geo/pointInPolygon`, `dice/roll`, `color/compare`, `string/*`, `tmdb/*`
  (client + rate limiter), `routes/get-routes`, `localStorageWritableStore`.
- **adapters** — `adapter.class`, `tmdb.adapter`, `location.adapter`, `profile.adapter`,
  `route.adapter`.
- **components** — the Svelte both apps draw, which today is `CharacterFace`: the
  active portrait framed to the square its Faces page cropped on it. The game wears it
  as the player's avatar (`PlayerAvatar`) and the admin dashboard heads each character's
  row with it, and the whole point is that those are the same picture — a copy per app
  would be a second answer to what a character looks like. App-only UI stays per app;
  a component earns a place here by being drawn in both.

**Rule of thumb:** anything more than one runtime package needs, or that is pure and
framework-agnostic (types, transformers, pure helpers), goes in `@3xl/shared`. App-only
UI state and components stay in the app. When you add a type/util/adapter, add it here,
not in an app.

## Backend API (`@3xl/backend`)

A small **Node/Express 5** server (run with `tsx`) that exists only so the admin SPA can
stay a pure static app. **Dev/authoring only — it is not part of the shipped game.** Pinned
to `http://localhost:2002`; CORS allows only the admin origin (`http://localhost:2001`).

- `GET/POST /api/characters/:id` — read/write a character's
  `definition.json` in `@3xl/data`'s `public/characters/<id>/` (writes straight into the
  git tree; `:id` is constrained to `^[a-z0-9-]+$` to prevent path traversal). Validated
  against constants exported from `@3xl/shared/types/character-definition.type`.
  `PUT /api/characters/:id/label` renames, which is three writes (definition, generated
  registry, `character_templates`) because a display name is mirrored in all three.
  `DELETE /api/characters/:id/frames/:animation/:index` drops one frame, which is two writes:
  the decoded manifest in `@3xl/assets` (what the game reads) *and* the `frame-edits.json`
  record that survives the next import — see "What an import must not undo" above.
- `GET /api/character-templates` + `POST /api/character-templates/sync` — read/sync the
  Supabase `character_templates` table (id + frontend name only) against the local `@3xl/data`
  registry, which is the source of truth. Connects directly to Postgres with the DB password
  (`SUPABASE_DB_KEY`, host derived from `PUBLIC_SUPABASE_URL`) and auto-creates the table;
  the admin `/characters` screen visualises the local↔remote diff and triggers the manual
  sync. `packages/backend/supabase/character_templates.sql` is kept for reference only.
- `GET/POST /api/music` + `DELETE /api/music/:file` — read/upsert/retire one song's
  definition in `@3xl/data`'s `public/music.json` (title + the TMDB id of the show it
  opens), validated against `@3xl/shared/types/music.type`. The songs themselves are
  assets, not entries: `GET /api/music/files` lists the mp3s found in `@3xl/assets`'
  `public/music/`, which is the list the admin `/music` screen is built from — a
  definition answers a file, so a save naming a file that is not there is refused, as is
  a link to a show `public/shows.json` does not hold.
- `GET/POST /api/shows` + `POST /api/shows/refresh` — read/upsert the saved-show collection in
  `@3xl/data`'s `public/shows.json` (a show, every image TMDB holds for it, the author's
  enabled selection per section, and the **glyph** that stands for the show), and re-read
  every saved show's **title and description** from TMDB. `GET /api/shows/icons` lists what
  that glyph may be — the whole `src/icons.ts` listing, the `shows` folder those Noun
  Project marks live in included — and a save is held to it, so the picker
  can never offer one the API would refuse. The game is Catalan, so a saved show's text is Catalan text: `TMDB_LANGUAGE`
  (`@3xl/shared/types/tmdb.type`, `ca-ES` — the only Catalan variant TMDB has) goes on every
  text-bearing call. TMDB answers a field it has no Catalan text for with an empty string rather
  than falling back itself, and a Catalan title with no Catalan overview is common, so each
  field falls back independently to `TMDB_FALLBACK_LANGUAGE`: a details fetch takes it from the
  `translations` appended to the same payload, a search from one extra search of the same query
  matched by id. The refresh moves **only the text** — images, the enabled selection, votes and
  the image URLs are language-independent or hand-curated — and is the one call here that is
  deliberately *not* disk-cached, its whole point being to ask again. A show's name is therefore
  translated data: things that select or order shows key on the TMDB id instead (a show's
  authored icon, the map's seeded-show pool — see above), and `show_templates` in Supabase
  needs a re-sync after a refresh to carry the new names.
- `/api/tmdb/*` — proxy for the admin `/shows` screen. Keeps the TMDB key server-side and
  **disk-caches** every search response, image-list, and image binary under
  `packages/backend/.cache/` (git-ignored) so TMDB is never queried twice for the same thing.
  The cache key includes the language, so a Catalan search never reads an entry written when
  results came back in English. Every image URL it hands the admin points back at *this*
  server (`http://localhost:2002/api/tmdb/image/<size>/<file>`), which is what makes the
  bytes cacheable — and which is exactly what must not be written down, since this server is
  dev-only and `shows.json` ships into the player's static bundle. So a save is **un-proxied**
  first (`@3xl/shared/utils/tmdb/image-cdn`, applied in `POST /api/shows`): the collection
  holds canonical `image.tmdb.org` URLs, which resolve wherever the game is opened, and whose
  `access-control-allow-origin: *` satisfies the pack-opener's fetch-based Pixi loader as well
  as a plain `<img>`. The proxy stays in front of the author's browsing only. A test holds the
  checked-in `shows.json` to that, because a proxied URL in there is a dead image everywhere
  but the author's machine and nothing at run time would notice.

Two of its scripts are run by hand rather than served, on the same DB connection:
`scripts/apply-sql.mts` applies one `supabase/*.sql` file inside a transaction, and
`scripts/reset-battles.mts` (**`pnpm reset:battles`**) puts the map back to the day it was
opened. Fighting writes five tables and one column, and they only mean anything together, so
the reset empties all of them in one transaction: `municipality_holders` (a town with no row
here is drawn on its seed again, which is the point), `municipality_sieges` (wins banked
against a generation that no longer sits anywhere), `municipality_challenges` (an hour
shutting a town for a fight that no longer exists), `battles` (an open fight that can never
be reported now and blocks its player from starting any other), `combat_results` (the ledger
behind every award) and `player_profiles.exp` back to 0, combat being the only thing that
ever raised it. `--keep-exp` leaves the levels standing when what is wanted is a fresh map
rather than fresh accounts; `--dry-run` does the whole thing and rolls it back, so the counts
it prints are the real ones. Nothing else is touched — claimed cards, team slots, boosters,
avatars, usernames and legal acceptances all survive, and a player walks back onto an untaken
map with the roster they had. It runs against the live project and is not reversible.

## Environment variables

Live in the **repo-root `.env`** (git-ignored). The backend loads it explicitly; the
frontend reads the `PUBLIC_`-prefixed ones via SvelteKit's `$env/dynamic/public`.

| Var                        | Used by  | Purpose                                   |
| -------------------------- | -------- | ----------------------------------------- |
| `TMDB_API_KEY`             | backend  | Server-only TMDB key (never sent to browser). |
| `PUBLIC_SUPABASE_URL`      | frontend | Supabase project URL for auth (password + OAuth). |
| `PUBLIC_SUPABASE_ANON_KEY` | frontend | Supabase anon key.                        |
| `SUPABASE_DB_KEY`          | backend  | Supabase **database password** — backend connects to Postgres to sync `character_templates` (never sent to browser). |

The Supabase client degrades gracefully when the `PUBLIC_SUPABASE_*` vars are unset,
so auth-less local dev still works.

### The way in

At the foot of the map, signed out, stands **one button** (`SignInButton.svelte`) — the
slot the player's own plate takes once there is an account. Everything it takes to open
one is on the sheet it raises (`SignInModal.svelte`, mounted at the layout root like every
other modal, and reached from anywhere by `openSignIn()` in `$services/signInModal`): **two
doors**, and a gate that belongs to one press on the sheet — see below.

- **An address and a password** (`EmailSignIn.svelte` → `authService.signInWithPassword` /
  `signUpWithPassword`). One form with two modes, since the fields are the same pair and a
  first-time visitor should not have to know which of the two they are. `MIN_PASSWORD_LENGTH`
  (`@3xl/shared/types/profile.type`) is stated *before* it can be broken, and is only ever
  applied to a password being created — an account made under an older rule is not a reason
  to lock its owner out. This project confirms addresses (`mailer_autoconfirm` is off), so a
  sign-up normally ends **not** signed in: `signUpWithPassword` returns whether a
  confirmation is outstanding and the sheet says a mail is on its way. That message is worded
  to be true of an address that already has an account too, because Supabase deliberately
  answers both cases identically — the difference is exactly what a form must not reveal
  about somebody else's address. Refusals arrive as `CredentialsRejected` carrying one of
  `CREDENTIAL_REJECTIONS`, never the server's English prose, and each is worded from
  `profile.password.rejected.<reason>`; a test holds the catalogue to that list. There is no
  password recovery flow yet — a forgotten password currently has no way back.
- **Google** (`SocialSignIn.svelte`), the only OAuth provider offered. `OAUTH_PROVIDERS`
  (`@3xl/shared/types/profile.type`) still understands **Discord**, so an account linked to
  one keeps working; it is simply not on the sheet. Provider client ids/secrets are *not* env
  vars: they are configured per project in the Supabase dashboard (Authentication →
  Providers), where each must be enabled and given Supabase's callback URL
  (`<PUBLIC_SUPABASE_URL>/auth/v1/callback`) as its redirect URI. The app returns to the site
  root after consent, so `http://localhost:2000` (and the deployed origin) must also be
  listed under Authentication → URL Configuration.

Adding a provider is: enable it in the dashboard, add its id to the `OAuthProvider` enum and
`OAUTH_PROVIDERS`, add its brand mark to `ProviderIcon.svelte`, and offer it in
`SocialSignIn`. Supabase links identities that share a *verified* email onto one user, so a
player who signs in by a different route keeps the same account — which is what makes the two
doors one account and not two. Google supplies a name in `user_metadata`, so those accounts
skip the username prompt that address sign-ups get.

### The legal documents, the gate, and the data rights

The game is played from the Països Catalans, the rest of the EU and the US, so it stands
under the GDPR, the ePrivacy rules, the Spanish LSSI, COPPA and the US state privacy laws
at once. Four documents answer all of them, and they are **content in the one catalogue**
like every other word the player reads: `legal.documents.<id>` in `ca.json` — the terms,
the privacy notice, the storage note and the credits. They are read through svelte-i18n's
`json` store rather than `_`, because a document is a *shape* (headings with paragraphs
under them) and because `_` is ICU: a stray brace in a clause would change what a player
was shown, and legal text is the one text that must arrive exactly as written.

What is *not* in the catalogue is the part code has to agree on: the ids, and the version
each document stands at (`@3xl/shared/types/legal.type.ts`). **Bump `LEGAL_VERSIONS` when
a document changes in substance** — a new purpose for data, a new restriction, a new
recipient; not a typo. Bumping it puts every existing player back through the gate on
their next visit, which is the whole point of versioning an acceptance.

- **The gate** (`LegalConsent.svelte`) is two unticked boxes: an age attestation and
  acceptance of the terms with the privacy notice named alongside. Sixteen, because it is
  the strictest floor GDPR art. 8 lets a member state set and it clears COPPA's thirteen —
  one gate rather than one per country. The privacy notice is *notice*, not the lawful
  basis: the basis for running the game on someone's data is the contract (art. 6(1)(b)),
  which is why nothing here is a consent that could later be withdrawn.
- **It stands in front of the sign-up and nothing else.** On `SignInModal` it is the
  `consent` slot of `EmailSignIn`, drawn in the register tab directly above the button that
  opens the account, and it holds that button alone. Signing back in is not an occasion to
  agree to anything — the acceptance is already on file — and the Google button is not one
  either, since nobody yet knows whether the identity it comes back with is a new account
  or an old one. **`LegalGate` is what answers for the ones the sheet did not ask**: it
  stops any session whose ledger is short, which is every Google newcomer as well as every
  player a document has moved under. Nobody plays without having accepted; where the asking
  happens just depends on where the account came from. (What LegalGate cannot do is take an
  *age* attestation — it records one — so a Google sign-up is currently never asked its age
  on screen.)
- **An acceptance made at the gate has no account to hang it on yet**, so it is held in
  localStorage (`legal-consent-pending`) and flushed by `legal.service.ts` the instant a
  session lands. For a sign-up on a project that confirms addresses, that is a mail's round
  trip away — finished on another device, nothing was held there and LegalGate asks again,
  which is the recovery and not a failure.
- **The record is in Postgres**, never in the browser: `legal_acceptances` keyed
  `(user_id, document, version)`, written only by the security-definer
  `record_legal_acceptance` RPC. Every version ever accepted is kept, because the question
  that gets asked is what they agreed to *at the time*. Nothing else about the moment is
  stored — no IP, no user agent — since what has to be provable is which text was on
  screen and when.
- **`LegalGate.svelte`** (mounted at the layout root) compares the ledger against
  `LEGAL_VERSIONS` at every visit and stops a player whose acceptance is behind. Accept or
  sign out; there is no "later", or the version would mean nothing.
- **The data rights are buttons, not letters** (`AccountDataRights.svelte`, on the settings
  sheet): `export_player_data()` returns everything held about the caller as one JSON
  document (arts. 15 and 20, and the US "right to know"), and `delete_player_account()`
  erases the account, the whole cascade under it and the ledger with it (art. 17). Both
  are RPCs because `auth.users` and several tables are unreachable from a client, and a
  right of access has to answer for the whole of what is held.
- The schema is `packages/backend/supabase/legal_acceptances.sql`, mirrored into
  `ensureTables()` like the rest. A parity test holds its `check (document in (…))`
  constraint to `LEGAL_DOCUMENTS`, since a document the RPC refuses is a gate nobody gets
  through.

**Before the game is published**, fill in `legal.publisher` in `ca.json` — the name,
postal address and tax id of whoever publishes it. They are shipped as `PENDENT —`
placeholders, and both the LSSI (art. 10) and the GDPR (arts. 13–14) require the real
thing.

There is deliberately **no cookie banner**. Nothing is stored for measurement or
advertising; the session, the radio preference and the held acceptance are all either
strictly necessary or user-requested, which is the ePrivacy art. 5(3) / LSSI art. 22.2
exemption. Adding anything analytical changes that answer.

---

## Git & commits

- **Commit directly to `main`** — no feature branches.
- Author is the repo's configured identity (`bearni95` / bernatcanal@gmail.com); do not
  change author or add other authors.
- Commit messages are **concise plain text, no emoji**.
- **Never add a `Co-Authored-By` trailer or a "Generated with …" line** — anywhere.

---

## Architecture Principles

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                    Svelte Components                         │
│              (UI only - no business logic)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Services    │ │   Adapters    │ │    Utils      │
│ (State/Data)  │ │(Transformers) │ │(Pure helpers) │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Components**: Render UI, handle user interactions, dispatch events
**Services**: Manage state, persist to localStorage, provide CRUD operations
**Adapters**: Transform data between formats (API ↔ internal)
**Utils**: Pure functions for common operations

---

## Services

Services manage application state using Svelte stores with automatic localStorage persistence.

### When to Create a Service

- When data needs to persist across sessions (localStorage)
- When multiple components need access to shared state
- When you need CRUD operations on a data collection

### Service Classes

#### ArrayServiceClass<T>

For managing collections of items with unique IDs:

```typescript
// src/services/myItems.service.ts
import { ArrayServiceClass } from '$services/classes/array-service.class';

interface MyItem {
	id: string;
	name: string;
	value: number;
}

export const myItemsService = new ArrayServiceClass<MyItem>('my-items', []);
```

**Available Methods:**

- `add(item)` - Add a new item (throws if ID exists)
- `remove(item)` - Remove an item
- `update(item)` - Update an existing item by ID
- `exists(id)` - Check if item exists, returns item or null
- `all()` - Get all items
- `find(predicate)` - Find first matching item
- `filter(predicate)` - Filter items by predicate

**Using in Components:**

```svelte
<script lang="ts">
	import { myItemsService } from '$services/myItems.service';

	// Subscribe to store for reactive updates
	$: items = $myItemsService.store;

	// Or use methods for operations
	function addItem() {
		myItemsService.add({ id: crypto.randomUUID(), name: 'New', value: 0 });
	}
</script>
```

#### ObjectServiceClass<T>

For managing single objects:

```typescript
// src/services/settings.service.ts
import { ObjectServiceClass } from '$services/classes/object-service.class';

interface Settings {
	id: string;
	theme: 'light' | 'dark';
	language: string;
}

export const settingsService = new ObjectServiceClass<Settings>('settings', {
	id: 'user-settings',
	theme: 'light',
	language: 'en'
});
```

### localStorage Keys

Services automatically namespace their localStorage keys:

- Array services: `array-service:{id}`
- Object services: `object-service:{id}`

### SSR Considerations

Services use the `localStorageWritableStore` utility which automatically handles SSR by falling back to a regular Svelte writable store when `browser` is false.

---

## Adapters

Adapters transform data between external formats (APIs, raw data) and internal application formats. **All data transformation logic belongs in adapters, not in components or services.**

### When to Create an Adapter

- When consuming external API responses
- When transforming data for display
- When preparing data for API submissions
- When mapping between different data structures

### Creating an Adapter

```typescript
// packages/shared/src/adapters/classes/user.adapter.ts
import { AdapterClass } from '$adapters/classes/adapter.class';

interface ApiUser {
	user_id: string;
	first_name: string;
	last_name: string;
	email_address: string;
}

interface User {
	id: string;
	fullName: string;
	email: string;
}

export class UserAdapter extends AdapterClass {
	constructor() {
		super('user');
	}

	fromApi(apiUser: ApiUser): User {
		return {
			id: apiUser.user_id,
			fullName: `${apiUser.first_name} ${apiUser.last_name}`,
			email: apiUser.email_address
		};
	}

	toApi(user: User): Partial<ApiUser> {
		const [firstName, ...lastNameParts] = user.fullName.split(' ');
		return {
			first_name: firstName,
			last_name: lastNameParts.join(' '),
			email_address: user.email
		};
	}

	toDisplayFormat(user: User): string {
		return `${user.fullName} <${user.email}>`;
	}
}

export const userAdapter = new UserAdapter();
```

### Adapter Patterns

1. **Always create static instances** for adapters (singleton pattern)
2. **Name methods clearly**: `fromApi`, `toApi`, `toDisplayFormat`, etc.
3. **Keep transformations pure** - no side effects
4. **Type both input and output** for type safety

---

## Svelte Components

Components must be **modular, atomic, and reusable**. They contain **only UI logic** - all business logic lives in services and adapters.

### Component Rules

1. **No business logic in components** - delegate to services/adapters
2. **No `<style>` tags** - use Tailwind classes only
3. **No inline styles** - use Tailwind classes only
4. **Use `classnames` package** for conditional styling
5. **Props should be typed** with TypeScript
6. **Dispatch events** for parent communication
7. **Keep components small** - break into smaller pieces when needed

### Component Template

```svelte
<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { ThemeColors, ThemeSizes } from '$types/core.type';

	// Props - typed with defaults
	export let label: string = '';
	export let variant: ThemeColors = ThemeColors.Primary;
	export let size: ThemeSizes = ThemeSizes.Medium;
	export let disabled: boolean = false;
	export let classes: string = '';

	// Event dispatcher for parent communication
	const dispatch = createEventDispatcher();

	// Variant mappings (keep in component for UI concerns)
	const variantClasses: Record<ThemeColors, string> = {
		[ThemeColors.Primary]: 'bg-primary text-primary-content',
		[ThemeColors.Secondary]: 'bg-secondary text-secondary-content'
		// ... other variants
	};

	// Reactive class computation using classnames
	$: computedClasses = classNames(
		'base-class',
		variantClasses[variant],
		{
			'opacity-50 cursor-not-allowed': disabled,
			'hover:scale-105': !disabled
		},
		classes // Allow parent to extend classes
	);

	// Event handlers
	function handleClick() {
		if (!disabled) {
			dispatch('click');
		}
	}
</script>

<button class={computedClasses} {disabled} on:click={handleClick}>
	{#if label}
		{label}
	{:else}
		<slot />
	{/if}
</button>
```

### Using `classnames` for Conditional Styling

The `classnames` package is **required** for all conditional class rendering:

```typescript
import classNames from 'classnames';

// String arguments (always applied)
classNames('btn', 'relative', 'flex');

// Object syntax (conditional)
classNames({
	'bg-primary': isPrimary,
	'bg-secondary': isSecondary,
	'opacity-50': disabled
});

// Mixed usage
classNames(
	'btn',
	'relative',
	typeClasses[type],
	{
		'btn-outline': outline,
		'w-full': wide,
		'cursor-pointer': !disabled
	},
	customClasses
);

// Null/undefined values are safely ignored
classNames('btn', null, undefined, '', 'active'); // => 'btn active'
```

### Component Composition

Break complex UIs into smaller, focused components:

```
Card.svelte
├── CardHeader.svelte
├── CardBody.svelte
└── CardFooter.svelte

Form.svelte
├── FormField.svelte
├── FormLabel.svelte
└── FormError.svelte
```

### Event Handling

Components should dispatch events for parent communication:

```svelte
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{
		click: void;
		change: { value: string };
		submit: { data: FormData };
	}>();

	function handleSubmit(data: FormData) {
		dispatch('submit', { data });
	}
</script>
```

---

## CSS & Styling Guidelines

### Absolute Rules

1. **NEVER use `<style>` tags** in Svelte components
2. **NEVER use inline `style` attributes**
3. **ALWAYS use Tailwind CSS classes**
4. **ALWAYS use `classnames`** for conditional rendering

### Tailwind Configuration

This project uses:

- **TailwindCSS v4** (with `@tailwindcss/vite` plugin)
- **DaisyUI v5** for pre-built component classes

### Theme Colors & Sizes

Use the enums from `$types/core.type.ts`:

```typescript
import { ThemeColors, ThemeSizes, ColorsToBackgrounds, ColorsToText } from '$types/core.type';

// Available colors
ThemeColors.Primary; // 'primary'
ThemeColors.Secondary; // 'secondary'
ThemeColors.Accent; // 'accent'
ThemeColors.Success; // 'success'
ThemeColors.Error; // 'error'
ThemeColors.Info; // 'info'
ThemeColors.Warning; // 'warning'
ThemeColors.Neutral; // 'neutral'

// Available sizes
ThemeSizes.XSmall; // 'xs'
ThemeSizes.Small; // 'sm'
ThemeSizes.Medium; // 'md'
ThemeSizes.Large; // 'lg'
ThemeSizes.XLarge; // 'xl'
```

### DaisyUI Components

Prefer DaisyUI classes for common UI patterns:

```html
<!-- Buttons -->
<button class="btn btn-primary btn-sm">Click</button>

<!-- Cards -->
<div class="card bg-base-100 shadow-xl">
	<div class="card-body">Content</div>
</div>

<!-- Inputs -->
<input class="input input-bordered input-primary" />

<!-- Badges -->
<span class="badge badge-success">Active</span>
```

### Responsive Design

Use Tailwind's responsive prefixes:

```html
<div class="flex flex-col md:flex-row lg:gap-4">
	<div class="w-full md:w-1/2 lg:w-1/3">Content</div>
</div>
```

---

## Type Definitions

### Core Types Location

Shared types live in the `@3xl/shared` package (`packages/shared/src/types/`), reached
via the `$types` alias in the apps or the `@3xl/shared/types/*` subpath from the backend:

```typescript
// packages/shared/src/types/core.type.ts             - ThemeColors/Sizes, ID, enums
// packages/shared/src/types/character-definition.type.ts - move kinds, stats, colors
// packages/shared/src/types/tmdb.type.ts              - TMDB API/display shapes
```

### ID Type

Always use the `ID` type for entity identifiers:

```typescript
import type { ID } from '$types/core.type';

interface Entity {
	id: ID; // string | number
	// ...
}
```

---

## Utilities

Utilities are **pure functions** with no side effects.

### Creating Utilities

```typescript
// packages/shared/src/utils/string/slugify.ts
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]+/g, '');
}
```

### Using Utilities

```typescript
import { capitalize } from '$utils/string/capitalize';
import { normalize } from '$utils/string/normalize';

const name = capitalize(normalize(rawInput));
```

---

## Testing

Tests live in the frontend package's `packages/frontend/test/` directory (Vitest +
`@testing-library/svelte`, config in `packages/frontend/vitest.config.ts`). They cover
app services plus the `@3xl/shared` utils/adapters the frontend consumes.

```
packages/frontend/test/
├── services/     # Service unit tests
├── adapters/     # Adapter unit tests
├── utils/        # Utility function tests (dice, board grid, color, localStorage store…)
└── components/   # Component tests (with @testing-library/svelte)
```

### Running Tests

```bash
pnpm test           # Run all tests (from repo root; delegates to @3xl/frontend)
pnpm --filter @3xl/frontend test:ui        # Interactive test UI
pnpm --filter @3xl/frontend test:coverage  # Coverage report
```

---

## i18n (Internationalization)

Use `svelte-i18n` for translations:

```svelte
<script lang="ts">
	import { _ } from 'svelte-i18n';
</script>

<h1>{$_('common.welcome')}</h1><p>{$_('errors.notFound')}</p>
```

Each app keeps its own translations under `src/services/i18n/locales/`.

**The frontend speaks one language: Catalan.** `ca.json` is its catalogue rather than a
translation of one — the game is set in the Països Catalans and there is nothing for a
second language to be a fallback *from*. So `services/i18n/index.ts` registers exactly one
dictionary, uses it as its own `fallbackLocale`, and **never asks the browser**: a reader's
`Accept-Language` says nothing about this game, and adopting it would have meant every
string the catalogue is missing quietly resolving somewhere else. `+layout.ts` only waits
for that dictionary to load; it chooses nothing. (`en.json` is still on disk as the
reference the Catalan was written from, but nothing registers or reads it.)

The one thing that moves the locale is `PUBLIC_I18N_LOCALE`, and the one thing that sets it
is **`pnpm dev:qq`** — `pnpm dev`, all three servers, with the frontend read in the
pseudo-locale `qq.json` (every string replaced by `QQQQQ`, regenerated from `ca.json` by
`scripts/generate-qq-locale.js` before the servers start; only its key set matters, which
is why it must be generated from the catalogue the app actually registers). Under the pin
that dictionary is registered *alone* and is its own fallback too, which is what makes the
run a test rather than a preview: any text still legible on screen is text that never went
through i18n, because there is no other language left for it to fall back to.

This is the frontend's arrangement only — the admin still registers `en` and reads the
browser, as an authoring tool for one author reasonably does.

---

## Quick Reference Checklist

When implementing a new feature:

- [ ] Create types in `@3xl/shared` (`packages/shared/src/types/`) if needed
- [ ] Put pure helpers/transformers in `@3xl/shared` (`utils/`, `adapters/`)
- [ ] Create/extend service in the app's `src/services/` for state management
- [ ] Create component(s) in the app's `src/components/` for UI
- [ ] Use `classnames` for all conditional styling
- [ ] No `<style>` tags or inline styles
- [ ] Components dispatch events, don't contain business logic
- [ ] Write tests in `packages/frontend/test/`
- [ ] Use path aliases (`$services`, `$adapters`, etc.); import the registry from `@3xl/data`
- [ ] Don't hand-edit generated files (registry, manifests, moves, geo) — re-run the script
