import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { characters } from '@3xl/data';
import type { ShowEntry, ShowsCollection } from '@3xl/shared/types/show.type';
import type {
	ShowCharacterAssignments,
	ShowTemplate,
	ShowTemplateSyncResult
} from '@3xl/shared/types/show-template.type';
import { asyncHandler, httpError } from '../http-error';
import { getPool } from '../db';

/**
 * Read/sync API for show "templates" in Supabase — the minimal frontend-facing
 * identity of each saved show (id + display name) mirrored from the local
 * `@3xl/data` `public/shows.json` collection into the `show_templates` table,
 * plus the many-to-many `show_characters` join that assigns characters to shows.
 *
 * The local collection is the source of truth for templates. `GET /` returns the
 * remote state; `POST /sync` makes the remote table mirror the local collection
 * (upsert every local show, delete remote rows that no longer exist locally).
 *
 * Character assignments live only in Supabase — there is no local file for them.
 * `GET /assignments` returns the whole show→characters map; `PUT /:showId/characters`
 * replaces the assignment list for one show, and `PUT /assignments/:characterId`
 * sets the single show one character belongs to.
 *
 * Mirrors ./character-templates: talks to Supabase's Postgres directly via ../db
 * (the DB password) so it can provision the tables itself — no manual SQL step.
 */

// packages/backend/src/routes → packages/data. Same file as ./shows writes.
const SHOWS_PATH = fileURLToPath(new URL('../../../data/public/shows.json', import.meta.url));

// Ensure the tables exist exactly once per process, lazily on first use. We also
// (re)declare `character_templates` here because `show_characters` references it,
// and that table is otherwise only created lazily by ./character-templates —
// which may not have run yet. `character_spawns` (the per-player claimed
// instances behind the frontend's claim panel) is provisioned here too, since it
// references both `character_templates` and `show_templates`; unlike the other
// tables it's RLS-protected (each player only sees/creates their own spawns), as
// the frontend writes it directly with the anon key. That table also carries the
// player's one team, as a `team_slot` on the three cards holding it, written only
// by the `set_team` RPC. `player_profiles` (the
// per-player experience total behind the profile card's level) is provisioned
// here too, along with `combat_results` and the `award_combat_exp` RPC — the
// single path that mutates it, since experience is earned by winning fights and
// nothing else (the old client-driven `add_player_exp` is dropped).
// `player_avatars` (the portraits a player owns — a character *and* a colour per
// row, dealt one per booster pack and no other way) sits beside it, readable only
// by its owner and writable by nobody, with `player_profiles.avatar_character_id`
// / `avatar_color` naming which of them is worn. Finally,
// `booster_claims` (the per-pack rate-limit ledger) plus the `claim_booster`
// security-definer RPC — the only path that inserts spawns or grants an avatar now
// — enforce the daily booster limit (= player level, capped at 20, resetting at midnight
// Europe/Madrid) and the "only towns de festa inside the booster window" rule
// server-side; the client insert policy on `character_spawns` is dropped so the
// rules cannot be bypassed. It reads `festivities` (provisioned lazily by
// ./festivities). `municipality_holders` / `municipality_sieges` (who occupies
// each town on the map, and how far each challenger has got towards taking it)
// round it off — world-readable but written only by award_combat_exp, which
// settles territory in the same transaction as the experience award. Alongside
// them, `municipality_challenges` plus the `start_battle` RPC hold the pacing rule:
// a town a player has just fought is shut to them for an hour (challenge_cooldown()),
// timed from the report rather than from when the arena opened — claimed when the
// fight starts, given its deadline by award_combat_exp, which excuses that hour for
// everyone whose fight was still open when the town changed hands. All DDL is
// idempotent.
let ensured: Promise<void> | null = null;
/**
 * Provision the whole authoring/gameplay schema (tables, RLS, RPCs) idempotently,
 * once per process. Exported so sibling routes that depend on parts of it — e.g.
 * ./users, which reads the booster claims this deploys the shape of — can guarantee
 * it has run before they read or write, rather than relying on a show-templates
 * request having happened first.
 */
export function ensureTables(): Promise<void> {
	if (!ensured) {
		ensured = getPool()
			.query(
				`create table if not exists character_templates (
					id text primary key,
					name text not null,
					updated_at timestamptz not null default now()
				);
				create table if not exists show_templates (
					id bigint primary key,
					name text not null,
					updated_at timestamptz not null default now()
				);
				create table if not exists show_characters (
					show_id bigint not null references show_templates (id) on delete cascade,
					character_id text not null references character_templates (id) on delete cascade,
					primary key (show_id, character_id)
				);
				-- The three reference tables above are world-readable and client-writable
				-- by nobody. A table in an exposed schema with RLS *off* is not a private
				-- table: Supabase's default privileges grant anon and authenticated every
				-- verb on it, so RLS being off is what would let any browser rewrite the
				-- draw pool -- retier a character, or assign one to a show it is not in --
				-- and claim_booster reads exactly these rows to build the pool it rolls
				-- from. The admin sync keeps writing because the backend connects as the
				-- owning role, and an owner is not subject to RLS.
				alter table character_templates enable row level security;
				drop policy if exists character_templates_select_all on character_templates;
				create policy character_templates_select_all on character_templates
					for select using (true);
				alter table show_templates enable row level security;
				drop policy if exists show_templates_select_all on show_templates;
				create policy show_templates_select_all on show_templates
					for select using (true);
				alter table show_characters enable row level security;
				drop policy if exists show_characters_select_all on show_characters;
				create policy show_characters_select_all on show_characters
					for select using (true);
				create table if not exists character_spawns (
						id uuid primary key default gen_random_uuid(),
						user_id uuid not null references auth.users (id) on delete cascade,
						character_id text not null references character_templates (id) on delete cascade,
						show_id bigint references show_templates (id) on delete set null,
						location_id text,
						color text,
						box text,
						created_at timestamptz not null default now()
					);
				alter table character_spawns add column if not exists location_id text;
				alter table character_spawns add column if not exists color text;
				-- The stock the booster box was printed on: 'white' for a town de festa
				-- on the day, 'black' for one whose festa is past or still coming inside
				-- the window. Stamped by claim_booster, which reads it off festivities
				-- rather than taking the browser's word for it, and it is what says which
				-- three colours the card could have been.
				alter table character_spawns add column if not exists box text;
				-- Backfill colours on rows that predate the column, weighting the three
				-- primaries 3x the three secondaries (matches randomSpawnColor).
				update character_spawns cs set color = pick.color
				from (
					select id, case
						when r < 3.0 / 12 then 'red'
						when r < 6.0 / 12 then 'yellow'
						when r < 9.0 / 12 then 'blue'
						when r < 10.0 / 12 then 'orange'
						when r < 11.0 / 12 then 'green'
						else 'purple'
					end as color
					from (select id, random() as r from character_spawns where color is null) seeded
				) pick
				where cs.id = pick.id;
				-- Stamp the box on cards claimed before it was recorded, from the claim
				-- itself: the town the card was pulled in and the Catalan day it was pulled
				-- on, against that town's festivity dates — the very question claim_booster
				-- asks now. NOT from the colour: the colours a box deals can change, and a
				-- black box dealing a purple is meant to be allowed, so reading the stock
				-- back off 'purple' would print that card in white ink. Where the claim
				-- cannot answer — a festa whose date has since been pruned out of the
				-- rolling festivities window — the card is black, the commoner stock.
				update character_spawns cs
					set box = case when exists (
							select 1 from festivities f
							where f.location_id = cs.location_id
								and f.date = (cs.created_at at time zone 'Europe/Madrid')::date
						) then 'white' else 'black' end
					where cs.box is null;
				alter table character_spawns drop constraint if exists character_spawns_box_values;
				alter table character_spawns add constraint character_spawns_box_values
					check (box is null or box in ('white', 'black'));
				-- A claimed card once carried a rolled 1..9 gameplay stat as well. Nothing
				-- reads it any more — a fighter's colour is the whole of what it brings to
				-- a fight — so drop the column and the range check that guarded it.
				alter table character_spawns drop constraint if exists character_spawns_stat_range;
				alter table character_spawns drop column if exists stat;
				-- The player's team, kept on the cards themselves: a card is on the team
				-- when it holds a slot, and the slot is the lane it fields in (0 is the
				-- lead). A team was a browser's own list of ids before this, so it was as
				-- many teams as the player had browsers and none of them anything the
				-- server could read. Now it is the cards, so it travels with the account.
				--
				-- One team per player is the unique index, not a rule written anywhere: a
				-- slot is held by at most one of a player's cards and there are only three
				-- slots, so there is only ever one line-up to field.
				alter table character_spawns add column if not exists team_slot smallint;
				alter table character_spawns drop constraint if exists character_spawns_team_slot_range;
				alter table character_spawns add constraint character_spawns_team_slot_range
					check (team_slot is null or (team_slot >= 0 and team_slot < 3));
				create unique index if not exists character_spawns_team_slot_idx
					on character_spawns (user_id, team_slot) where team_slot is not null;
				alter table character_spawns enable row level security;
				drop policy if exists character_spawns_select_own on character_spawns;
				create policy character_spawns_select_own on character_spawns
						for select using (auth.uid() = user_id);
				drop policy if exists character_spawns_insert_own on character_spawns;
				create policy character_spawns_insert_own on character_spawns
						for insert with check (auth.uid() = user_id);
				drop policy if exists character_spawns_delete_own on character_spawns;
				create policy character_spawns_delete_own on character_spawns
						for delete using (auth.uid() = user_id);
				-- Every card a player holds, for every visitor — what their public profile
				-- page is drawn from: the side they field (the ones carrying a team_slot,
				-- already drawn on every town they hold) and the collection those came
				-- out of. The collection is public, which it was not: this shipped as
				-- player_teams_public, the fielded three alone, and a collection is what
				-- a player has to show for playing. That narrower view is dropped below.
				-- Definer-owned (security_invoker off) so it reads past the select-own
				-- policy above, and carrying no id: a spawn id is the handle a client
				-- acts on a card with, and there is nothing anybody may do to somebody
				-- else's card.
				create or replace view player_spawns_public
					with (security_invoker = false) as
					select user_id, team_slot, character_id, show_id, location_id, color, box, created_at
					from character_spawns;
				revoke all on player_spawns_public from anon, authenticated;
				grant select on player_spawns_public to anon, authenticated;
				drop view if exists player_teams_public;
				-- Set the caller's team: p_team is the three slots in fielded order, as spawn
				-- ids with null for an empty one. It replaces whatever they had — there is one
				-- team, so saving a line-up is saving THE line-up.
				--
				-- security definer because character_spawns takes no client update at all;
				-- this writes exactly one column, on rows the caller owns, and it is the only
				-- path to it. What it proves is ownership and nothing else: the cards are the
				-- caller's, each named once, and the lead slot is filled. A side used to have
				-- to be one colour's — every member sharing a colour with the lead, checked
				-- here by a teammate_colors function dropped below — and it does not any more:
				-- a player fields any three of their own cards, whatever colours they carry
				-- and whatever shows they came out of.
				create or replace function set_team(p_team jsonb)
				returns void language plpgsql security definer set search_path = public as $set_team$
				declare
						v_uid uuid := auth.uid();
						v_size constant int := 3;
						v_ids uuid[];
						v_named int;
						v_given int;
						v_distinct int;
						v_owned int;
						v_lead_color text;
				begin
						if v_uid is null then
								raise exception 'You must be signed in to field a team.';
						end if;
						if p_team is null or jsonb_typeof(p_team) <> 'array'
							or jsonb_array_length(p_team) <> v_size then
								raise exception 'A team is a line-up of % slots.', v_size;
						end if;
						-- The slots, in order. An id is cast only where it looks like a uuid, so
						-- junk in a slot is answered with the rule it broke rather than with a
						-- cast error about the shape of a uuid.
						select array_agg(
									case when e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
										then e.value::uuid end
									order by e.ord),
								count(*) filter (where e.value is not null)
							into v_ids, v_named
							from jsonb_array_elements_text(p_team) with ordinality as e(value, ord);
						select count(*), count(distinct x) into v_given, v_distinct
							from unnest(v_ids) as x where x is not null;
						if v_given <> v_named then
								raise exception 'A team slot holds one of your cards, or nothing.';
						end if;
						if v_distinct <> v_given then
								raise exception 'A fighter cannot be fielded twice.';
						end if;
						-- Serialise this player's mutations, matching claim_booster.
						perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
						select count(*) into v_owned from character_spawns
							where user_id = v_uid and id = any(v_ids);
						if v_owned <> v_given then
								raise exception 'Every fighter must be one of your own claimed cards.';
						end if;
						-- The lead is the first slot: a side stands behind somebody, so cards in
						-- the slots behind an empty one are not a line-up. Its colour is read only
						-- to answer that — what the lead is no longer says anything about who may
						-- stand behind it.
						select cs.color into v_lead_color from character_spawns cs
							where cs.user_id = v_uid and cs.id = v_ids[1];
						if v_lead_color is null and v_given > 0 then
								raise exception 'A team is led by its first card; fill that slot first.';
						end if;
						-- Cleared first, so the line-up being saved never collides with the one it
						-- replaces over a slot they both use.
						update character_spawns set team_slot = null
							where user_id = v_uid and team_slot is not null;
						update character_spawns cs set team_slot = s.slot
							from (
								select (i - 1)::smallint as slot, v_ids[i] as spawn_id
								from generate_subscripts(v_ids, 1) as i
							) s
							where cs.user_id = v_uid and cs.id = s.spawn_id;
				end;
				$set_team$;
				grant execute on function set_team(jsonb) to authenticated;
				-- The colour relation as a SQL function existed for the check set_team no
				-- longer makes, and nothing else in the database ever called it. Dropped after
				-- the function that used it is replaced, so no rule stands here that is not
				-- enforced; the relation lives on in @3xl/shared utils/color/compare.ts, where
				-- the browser draws a town's seeded garrison with it.
				drop function if exists teammate_colors(text);
				-- Per-player progression: an accumulated experience total the frontend
				-- reads to derive a level (D&D 5e table). RLS lets a player read only
				-- their own row; it is never written directly — the award_combat_exp RPC
				-- further down (security definer) is the only path that mutates it, and it
				-- derives the amount itself from a finished fight, so a client can neither
				-- set an arbitrary total nor name its own increment.
				create table if not exists player_profiles (
						user_id uuid primary key references auth.users (id) on delete cascade,
						exp bigint not null default 0,
						created_at timestamptz not null default now(),
						updated_at timestamptz not null default now()
					);
				-- The avatar the player wears, as the two halves that name one: the
				-- character whose portrait it is, and the colour it is printed in.
				-- Purely cosmetic, and the only part of this row a player sets
				-- themselves — through set_player_avatar below, since the table takes no
				-- client writes at all. Both null (the default) leaves them on the
				-- initial-letter avatar; the pair is only ever set or cleared together,
				-- because an avatar IS the pair (see player_avatars just below). Which
				-- portrait each character shows is not stored here: it is the
				-- definition's own face, authored on the admin's per-character Faces page,
				-- so re-cropping it there moves every player's avatar with it.
				alter table player_profiles add column if not exists avatar_character_id text
					references character_templates (id) on delete set null;
				alter table player_profiles add column if not exists avatar_color text;
				-- Avatars worn under the retired rule (own the character in all six card
				-- colours) carry no colour, and a portrait without one is no longer an
				-- avatar. There is nothing to infer — the old choice never named a colour
				-- — so these go back to the letter avatar and the boxes deal them a real
				-- one.
				update player_profiles set avatar_character_id = null
					where avatar_character_id is not null and avatar_color is null;
				-- The avatars a player owns: one row per portrait held, and what a
				-- portrait IS, is the pair it carries — the character it shows and the
				-- colour it is printed in. An avatar is an item now rather than a
				-- permission: booster boxes deal them (one per pack, see claim_booster
				-- below), and that is the only way one comes to exist, which is why this
				-- table has no client write policy at all. RLS lets a player read their
				-- own. Unique on (player, character, colour): a box that deals a pair
				-- already held hands the held row back rather than minting a second.
				create table if not exists player_avatars (
						id uuid primary key default gen_random_uuid(),
						user_id uuid not null references auth.users (id) on delete cascade,
						character_id text not null references character_templates (id) on delete cascade,
						color text not null,
						show_id bigint references show_templates (id) on delete set null,
						location_id text,
						granted_at timestamptz not null default now()
					);
				create unique index if not exists player_avatars_owned_key
					on player_avatars (user_id, character_id, color);
				create index if not exists player_avatars_user_idx
					on player_avatars (user_id, granted_at desc);
				alter table player_avatars enable row level security;
				drop policy if exists player_avatars_select_own on player_avatars;
				create policy player_avatars_select_own on player_avatars
						for select using (auth.uid() = user_id);
				-- The player's chosen name, and the only place in the schema one is stored.
				-- Never derived: not from the full_name Google and Discord stamp onto the
				-- auth user, not from the address a magic link went to. Null means
				-- nameless, which is where every account starts and may stay, and
				-- set_player_username below is the only writer. Unique across the game,
				-- case-insensitively, with nulls left out of the index so any number of
				-- accounts can be nameless at once.
				alter table player_profiles add column if not exists username text;
				create unique index if not exists player_profiles_username_key
					on player_profiles (lower(username))
					where username is not null;
				-- Usernames are public; the experience beside them is not. RLS grants
				-- rows, not columns, so the public column gets a view of its own —
				-- definer-owned (security_invoker off), so it reads past the table's
				-- select-own policy, and selecting nothing but the name.
				create or replace view player_names
					with (security_invoker = false) as
					select user_id, username from player_profiles where username is not null;
				-- Read, and only read. A view over one table with no aggregate is
				-- auto-updatable, Supabase's default privileges hand anon and
				-- authenticated every verb on anything new in this schema, and a
				-- definer view is not subject to the table's RLS — so a bare grant
				-- would open a write path the table itself refuses. Every definer
				-- view here revokes first; any new one must too.
				revoke all on player_names from anon, authenticated;
				grant select on player_names to anon, authenticated;
				-- The plate a player is read by, for every visitor: the name, the picture,
				-- and the experience the level on it comes from — what /profile/[id]
				-- draws. It is the one thing the view above deliberately would not open,
				-- so: a level is what a player is ranked by, it is already on the plate at
				-- the map's corner and on every town its owner holds, and a profile page
				-- that would not say it is not a profile. What stays shut is how the
				-- account signs in, none of which is on this table. Nameless accounts are
				-- kept, unlike player_names — they still have a level and still field a
				-- team, and the page words the missing name itself.
				create or replace view player_profiles_public
					with (security_invoker = false) as
					select user_id, username, exp, avatar_character_id, avatar_color, created_at
					from player_profiles;
				revoke all on player_profiles_public from anon, authenticated;
				grant select on player_profiles_public to anon, authenticated;
				alter table player_profiles enable row level security;
				drop policy if exists player_profiles_select_own on player_profiles;
				create policy player_profiles_select_own on player_profiles
						for select using (auth.uid() = user_id);
				-- Wear one of the caller's own avatars, named by the pair that IS one: a
				-- character and a colour (nulls clear back to the letter avatar).
				-- security definer because player_profiles has no client write policy —
				-- this writes exactly two cosmetic columns and can never touch exp. The
				-- rule it enforces is ownership, and it is the rule: the caller must hold
				-- a player_avatars row for that exact pair, which only a booster box can
				-- have put there. The picker only shows what is held, but this is what
				-- decides, so a crafted call cannot wear a portrait nobody dealt it.
				-- The one-argument version enforced the retired six-colours rule and is
				-- dropped: a call with no colour predates avatars being items, and there
				-- is no colour to guess for it.
				drop function if exists set_player_avatar(text);
				create or replace function set_player_avatar(p_character_id text, p_color text)
				returns text language plpgsql security definer set search_path = public as $set_player_avatar$
				declare
						v_uid uuid := auth.uid();
				begin
						if v_uid is null then
								raise exception 'You must be signed in to choose an avatar.';
						end if;
						-- Either half missing means the letter avatar, and neither is stored.
						if p_character_id is null or p_color is null then
								insert into player_profiles (user_id, avatar_character_id, avatar_color)
										values (v_uid, null, null)
										on conflict (user_id) do update
												set avatar_character_id = null,
														avatar_color = null,
														updated_at = now();
								return null;
						end if;
						if not exists (
								select 1 from player_avatars a
								where a.user_id = v_uid
									and a.character_id = p_character_id
									and a.color = p_color
						) then
								raise exception 'You do not hold that avatar. Open booster packs to be dealt one.';
						end if;
						insert into player_profiles (user_id, avatar_character_id, avatar_color)
								values (v_uid, p_character_id, p_color)
								on conflict (user_id) do update
										set avatar_character_id = excluded.avatar_character_id,
												avatar_color = excluded.avatar_color,
												updated_at = now();
						return p_character_id;
				end;
				$set_player_avatar$;
				grant execute on function set_player_avatar(text, text) to authenticated;
				-- Set, change, or clear (with null or blank) the caller's username.
				-- security definer for the same reasons as the avatar — the table takes
				-- no client writes, and this touches one column and can never reach exp
				-- — and because uniqueness cannot be checked by a caller who, under RLS,
				-- sees only their own row. Nothing is defaulted or back-filled from the
				-- identity they signed in with: a name has to be typed to get here, and
				-- passing nothing simply makes them nameless again.
				create or replace function set_player_username(p_username text)
				returns text language plpgsql security definer set search_path = public as $set_player_username$
				declare
						v_uid uuid := auth.uid();
						-- Blank, whitespace and null all mean the same thing: no name.
						v_name text := nullif(btrim(coalesce(p_username, '')), '');
				begin
						if v_uid is null then
								raise exception 'You must be signed in to choose a username.';
						end if;
						if v_name is not null then
								if char_length(v_name) < 3 or char_length(v_name) > 32 then
										raise exception 'A username is between 3 and 32 characters.'
												using errcode = '22023';
								end if;
								-- ASCII letters, digits and the underscore, and nothing else — the
								-- accents, spaces and punctuation the old rule allowed are how one
								-- player comes to be mistaken for another. Not [[:alnum:]], which
								-- takes accented letters back in under a UTF-8 collation. Stated for
								-- the screens in @3xl/shared's types/profile.type.ts; decided here.
								if v_name !~ '^[A-Za-z0-9_]+$' then
										raise exception 'A username may use letters, digits and underscores only.'
												using errcode = '22023';
								end if;
								-- Checked here as well as by the index, so the answer is a sentence
								-- rather than a constraint name. Case-insensitive: one Bernat is enough.
								if exists (
										select 1 from player_profiles p
										where p.user_id <> v_uid and lower(p.username) = lower(v_name)
								) then
										raise exception 'That username is already taken.' using errcode = '23505';
								end if;
						end if;
						insert into player_profiles (user_id, username)
								values (v_uid, v_name)
								on conflict (user_id) do update
										set username = excluded.username,
												updated_at = now();
						return v_name;
				exception
						-- Two players naming themselves the same thing at the same moment: the
						-- index decides, and the loser is told the same thing.
						when unique_violation then
								raise exception 'That username is already taken.' using errcode = '23505';
				end;
				$set_player_username$;
				grant execute on function set_player_username(text) to authenticated;
				-- Retire the client-driven award path: add_player_exp(amount) took the
				-- increment straight from the browser, so anyone holding the anon key could
				-- grant themselves any total. Experience now comes from combat only, via
				-- award_combat_exp below.
				drop function if exists add_player_exp(bigint);
					-- One row per booster box a player has opened, written only by the
					-- claim_booster RPC below -- and the record the whole rule is enforced
					-- against: one box per player, per town, per year, per stock (see the
					-- unique index below). RLS lets a player read only their own claims,
					-- which is what the game greys the taken boxes out of.
					create table if not exists booster_claims (
							id uuid primary key default gen_random_uuid(),
							user_id uuid not null references auth.users (id) on delete cascade,
							show_id bigint references show_templates (id) on delete set null,
							location_id text not null,
							box text,
							year integer,
							claimed_at timestamptz not null default now()
						);
					alter table booster_claims add column if not exists box text;
					alter table booster_claims add column if not exists year integer;
					-- Rows written under the old daily allowance carry neither column, and
					-- have to be given both or the index below would file every one of them
					-- under the same (null, null) pair. The stock comes off the box's own
					-- cards -- a claim and its five spawns are one transaction, so they share
					-- now() exactly -- and the year off when it was opened, which is the
					-- festa's own except across New Year.
					update booster_claims bc set box = s.box
					from (
						select distinct on (user_id, location_id, created_at)
							user_id, location_id, created_at, box
						from character_spawns where box is not null
					) s
					where bc.box is null
						and s.user_id = bc.user_id
						and s.location_id = bc.location_id
						and s.created_at = bc.claimed_at;
					update booster_claims set box = 'black' where box is null;
					update booster_claims
						set year = extract(year from (claimed_at at time zone 'Europe/Madrid'))::int
						where year is null;
					-- A day's allowance let one player open a town's box many times over.
					-- Keep the first of each (player, town, year, stock) so the unique index
					-- can be created at all; only the claim rows go, never the cards they
					-- dealt.
					delete from booster_claims bc
					using booster_claims keep
					where bc.user_id = keep.user_id
						and bc.location_id = keep.location_id
						and bc.year = keep.year
						and bc.box = keep.box
						and (keep.claimed_at, keep.id) < (bc.claimed_at, bc.id);
					alter table booster_claims alter column box set not null;
					alter table booster_claims alter column year set not null;
					alter table booster_claims drop constraint if exists booster_claims_box_stock;
					alter table booster_claims add constraint booster_claims_box_stock
						check (box in ('white', 'black'));
					-- The rule itself. claim_booster asks before it rolls, so a refusal is a
					-- sentence; this is what makes the check and the insert atomic.
					create unique index if not exists booster_claims_once_idx
						on booster_claims (user_id, location_id, year, box);
					drop index if exists booster_claims_user_day_idx;
					create index if not exists booster_claims_user_year_idx
						on booster_claims (user_id, year);
					-- The daily allowance and everything that paid into it, dropped in
					-- dependency order (recycle_spawns and the granting functions call
					-- grant_boosters, which reads booster_grants alongside
					-- booster_allowance). boosters_status goes with them: what is left to
					-- open is no longer a number the server adds up but the window's festes
					-- minus the rows above, and the browser holds both halves. level_for_exp
					-- stays -- a player still has a level, it simply no longer buys boxes.
					drop function if exists recycle_spawns(uuid[]);
					drop function if exists grant_level_up_boosters(uuid, bigint, bigint);
					drop function if exists grant_boosters(uuid, int, text, text);
					drop function if exists booster_allowance(uuid);
					drop function if exists daily_booster_allowance(int);
					drop function if exists boosters_status();
					drop table if exists booster_grants;
					alter table booster_claims enable row level security;
					drop policy if exists booster_claims_select_own on booster_claims;
					create policy booster_claims_select_own on booster_claims
							for select using (auth.uid() = user_id);
					-- Enforcement: players may no longer insert spawns directly. Opening a
					-- box now goes exclusively through claim_booster (security definer),
					-- which applies the festa-window and one-box-per-town-year-stock rules
					-- server-side.
					-- Reading/deleting one's own spawns stays client-side (policies kept).
					drop policy if exists character_spawns_insert_own on character_spawns;
					-- Player level from an accumulated experience total, using the same
					-- cumulative D&D 5e thresholds as @3xl/shared utils/progression/level.ts
					-- (levelForExp); level 20 is the cap. Keep these in sync with that file.
					create or replace function level_for_exp(p_exp bigint)
					returns int language sql immutable set search_path = public as $level_for_exp$
						select case
							when p_exp >= 355000 then 20
							when p_exp >= 305000 then 19
							when p_exp >= 265000 then 18
							when p_exp >= 225000 then 17
							when p_exp >= 195000 then 16
							when p_exp >= 165000 then 15
							when p_exp >= 140000 then 14
							when p_exp >= 120000 then 13
							when p_exp >= 100000 then 12
							when p_exp >= 85000 then 11
							when p_exp >= 64000 then 10
							when p_exp >= 48000 then 9
							when p_exp >= 34000 then 8
							when p_exp >= 23000 then 7
							when p_exp >= 14000 then 6
							when p_exp >= 6500 then 5
							when p_exp >= 2700 then 4
							when p_exp >= 900 then 3
							when p_exp >= 300 then 2
							else 1
						end;
					$level_for_exp$;
					-- Open a booster box for the caller, enforced entirely server-side:
					--   * the town (p_location_id) must be celebrating a festa major inside
					--     the booster window — a festivities row for a Catalan date from 3
					--     days back through 4 days ahead of today (a festa major runs over
					--     its weekend, not one evening); keep in step with
					--     @3xl/shared utils/festes/booster-window.ts and with the festivity
					--     sync's lower bound in ./festivities.ts;
					--   * one box per player, per town, per year, per stock. A town deals two
					--     boxes a year -- the white one printed on the day of its festa and
					--     the black one around it -- and neither twice. The year is the
					--     festa's own, not the opener's day, so a celebration reached across
					--     New Year is still the one box.
					-- It then rolls 5 cards from the town's show — the caller's p_show_id
					-- only while nobody holds the town, its occupier's team's show once
					-- somebody does (read off municipality_holders below) — from that
					-- show's assigned, template-backed roster
					-- (weighted by rarity), each taking one of the three colours its box
					-- holds, plus ONE avatar drawn from those same two possibilities — a
					-- character on this show, in one of this box's colours — and returns
					-- both, in one jsonb object: { "spawns": [...], "avatar": {...} }.
					-- Two shapes, so one object rather than a row set; the function is
					-- dropped first because Postgres will not replace a return type in
					-- place. An avatar the player already holds is not dealt twice — the
					-- insert hands the held row back, so the pack still shows what it gave.
					--
					-- Which box that is, it decides itself from the same festivities row the
					-- window check reads -- the town's nearest festa to today, which is the
					-- whole of what the box is, its stock and its year both. Celebrating
					-- TODAY the town deals the white box, holding the secondaries
					-- (purple/green/orange); past or still to come inside the window, the
					-- black one, holding the primaries (red/blue/yellow). The same
					-- white/black the boxes are printed on and the map draws its discs in —
					-- but read here, not taken from the browser, and stamped on every card
					-- as character_spawns.box and on the claim itself. Inside a box the three
					-- colours are equally likely: the rare thing is the white box, there
					-- being one day of it against the window's other seven. Keep the triples
					-- in step with BOX_SPAWN_COLORS in @3xl/shared utils/spawn/color.ts.
					-- A per-user advisory lock serialises concurrent opens so a town's one
					-- box cannot be taken twice by racing the check; the unique index is the
					-- backstop under it. security definer: it inserts despite
					-- character_spawns now having no client insert policy.
					-- Weighted pick out of a pool: the ids, their weights, the weights'
					-- sum, one id back. Its own function because claim_booster draws from
					-- the same pool twice — once per card and once for the avatar — and
					-- two copies of a draw are two things to keep in step.
					create or replace function pick_weighted(
							p_ids text[],
							p_weights numeric[],
							p_total numeric
					)
					returns text language plpgsql volatile set search_path = public as $pick_weighted$
					declare
							v_roll numeric := random() * p_total;
							j int;
					begin
							for j in 1..array_length(p_ids, 1) loop
									v_roll := v_roll - p_weights[j];
									if v_roll < 0 then
											return p_ids[j];
									end if;
							end loop;
							-- Floating-point slack at the top of the range: the last id answers.
							return p_ids[array_length(p_ids, 1)];
					end;
					$pick_weighted$;
					drop function if exists claim_booster(bigint, text);
					create or replace function claim_booster(p_show_id bigint, p_location_id text)
					returns jsonb
					language plpgsql security definer set search_path = public as $claim_booster$
					declare
							v_uid uuid := auth.uid();
							v_today date := (now() at time zone 'Europe/Madrid')::date;
							-- The booster window around today (see the comment above).
							v_days_behind constant int := 3;
							v_days_ahead constant int := 4;
							v_size constant int := 5;
							v_festa date;
							v_year int;
							v_ids text[];
							v_rarities int[];
							v_weights numeric[];
							v_total numeric;
							v_pick text;
							v_color text;
							v_box text;
							v_colors text[];
							v_lead text;
							v_ruling_show bigint;
							v_show_id bigint;
							v_row character_spawns%rowtype;
							v_avatar player_avatars%rowtype;
							v_spawns jsonb := '[]'::jsonb;
							i int;
					begin
							if v_uid is null then
									raise exception 'You must be signed in to open a booster.';
							end if;
							if p_location_id is null or p_location_id = '' then
									raise exception 'A location is required to open a booster.';
							end if;
							-- Serialise this player's opens so the check below can't be raced.
							perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
							-- The festa this box is printed for: the town's nearest one inside
							-- the window, which is today's whenever it has one. Its stock and
							-- its year both come off this one date, so a town with no festa in
							-- range has no box at all.
							select f.date into v_festa
									from festivities f
									where f.location_id = p_location_id
											and f.date between v_today - v_days_behind and v_today + v_days_ahead
									order by abs(f.date - v_today), f.date
									limit 1;
							if v_festa is null then
									raise exception 'This town is not celebrating a festa major these days.';
							end if;
							-- White while the festa is on, black around it; and the year is the
							-- festa's, so a celebration reached across New Year is one box.
							v_year := extract(year from v_festa)::int;
							if v_festa = v_today then
									v_box := 'white';
									v_colors := array['purple', 'green', 'orange'];
							else
									v_box := 'black';
									v_colors := array['red', 'blue', 'yellow'];
							end if;
							-- One box per player, per town, per year, per stock. Asked before
							-- anything is rolled so the refusal is a sentence a player can read;
							-- the unique index on the table is what makes it impossible.
							if exists (
									select 1 from booster_claims c
									where c.user_id = v_uid
											and c.location_id = p_location_id
											and c.year = v_year
											and c.box = v_box
							) then
									raise exception 'You have already opened this town''s % box for %.', v_box, v_year;
							end if;
							-- Which show this town's boxes deal. A town nobody has taken deals
							-- the show its own geometry seeds it with — an answer the browser
							-- works out from the polygons, which live only there, so that one
							-- arrives as p_show_id and is taken as given. A town somebody HOLDS deals its occupier's
							-- show instead: the sitting team's lead's, exactly as the map
							-- labels the town, read here rather than accepted from the caller
							-- because which show a conquered town deals is a consequence of the
							-- conquest and not the browser's to choose. It follows the town by
							-- itself: the holder row is rewritten the moment the town changes
							-- hands, and the next pack opened there is already the new show's.
							-- A lead on several shows resolves to the alphabetically first, the
							-- same tie the browser breaks (showIdsByCharacter in @3xl/shared
							-- utils/spawn/team-show.ts walks the shows in name order); a lead on
							-- no show at all leaves the box as the caller found it.
							v_show_id := p_show_id;
							select h.team->0->>'character_id' into v_lead
									from municipality_holders h
									where h.location_id = p_location_id;
							if v_lead is not null then
									select sc.show_id into v_ruling_show
											from show_characters sc
											join show_templates st on st.id = sc.show_id
											where sc.character_id = v_lead
											order by st.name, sc.show_id
											limit 1;
									v_show_id := coalesce(v_ruling_show, v_show_id);
							end if;
							-- Roll pool: characters assigned to the show (any show when null) that
							-- exist as templates, with their rarity tiers.
							with pool as (
									select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
									from show_characters sc
									join character_templates ct on ct.id = sc.character_id
									where v_show_id is null or sc.show_id = v_show_id
							)
							select array_agg(id order by id), array_agg(rarity order by id)
									into v_ids, v_rarities
							from pool;
							if v_ids is null or array_length(v_ids, 1) is null then
									raise exception 'There are no claimable characters for this show.';
							end if;
							-- Selection weights: tier 0 weighs 1, each higher tier 2x rarer
							-- (matches rarityWeight / RARITY_STEP_FACTOR in @3xl/shared).
							select array_agg(w order by ord), sum(w)
									into v_weights, v_total
							from (
									select ord, 1.0 / (2 ^ r) as w
									from unnest(v_rarities) with ordinality as t(r, ord)
							) s;
							-- Record the box as taken, then roll its cards. This is the row that
							-- spends the town's year, so it is written before anything is dealt.
							insert into booster_claims (user_id, show_id, location_id, box, year)
									values (v_uid, v_show_id, p_location_id, v_box, v_year);
							for i in 1..v_size loop
									-- Weighted-by-rarity pick (matches weightedRarityIndex), then a
									-- colour: one of the box's three, each equally likely.
									v_pick := pick_weighted(v_ids, v_weights, v_total);
									v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
									insert into character_spawns (user_id, character_id, show_id, location_id, color, box)
											values (v_uid, v_pick, v_show_id, p_location_id, v_color, v_box)
											returning * into v_row;
									v_spawns := v_spawns || to_jsonb(v_row);
							end loop;
							-- The pack's avatar: one portrait, drawn exactly as a card is — the
							-- same rarity-weighted pool, the same three colours — because what a
							-- box can deal is what a box can deal, whichever kind of thing comes
							-- out of it. A pair already held is not a second item: the conflict
							-- clause touches nothing and hands the held row back, so the pack
							-- still has an avatar to show.
							v_pick := pick_weighted(v_ids, v_weights, v_total);
							v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
							insert into player_avatars (user_id, character_id, color, show_id, location_id)
									values (v_uid, v_pick, v_color, v_show_id, p_location_id)
									on conflict (user_id, character_id, color) do update
											set granted_at = player_avatars.granted_at
									returning * into v_avatar;
							return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar));
					end;
					$claim_booster$;
					grant execute on function claim_booster(bigint, text) to authenticated;
					-- The welcome box: the one booster a player is given rather than has
					-- to go and find. It deals exactly what a town's box deals -- five
					-- rarity-weighted cards and one avatar out of one show's roster, each
					-- in one of the three colours its stock holds -- and differs in three
					-- ways only: there is no festa and so no window, no stock and no year
					-- to read off one; the show is the caller's own pick, passed and not
					-- derived, since the box stands on no polygon and nobody holds it; and
					-- it is one per player full stop, which is why the year is 0 and not
					-- the year it was opened in (a year that moved would deal a second
					-- welcome every January).
					-- It is NOT a rule of its own: "one and no more" is already the unique
					-- index on (user_id, location_id, year, box), and all this box needs is
					-- a town and a year no festa can ever produce. Keep the three constants
					-- in step with welcome-box.ts in @3xl/shared.
					create or replace function claim_welcome_booster(p_show_id bigint)
					returns jsonb
					language plpgsql security definer set search_path = public as $claim_welcome_booster$
					declare
							v_uid uuid := auth.uid();
							v_location constant text := 'benvinguda';
							v_year constant int := 0;
							v_box constant text := 'white';
							v_colors constant text[] := array['purple', 'green', 'orange'];
							v_size constant int := 5;
							v_ids text[];
							v_rarities int[];
							v_weights numeric[];
							v_total numeric;
							v_pick text;
							v_color text;
							v_row character_spawns%rowtype;
							v_avatar player_avatars%rowtype;
							v_spawns jsonb := '[]'::jsonb;
							i int;
					begin
							if v_uid is null then
									raise exception 'You must be signed in to open a booster.';
							end if;
							if p_show_id is null then
									raise exception 'Choose a show to open your welcome box.';
							end if;
							-- The same per-user lock claim_booster takes, so a welcome and a
							-- town's box cannot be opened at the same instant either.
							perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
							-- One to a player. Asked on the location alone: the year and the
							-- stock are constants here, so a row under this town is the
							-- welcome box whatever else is on it.
							if exists (
									select 1 from booster_claims c
									where c.user_id = v_uid and c.location_id = v_location
							) then
									raise exception 'You have already opened your welcome box.';
							end if;
							-- Roll pool: the chosen show's cast that exists as templates.
							-- There is no "any show" case -- a box with no show is a box with
							-- no cover, and this one is chosen by its cover.
							with pool as (
									select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
									from show_characters sc
									join character_templates ct on ct.id = sc.character_id
									where sc.show_id = p_show_id
							)
							select array_agg(id order by id), array_agg(rarity order by id)
									into v_ids, v_rarities
							from pool;
							if v_ids is null or array_length(v_ids, 1) is null then
									raise exception 'There are no claimable characters for this show.';
							end if;
							select array_agg(w order by ord), sum(w)
									into v_weights, v_total
							from (
									select ord, 1.0 / (2 ^ r) as w
									from unnest(v_rarities) with ordinality as t(r, ord)
							) s;
							-- Record the box as taken, then roll its cards.
							insert into booster_claims (user_id, show_id, location_id, box, year)
									values (v_uid, p_show_id, v_location, v_box, v_year);
							for i in 1..v_size loop
									v_pick := pick_weighted(v_ids, v_weights, v_total);
									v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
									insert into character_spawns (user_id, character_id, show_id, location_id, color, box)
											values (v_uid, v_pick, p_show_id, v_location, v_color, v_box)
											returning * into v_row;
									v_spawns := v_spawns || to_jsonb(v_row);
							end loop;
							-- The box's avatar, drawn exactly as a card is. Very likely the
							-- first portrait its player holds: the browser puts it on for
							-- anybody still wearing the initial-letter avatar, through
							-- set_player_avatar like any other choice.
							v_pick := pick_weighted(v_ids, v_weights, v_total);
							v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
							insert into player_avatars (user_id, character_id, color, show_id, location_id)
									values (v_uid, v_pick, v_color, p_show_id, v_location)
									on conflict (user_id, character_id, color) do update
											set granted_at = player_avatars.granted_at
									returning * into v_avatar;
							return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar));
					end;
					$claim_welcome_booster$;
					grant execute on function claim_welcome_booster(bigint) to authenticated;
					-- The level boxes: one for every level a player has reached, from the
					-- first, each opened on its own and each on a show of their choosing.
					-- Not a rule of its own either -- the claim key is ('nivell', <level>,
					-- 'black'), so "one box per level" is the same unique index, with the
					-- level standing where a festa's year stands. Black stock (the
					-- primaries) because white is the rare one, and a box that comes again
					-- at every level is not that. Keep the three in step with level-box.ts
					-- in @3xl/shared.
					-- What the index cannot say, and this checks, is that the level has
					-- actually been reached: read off player_profiles.exp here, never taken
					-- from the caller, who names only WHICH of their levels they are
					-- opening. No profile row is level 1 -- the box everybody starts with.
					create or replace function claim_level_booster(p_show_id bigint, p_level int)
					returns jsonb
					language plpgsql security definer set search_path = public as $claim_level_booster$
					declare
							v_uid uuid := auth.uid();
							v_location constant text := 'nivell';
							v_box constant text := 'black';
							v_colors constant text[] := array['red', 'blue', 'yellow'];
							v_size constant int := 5;
							v_reached int;
							v_ids text[];
							v_rarities int[];
							v_weights numeric[];
							v_total numeric;
							v_pick text;
							v_color text;
							v_row character_spawns%rowtype;
							v_avatar player_avatars%rowtype;
							v_spawns jsonb := '[]'::jsonb;
							i int;
					begin
							if v_uid is null then
									raise exception 'You must be signed in to open a booster.';
							end if;
							if p_show_id is null then
									raise exception 'Choose a show to open your level box.';
							end if;
							if p_level is null or p_level < 1 then
									raise exception 'That is not a level.';
							end if;
							-- The same per-user lock the other two boxes take.
							perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
							select level_for_exp(coalesce(p.exp, 0)) into v_reached
									from player_profiles p
									where p.user_id = v_uid;
							v_reached := coalesce(v_reached, level_for_exp(0));
							if p_level > v_reached then
									raise exception 'You have not reached level % yet.', p_level;
							end if;
							-- One box per level.
							if exists (
									select 1 from booster_claims c
									where c.user_id = v_uid
											and c.location_id = v_location
											and c.year = p_level
											and c.box = v_box
							) then
									raise exception 'You have already opened your level % box.', p_level;
							end if;
							-- Roll pool: the chosen show's cast that exists as templates.
							with pool as (
									select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
									from show_characters sc
									join character_templates ct on ct.id = sc.character_id
									where sc.show_id = p_show_id
							)
							select array_agg(id order by id), array_agg(rarity order by id)
									into v_ids, v_rarities
							from pool;
							if v_ids is null or array_length(v_ids, 1) is null then
									raise exception 'There are no claimable characters for this show.';
							end if;
							select array_agg(w order by ord), sum(w)
									into v_weights, v_total
							from (
									select ord, 1.0 / (2 ^ r) as w
									from unnest(v_rarities) with ordinality as t(r, ord)
							) s;
							-- Record the box as taken, then roll its cards.
							insert into booster_claims (user_id, show_id, location_id, box, year)
									values (v_uid, p_show_id, v_location, v_box, p_level);
							for i in 1..v_size loop
									v_pick := pick_weighted(v_ids, v_weights, v_total);
									v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
									insert into character_spawns (user_id, character_id, show_id, location_id, color, box)
											values (v_uid, v_pick, p_show_id, v_location, v_color, v_box)
											returning * into v_row;
									v_spawns := v_spawns || to_jsonb(v_row);
							end loop;
							v_pick := pick_weighted(v_ids, v_weights, v_total);
							v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
							insert into player_avatars (user_id, character_id, color, show_id, location_id)
									values (v_uid, v_pick, v_color, p_show_id, v_location)
									on conflict (user_id, character_id, color) do update
											set granted_at = player_avatars.granted_at
									returning * into v_avatar;
							return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar), 'level', p_level);
					end;
					$claim_level_booster$;
					grant execute on function claim_level_booster(bigint, int) to authenticated;
					-- Combat rewards: the ONLY way a player earns experience. Claiming cards
					-- and opening boxes award nothing at all — fighting does, a win
						-- for what it was worth and a loss for the rivals it took down with it.
					-- One row per finished fight, written solely by award_combat_exp below: the
					-- audit trail behind every experience gain. RLS lets a player read only their
					-- own fights; there is no client write path.
					create table if not exists combat_results (
							id uuid primary key default gen_random_uuid(),
							user_id uuid not null references auth.users (id) on delete cascade,
							outcome text not null check (outcome in ('win', 'lose', 'draw')),
							-- Fighters left standing at the end / fielded at the start, as counted here.
							survivors integer not null default 0,
							fielded integer not null default 0,
							-- Rivals taken down, as bounded here — what a loss was paid for. 0 on a
							-- win or a draw, neither of which reads it.
							rivals_defeated integer not null default 0,
							-- The level whose span was at stake, and the span itself.
							level integer not null,
							level_span bigint not null,
							-- Experience actually awarded: a win's share of the span, ten a fallen
							-- rival for a loss, 0 for a draw.
							exp_awarded bigint not null,
							fought_at timestamptz not null default now()
						);
					-- Fights recorded while the award was weighed by compound HP carried
					-- hp_left/hp_max instead. The two are not the same measure, so the columns are
					-- replaced rather than renamed: an old row keeps the award it actually paid and
					-- reads as 0 of 0 fighters, which is honestly "not recorded".
					alter table combat_results add column if not exists survivors integer not null default 0;
					alter table combat_results add column if not exists fielded integer not null default 0;
					alter table combat_results drop column if exists hp_left;
					alter table combat_results drop column if exists hp_max;
					-- Fights recorded while a loss was paid a hundredth of the level's span
					-- carry no rival count and read as 0, which is what they were paid on.
					alter table combat_results
						add column if not exists rivals_defeated integer not null default 0;
					create index if not exists combat_results_user_day_idx
						on combat_results (user_id, fought_at);
					alter table combat_results enable row level security;
					drop policy if exists combat_results_select_own on combat_results;
					create policy combat_results_select_own on combat_results
							for select using (auth.uid() = user_id);
					-- Cumulative experience at which a level begins — the same D&D 5e table as
					-- level_for_exp, read the other way round. Mirrors expForLevel in @3xl/shared.
					create or replace function exp_for_level(p_level int)
					returns bigint language sql immutable set search_path = public as $exp_for_level$
						select case least(greatest(p_level, 1), 20)
							when 1 then 0
							when 2 then 300
							when 3 then 900
							when 4 then 2700
							when 5 then 6500
							when 6 then 14000
							when 7 then 23000
							when 8 then 34000
							when 9 then 48000
							when 10 then 64000
							when 11 then 85000
							when 12 then 100000
							when 13 then 120000
							when 14 then 140000
							when 15 then 165000
							when 16 then 195000
							when 17 then 225000
							when 18 then 265000
							when 19 then 305000
							else 355000
						end::bigint;
					$exp_for_level$;
					-- The full width of a level: the experience between its own threshold and the
					-- next one (300 at level 1, 600 at level 2, 1800 at level 3, …) — the whole
					-- level, not just the part still unearned. 0 at level 20. Mirrors levelSpanExp.
					create or replace function level_span_exp(p_level int)
					returns bigint language sql immutable set search_path = public as $level_span_exp$
						select case
							when least(greatest(p_level, 1), 20) >= 20 then 0::bigint
							else exp_for_level(least(greatest(p_level, 1), 20) + 1)
								- exp_for_level(least(greatest(p_level, 1), 20))
						end;
					$level_span_exp$;
					-- Territory: who actually occupies each municipality on the map.
					--
					-- A town with no row here is still on its seeded "OG" team — the one every
					-- client rolls deterministically from the town's own geometry, which is why
					-- nothing needs storing for it. The moment a player takes a town a row
					-- appears and becomes the source of truth: the map shows THIS team and the
					-- next challenger fights it, with the seed left only as the fallback for
					-- towns nobody has taken yet.
					--
					-- The team is frozen as a flat jsonb copy of the winning spawns' gameplay
					-- attributes, not as character_spawns references: those rows are RLS-scoped
					-- to their owner, so no other player could read them, and the occupying team
					-- has to be visible to everyone looking at the town. It also pins the
					-- garrison at the strength that won it, whatever the holder does with the
					-- cards afterwards.
					--
					-- turnover counts how many times the town has changed hands (1 the first
					-- time a player takes it off the OG team). It is also the bar the next
					-- challenger has to clear: taking a town needs turnover + 1 wins against the
					-- sitting team, so every flip makes the seat harder to take.
					--
					-- World-readable (a select policy of plain true) — the map has to show every
					-- town's occupant to every visitor, signed in or not. There is no client
					-- write path at all: award_combat_exp below is the only writer.
					create table if not exists municipality_holders (
							location_id text primary key,
							user_id uuid not null references auth.users (id) on delete cascade,
							-- [{"character_id": text, "color": text}, …] in fielded order.
							team jsonb not null default '[]'::jsonb,
							turnover integer not null default 1,
							taken_at timestamptz not null default now()
						);
					-- The holder's name is NOT kept here. It used to be copied in when the
					-- town was taken, which made this a second home for a username: stale
					-- the moment the holder renamed themselves, and a place a name nobody
					-- typed could arrive. One home only — player_profiles.username — read
					-- live through the view below.
					alter table municipality_holders drop column if exists holder_name;
					alter table municipality_holders enable row level security;
					drop policy if exists municipality_holders_select_all on municipality_holders;
					create policy municipality_holders_select_all on municipality_holders
							for select using (true);
					-- What the map selects: every taken town with its holder's current name
					-- and the avatar they are wearing joined on. Null for a holder who has
					-- not named themselves or is still on the letter avatar, which the
					-- frontend words itself rather than filling in from their sign-in.
					-- The avatar travels as the pair that IS one (see player_profiles), so
					-- the pin draws the same face the profile card does, and a player who
					-- changes either is changed on every town they hold.
					create or replace view municipality_holders_public
						with (security_invoker = false) as
						select h.location_id, h.user_id, n.username as holder_name,
								h.team, h.turnover, h.taken_at,
								n.avatar_character_id, n.avatar_color
						from municipality_holders h
						left join player_profiles n on n.user_id = h.user_id;
					grant select on municipality_holders_public to anon, authenticated;
					-- One challenger's progress against one town's sitting team: the wins banked
					-- so far towards the turnover + 1 it takes to dethrone them. Scoped to the
					-- generation they were won against (turnover), so when a town flips every
					-- siege on it is void — the row is deleted outright, and any that survived
					-- would be ignored on the turnover mismatch anyway. A player reads only
					-- their own progress.
					create table if not exists municipality_sieges (
							location_id text not null,
							user_id uuid not null references auth.users (id) on delete cascade,
							wins integer not null default 0,
							turnover integer not null default 0,
							updated_at timestamptz not null default now(),
							primary key (location_id, user_id)
						);
					create index if not exists municipality_sieges_location_idx
						on municipality_sieges (location_id);
					alter table municipality_sieges enable row level security;
					drop policy if exists municipality_sieges_select_own on municipality_sieges;
					create policy municipality_sieges_select_own on municipality_sieges
							for select using (auth.uid() = user_id);
					-- How long a town stays shut to the player who just fought it. One
					-- number in one place: start_battle refuses against the deadline this
					-- produced and the browser draws its countdown off that same deadline,
					-- so an hour is never written down anywhere else, on either side.
					create or replace function challenge_cooldown()
					returns interval language sql immutable set search_path = public
						as $challenge_cooldown$ select interval '1 hour'; $challenge_cooldown$;
					grant execute on function challenge_cooldown() to authenticated;
					-- One challenge per player per town — their current fight over it, or the
					-- last one they finished — and the cooldown it left behind: the pacing
					-- behind the siege bar. Taking a town needs turnover + 1 wins, which only
					-- means something if the same town can't be refought until they land, so
					-- finishing a fight shuts that town to that player until available_at,
					-- whatever the outcome was. The clock runs from the REPORT (award_combat_exp
					-- below), not from when the arena opened: a fight is not a wait, and a
					-- fight abandoned halfway starts no cooldown at all — the open battle is
					-- what holds that player, and it has to be reported before anything else
					-- can be fought. The one exception is a slot voided by somebody else
					-- taking the town mid-fight, which settles with no cooldown — see
					-- voided_at. No client write path; start_battle and award_combat_exp are
					-- the only writers, and a player reads only their own rows.
					create table if not exists municipality_challenges (
							user_id uuid not null references auth.users (id) on delete cascade,
							location_id text not null,
							started_at timestamptz not null default now(),
							-- When the fight was reported, or null while it is still open.
							-- Settling is what starts the cooldown, so this and available_at are
							-- written together and mean nothing apart.
							settled_at timestamptz,
							-- When the town opens up again: the settle plus challenge_cooldown().
							-- Null while the fight is still open, and on a voided slot.
							available_at timestamptz,
							-- When this slot was handed back because the town changed hands while
							-- the fight was still open: fought for nothing. A voided slot settles
							-- with no cooldown. Kept rather than deleted so the late report of
							-- that fight settles this row instead of opening a fresh one that
							-- would carry the hour it was excused.
							voided_at timestamptz,
							primary key (user_id, location_id)
						);
					alter table municipality_challenges add column if not exists voided_at timestamptz;
					alter table municipality_challenges add column if not exists available_at timestamptz;
					-- The ledger was once keyed by the Catalan day, and the existence of
					-- today's row was the limit. A cooldown is not a day: collapse each
					-- (player, town) to its most recent row and re-key onto the pair. The
					-- survivors keep a null available_at, which reads as a wait already over.
					do $municipality_challenges_rekey$
					begin
						if exists (
							select 1 from information_schema.columns
							where table_schema = 'public'
								and table_name = 'municipality_challenges'
								and column_name = 'challenge_date'
						) then
							delete from municipality_challenges older
								using municipality_challenges newer
								where older.user_id = newer.user_id
									and older.location_id = newer.location_id
									-- ctid breaks a tie on the timestamp, so exactly one row of
									-- each pair survives however the old rows are stamped.
									and (older.started_at, older.ctid) < (newer.started_at, newer.ctid);
							alter table municipality_challenges
								drop constraint if exists municipality_challenges_pkey;
							alter table municipality_challenges drop column challenge_date;
							alter table municipality_challenges add primary key (user_id, location_id);
						end if;
					end
					$municipality_challenges_rekey$;
					-- Capturing a town voids every open challenge on it: the one read that
					-- goes by town rather than by player, which the player-led primary key
					-- is no help for. Matches municipality_sieges, walked the same way at
					-- the same moment.
					create index if not exists municipality_challenges_location_idx
						on municipality_challenges (location_id);
					alter table municipality_challenges enable row level security;
					drop policy if exists municipality_challenges_select_own on municipality_challenges;
					create policy municipality_challenges_select_own on municipality_challenges
							for select using (auth.uid() = user_id);
					-- What the map reads: only the challenges still closing a town off. A
					-- player collects a row per town they have ever fought and at most a
					-- handful are ever running, and — the point of it — the SERVER decides
					-- which those are. A browser filtering on its own clock could talk itself
					-- into offering a fight the RPC would refuse. security_invoker so the
					-- table's own RLS applies: their own rows and nobody else's.
					create or replace view municipality_challenges_open
						with (security_invoker = true) as
						select c.user_id, c.location_id, c.started_at, c.settled_at,
								c.available_at
						from municipality_challenges c
						where c.voided_at is null
							and (c.settled_at is null or c.available_at > now());
					-- anon too, and it gives nothing away: the base table's RLS runs as the
					-- caller, so a signed-out reader selects zero rows. The map asks before
					-- it knows whether anybody is signed in, and empty is the true answer.
					grant select on municipality_challenges_open to anon, authenticated;
					-- The open battle: the one fight a player may have running at a time. A
					-- fight is not the browser's — picking one on the map opens a row here,
					-- each closed turn writes the board back to it, and reporting the result
					-- deletes it. The primary key is the player, so the rule IS the table:
					-- one open battle, ever. Closing the arena, reloading or moving to
					-- another device neither loses the fight nor gets out of it, which is
					-- what stops a player walking away from one that is going badly (the
					-- cooldown only ever stops them refighting the same town, and is only
					-- started by reporting the fight in the first place).
					-- The row is also the server's record of WHAT is being fought — town,
					-- turnover, rival line-up — all fixed at open and read from here by
					-- award_combat_exp rather than believed from the report. Only the board
					-- column is the browser's, and nothing is derived from it.
					create table if not exists battles (
							user_id uuid primary key references auth.users (id) on delete cascade,
							location_id text not null,
							-- The generation of the team being fought, so a fight that outlived a
							-- capture is recognisable as stale.
							turnover integer not null default 0,
							-- The rival line-up in lane order, [{character_id, color}], frozen so a
							-- resumed fight faces the same three whatever the town has done since.
							rivals jsonb not null default '[]'::jsonb,
							-- The player's own line-up in fielded order, [spawn_id, …], every one
							-- of them checked against character_spawns before this row existed.
							team jsonb not null default '[]'::jsonb,
							-- The board as the last closed turn left it, null before the first.
							board jsonb,
							started_at timestamptz not null default now(),
							updated_at timestamptz not null default now()
						);
					-- Battles opened before the team was proved simply carry none.
					alter table battles add column if not exists team jsonb not null default '[]'::jsonb;
					-- A battle used to record the Catalan day whose challenge it spent, back
					-- when a challenge was a day. There is no day to record now: the challenge
					-- it belongs to is the one (user_id, location_id) row this one already names.
					alter table battles drop column if exists challenge_date;
					alter table battles enable row level security;
					-- Read your own and nothing else. Deliberately no write policy at all: a
					-- client that could delete this row could walk out of a losing fight.
					drop policy if exists battles_select_own on battles;
					create policy battles_select_own on battles
							for select using (auth.uid() = user_id);
					-- Open a battle over a town, called when the arena opens. Replaces
					-- start_challenge: it claims the town's challenge AND opens the battle in
					-- the same transaction, so no town is shut by a fight that failed to
					-- start, and no challenge exists without a battle answering for it.
					-- Refuses a town still cooling down from this caller's last fight over it,
					-- a town the caller holds, and refuses outright when they already have a
					-- battle open — that one has to be finished first. An unsettled slot with
					-- no battle behind it is a fight that went missing, and is taken over
					-- rather than left shutting the town on a report that can never come.
					-- The OUT names
					-- deliberately avoid the table's columns.
					--
					-- The line-up is no longer the caller's to name: it is read here off the
					-- team slots on the caller's own cards (see set_team), so a fight is opened
					-- with the team the ACCOUNT holds rather than with whatever list a browser
					-- arrived carrying — one that could name cards claimed by another account
					-- or recycled since. Three slots have to be filled or no battle is opened
					-- and no day is spent, which is the same rule award_combat_exp applies to a
					-- winning report, kept in the only place it does the player any good: a
					-- fight that could never have been reported is a fight that was never
					-- started. The line-up is returned as well as stored, so the arena fields
					-- exactly what the server wrote down.
					--
					-- Both older signatures are dropped rather than replaced: left standing
					-- they would make every call ambiguous for PostgREST and go on being a way
					-- to open a battle with a line-up of the client's own choosing.
					drop function if exists start_battle(text, int, jsonb);
					drop function if exists start_battle(text, int, jsonb, jsonb);
					create or replace function start_battle(
						p_location_id text,
						p_turnover int default 0,
						p_rivals jsonb default '[]'::jsonb
					)
					returns table (
						town_id text,
						opened_at timestamptz,
						fielded_team jsonb
					)
					language plpgsql security definer set search_path = public as $start_battle$
					declare
						v_uid uuid := auth.uid();
						v_holder uuid;
						v_started timestamptz;
						v_available timestamptz;
						v_open text;
						v_team jsonb;
						v_fielded int;
					begin
						if v_uid is null then
							raise exception 'You must be signed in to challenge a town.';
						end if;
						if p_location_id is null or p_location_id = '' then
							raise exception 'A town is required to start a challenge.';
						end if;
						-- Serialise this player's mutations, matching claim_booster. It holds the
						-- team still as well: no slot can be re-dealt between being read here and
						-- the battle being written with it.
						perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
						-- The caller's team, in slot order — the lead first, as the board fields it.
						select coalesce(jsonb_agg(cs.id::text order by cs.team_slot), '[]'::jsonb),
								count(*)
							into v_team, v_fielded
							from character_spawns cs
							where cs.user_id = v_uid and cs.team_slot is not null;
						-- Three a side, the size award_combat_exp caps a report at.
						if v_fielded <> 3 then
							raise exception 'A team fields 3 fighters; yours has %. Finish it on your roster.', v_fielded;
						end if;
						-- One battle at a time. The map offers the way back into the open one,
						-- never a second, so a call that gets here has lost track of its own
						-- fight or is trying to leave it behind.
						select b.location_id into v_open from battles b where b.user_id = v_uid;
						if v_open is not null then
							raise exception 'You already have a battle in progress. Finish it before starting another.';
						end if;
						select h.user_id into v_holder from municipality_holders h
							where h.location_id = p_location_id;
						if v_holder is not null and v_holder = v_uid then
							raise exception 'You already hold this town — you cannot challenge your own team.';
						end if;
						-- The wait this caller is under on this town, if any. A slot the server
						-- voided carries none: the town was taken out from under that fight,
						-- which is not something its challenger is made to wait for.
						select c.available_at into v_available from municipality_challenges c
							where c.user_id = v_uid and c.location_id = p_location_id;
						if v_available is not null and v_available > now() then
							raise exception 'You have just fought this town. It opens up again at %.',
								to_char(v_available at time zone 'Europe/Madrid', 'HH24:MI');
						end if;
						-- Claim the town's challenge. One row per (player, town), rewritten each
						-- time they come back: this fight is the one that counts now, and the
						-- cooldown it will leave is set when it is reported, not here.
						insert into municipality_challenges (user_id, location_id)
							values (v_uid, p_location_id)
							on conflict (user_id, location_id) do update
								set started_at = now(), settled_at = null, available_at = null,
									voided_at = null
							returning municipality_challenges.started_at into v_started;
						insert into battles
							(user_id, location_id, turnover, rivals, team, board)
							values (v_uid, p_location_id,
								greatest(0, coalesce(p_turnover, 0)),
								coalesce(p_rivals, '[]'::jsonb), v_team, null);
						town_id := p_location_id;
						opened_at := v_started;
						fielded_team := v_team;
						return next;
					end;
					$start_battle$;
					grant execute on function start_battle(text, int, jsonb) to authenticated;
					-- The pre-battle RPC is dropped rather than left standing: a client that
					-- could still claim a town's challenge without opening a battle would have
					-- a way to shut the town with nothing holding it to the fight.
					drop function if exists start_challenge(text);
					-- Write the board back, called as each turn closes — the only mutable part
					-- of a battle and the only thing the browser authors. Always an UPDATE of
					-- the player's one open row (user_id is the primary key), so a fight has
					-- exactly one record of itself from start_battle to award_combat_exp.
					--
					-- Returns whether it found that row. A save that wrote nothing means the
					-- battle is gone, and the arena holds the fight and says so rather than
					-- playing on over turns no reload would bring back. Late rather than wrong,
					-- so it is an answer and not an exception. The void-returning version is
					-- dropped first: a return type cannot be changed in place.
					drop function if exists save_battle(jsonb);
					create or replace function save_battle(p_board jsonb)
					returns boolean
					language plpgsql security definer set search_path = public as $save_battle$
					declare
							v_uid uuid := auth.uid();
							v_written int;
					begin
							if v_uid is null then
								raise exception 'You must be signed in to play a battle.';
							end if;
							update battles set board = p_board, updated_at = now()
								where user_id = v_uid;
							get diagnostics v_written = row_count;
							return v_written > 0;
					end;
					$save_battle$;
					grant execute on function save_battle(jsonb) to authenticated;
					-- Every earlier signature is dropped rather than replaced: leaving one
					-- in place would give PostgREST overloads to choose between and make every
					-- rpc('award_combat_exp') call ambiguous — and the four-argument one is
					-- exactly the version that let the client name its own town and turnover.
					drop function if exists award_combat_exp(text, jsonb);
					drop function if exists award_combat_exp(text, jsonb, text, int);
					-- Award experience for one finished fight:
					--   * a draw earns nothing;
						--   * a loss earns 10 for each rival it took down and nothing else: not a
						--     share of anything, and measured by the damage done on the way out
						--     rather than against what winning would have paid — so it is the same
						--     ten at every level (20 included, where a win's span is 0), twice as
						--     much for two rivals as for one, and nothing at all for a whitewash;
					--   * a win earns a share of the player's CURRENT level's full span (see
					--     level_span_exp), scaled linearly by how much of their team is left
					--     standing: survivors / fielded. A flawless win — nobody taken down —
					--     earns the entire span, i.e. one whole level's worth measured from the
					--     base of the level; a win with one of three left earns a third of it.
					-- Combat runs in the browser, so the report is treated as a claim and bounded
					-- rather than trusted: every spawn must belong to the caller, the team is
					-- counted here rather than read from the report (at most 3, each named once),
					-- and the amount itself is never sent by the client — it is derived here from
					-- the player's stored experience. p_fighters is the player's side only, as
					-- [{"spawn_id": uuid, "down": boolean}]; p_rivals_defeated is how many of the
					-- other side went down — a count and not a line-up, the rivals being the
					-- town's garrison rather than the caller's cards, bounded here against the
					-- line-up the battle was opened with (and 3 on top of that), so the most a
					-- loss can talk itself into is one team's worth. The OUT names
					-- deliberately avoid the column names used in the body. security definer: it
					-- writes player_profiles and combat_results, neither client-writable.
					--
					-- A report is only ever accepted against an OPEN BATTLE, and the battle
					-- row is what says which town was fought and which generation of its team
					-- — neither is taken from the report, so a browser cannot pick a richer
					-- town to have won nor pass off a fight against a superseded occupant as
					-- one against the team sitting there now. Reporting also ends the battle:
					-- the row is deleted here, and only then may another be started.
					--
					-- It settles TERRITORY in the same transaction, over that town:
					--   * a win banks one siege win against that town's sitting team;
					--   * once the player has banked turnover + 1 of them the town changes
					--     hands: they become its holder, the team they won with is frozen as
					--     the new garrison, turnover goes up (so the NEXT challenger owes one
					--     more win than they did), and every siege on the town is wiped;
					--   * if the town changed hands while the fight was running, the team that
					--     was beaten is no longer the sitting one, so the win banks nothing and
					--     the result comes back flagged stale.
					-- Here too the client only says what it fought: the win count, the bar and
					-- the occupancy change are all decided here.
					create or replace function award_combat_exp(
							p_outcome text,
							p_fighters jsonb,
							p_rivals_defeated int default 0
						)
					returns table (
							awarded_exp bigint,
							total_exp bigint,
							at_level int,
							span_exp bigint,
							team_survivors int,
							team_fielded int,
							-- The rivals felled as this bounded them, which is what a loss was
							-- actually paid for — the report's own number is not echoed back.
							rivals_felled int,
							-- The town is returned rather than echoed from the report, which no
							-- longer names one.
							town_id text,
							town_captured boolean,
							town_wins int,
							town_required int,
							town_turnover int,
							town_stale boolean
						)
					language plpgsql security definer set search_path = public as $award_combat_exp$
					declare
							v_uid uuid := auth.uid();
							v_challenge timestamptz;
							v_reported int;
							v_distinct int;
							v_owned int;
							v_exp bigint;
							v_level int;
							v_span bigint;
							v_standing int;
							-- The rival line-up the battle was opened with, and the felled count
							-- bounded by it.
							v_rivals jsonb;
							v_felled int;
							v_award bigint;
							v_total bigint;
							v_holder uuid;
							v_turnover int;
							v_required int;
							v_wins int;
							v_stale boolean := false;
							v_captured boolean := false;
							v_team jsonb;
							-- The battle being reported: the town and the generation as the server
							-- recorded them when the fight was opened.
							v_location text;
							v_fought int;
							-- The row this fight is filed as and the moment it was filed, plus who
							-- fought it as the map already says a player: name and worn avatar, off
							-- player_profiles. All of it for the announcement at the foot of this
							-- function; see ../../supabase/combat_results.sql for the reasoning.
							v_result_id uuid;
							v_fought_at timestamptz;
							v_name text;
							v_avatar_character text;
							v_avatar_color text;
					begin
							if v_uid is null then
								raise exception 'You must be signed in to earn experience.';
							end if;
							if p_outcome is null or p_outcome not in ('win', 'lose', 'draw') then
								raise exception 'Unknown combat outcome: %.', coalesce(p_outcome, 'null');
							end if;
							if p_fighters is null or jsonb_typeof(p_fighters) <> 'array' then
								raise exception 'A combat report must list the fighters that took part.';
							end if;
							-- Serialise this player's mutations, matching claim_booster.
							perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
							-- The fight has to be one the server opened. Everything about WHAT was
							-- fought comes from here, not from the report; a report with no battle
							-- behind it is not a fight that happened but a claim about one.
							select b.location_id, b.turnover, b.rivals
								into v_location, v_fought, v_rivals
								from battles b where b.user_id = v_uid;
							if v_location is null then
								raise exception 'You have no battle in progress to report.';
							end if;
							-- How many rivals the report may claim: the line-up this battle was
							-- opened against, which is the server's own, and never more than a
							-- team. A battle carrying none falls back to the team size rather
							-- than paying its loss nothing.
							v_felled := least(
								greatest(coalesce(p_rivals_defeated, 0), 0),
								least(
									coalesce(
										nullif(
											case when jsonb_typeof(v_rivals) = 'array'
												then jsonb_array_length(v_rivals) else 0 end,
											0
										),
										3
									),
									3
								)
							);
							-- The reported team, bounded against what the caller actually owns. A fighter
							-- is standing or it is down, so the survivors are simply counted over the
							-- fighters that turned out to be the caller's own.
							with reported as (
								select f.spawn_id, coalesce(f.down, false) as down
								from jsonb_to_recordset(p_fighters)
									as f(spawn_id uuid, down boolean)
							),
							owned as (
								select r.down
								from reported r
								join character_spawns cs on cs.id = r.spawn_id and cs.user_id = v_uid
							)
							select
								(select count(*) from reported),
								(select count(distinct spawn_id) from reported),
								(select count(*) from owned),
								(select count(*) from owned where not down)
							into v_reported, v_distinct, v_owned, v_standing;
							-- The report is bounded where it can buy something worth lying for,
							-- and only there. A win pays a level's worth of experience and banks
							-- ground, so it has to name a real team. A loss banks nothing, takes
							-- nothing and pays only for the rivals it felled — thirty at the
							-- very most, off a count already bounded by the line-up the server
							-- froze — so it is always taken, whatever it names. Refusing one
							-- protects nothing and strands the player in a fight they have
							-- already given up.
							if p_outcome = 'win' then
								if v_reported = 0 then
									raise exception 'A combat report must list the fighters that took part.';
								end if;
								if v_reported > 3 then
									raise exception 'A team fields at most 3 fighters; % were reported.', v_reported;
								end if;
								if v_distinct <> v_reported then
									raise exception 'A fighter cannot be reported twice.';
								end if;
								if v_owned <> v_reported then
									raise exception 'Every fighter must be one of your own claimed characters.';
								end if;
							end if;
							-- The level at stake is the one the player is on now, before the award.
							select coalesce(exp, 0) into v_exp from player_profiles where user_id = v_uid;
							v_exp := coalesce(v_exp, 0);
							v_level := level_for_exp(v_exp);
							v_span := level_span_exp(v_level);
							-- A win earns the level's whole span, scaled by the share of the team
							-- left standing, and nothing at level 20, whose span is zero. A loss
							-- earns ten for each rival it took down and nothing else: it reads
							-- neither the level nor the player's own casualties, so it is worth
							-- the same at every level and worth nothing when nobody was felled.
							-- A draw earns nothing, as it always did.
							if p_outcome = 'win' and v_span > 0 and v_owned > 0 then
								v_award := round(v_span::numeric * v_standing::numeric / v_owned::numeric);
							elsif p_outcome = 'lose' then
								v_award := v_felled * 10;
							else
								v_award := 0;
							end if;
							-- Only a loss was paid for the rivals, so only a loss records them.
							if p_outcome <> 'lose' then
								v_felled := 0;
							end if;
							insert into combat_results
								(user_id, outcome, survivors, fielded, rivals_defeated,
									level, level_span, exp_awarded)
								values (v_uid, p_outcome, v_standing, v_owned, v_felled,
									v_level, v_span, v_award)
								returning id, fought_at into v_result_id, v_fought_at;
							if v_award > 0 then
								insert into player_profiles (user_id, exp)
									values (v_uid, v_award)
									on conflict (user_id) do update
										set exp = player_profiles.exp + v_award, updated_at = now()
									returning exp into v_total;
							else
								v_total := v_exp;
							end if;
							-- Territory. Every battle is over a town, so this always runs.
							begin
								-- Serialise per town, so two challengers finishing at the same moment
								-- can't both read the same turnover and both take it.
								perform pg_advisory_xact_lock(hashtextextended('municipality:' || v_location, 0));
								select h.user_id, h.turnover into v_holder, v_turnover
									from municipality_holders h where h.location_id = v_location;
								-- A town whose sitting team is the caller's own cannot be fought for:
								-- there is nothing to take off yourself. The map never offers the
								-- challenge, so a report that names one did not come from the game —
								-- reject it outright, rolling back the experience with it, rather than
								-- paying out for a fight that should not have happened.
								-- Only a WIN is refused for it: there is nothing to take off
								-- yourself. A loss against your own town is a fight that ends.
								if v_holder is not null and v_holder = v_uid and p_outcome = 'win' then
									raise exception 'You already hold this town — you cannot challenge your own team.';
								end if;
								-- The town's cooldown starts here. The slot was claimed by
								-- start_battle when the battle opened, and settling it is what
								-- shuts the town for the next hour — measured from now, the end of
								-- the fight, so time spent playing it is not also spent waiting.
								-- There is no way to arrive with no slot at all: the battle being
								-- reported could not have been opened without one. A slot voided
								-- below (the town changed hands mid-fight) settles like any other
								-- — the fight happened and is paid for — but takes no cooldown.
								update municipality_challenges
									set settled_at = now(),
										available_at = case
											when voided_at is null then now() + challenge_cooldown()
											else null
										end
									where user_id = v_uid
										and location_id = v_location
										and settled_at is null
									returning municipality_challenges.settled_at into v_challenge;
								-- Nothing to settle means an earlier report closed this slot: a
								-- second fight over the town inside its cooldown. The win only —
								-- that would be a second payout of a level's worth, while a second
								-- loss pays what the first did, ten a fallen rival off a battle
								-- that had to be opened to be reported at all, which is not worth
								-- stranding anybody in a fight over.
								if v_challenge is null and p_outcome = 'win' then
									raise exception 'You have just fought this town. Wait for it to open up again.';
								end if;
								-- No row at all means the town is still on its seeded OG team: turnover 0.
								v_turnover := coalesce(v_turnover, 0);
								v_required := greatest(1, v_turnover + 1);
								-- The generation the battle was opened against against the one sitting
								-- there now: if the town flipped since, what was beaten was not the
								-- sitting team and the win buys nothing. Both numbers are the server's.
								v_stale := coalesce(v_fought, 0) <> v_turnover;
								if p_outcome = 'win' and not v_stale then
									-- Bank the win. A stored siege from an older generation is not added
									-- to — it restarts at this win, since it was earned against a team
									-- that no longer sits there.
									insert into municipality_sieges (location_id, user_id, wins, turnover)
										values (v_location, v_uid, 1, v_turnover)
										on conflict (location_id, user_id) do update
											set wins = case
													when municipality_sieges.turnover = excluded.turnover
														then municipality_sieges.wins + 1
													else 1
												end,
												turnover = excluded.turnover,
												updated_at = now()
										returning wins into v_wins;
									if v_wins >= v_required then
										-- The town falls. Freeze the team that won it, in fielded order,
										-- copying each spawn's attributes rather than referencing the row.
										select jsonb_agg(
												jsonb_build_object(
													'character_id', cs.character_id,
													'color', cs.color
												) order by f.ord
											)
											into v_team
											-- Ordinality over the raw elements (a scalar-returning SRF) rather
											-- than over jsonb_to_recordset, whose column-definition list does
											-- not combine with WITH ORDINALITY.
											from (
												select (e.elem->>'spawn_id')::uuid as spawn_id, e.ord
												from jsonb_array_elements(p_fighters) with ordinality as e(elem, ord)
											) f
											join character_spawns cs on cs.id = f.spawn_id and cs.user_id = v_uid;
										-- The occupant is recorded as a user id and nothing else: their
										-- name is read live off player_profiles.username through
										-- municipality_holders_public, so it follows a rename and there
										-- is no second place a username could come from.
										insert into municipality_holders
											(location_id, user_id, team, turnover, taken_at)
											values (v_location, v_uid, coalesce(v_team, '[]'::jsonb),
												v_turnover + 1, now())
											on conflict (location_id) do update
												set user_id = excluded.user_id,
													team = excluded.team,
													turnover = excluded.turnover,
													taken_at = excluded.taken_at;
										-- A new generation voids every siege on the town, the winner's included.
										delete from municipality_sieges where location_id = v_location;
										-- And every fight still open against the old one: those challengers
										-- are beating a team that no longer sits here and their report will
										-- be refused as stale, so this town takes no hour off them for a
										-- fight this capture took away. Marked, not deleted — their late
										-- report settles this row (paid for, no ground banked) and the
										-- voided flag it keeps is what makes that settle carry no cooldown,
										-- so they may come straight back at the new occupant. Slots already
										-- settled are left alone: those are cooldowns earned on a real
										-- fight against the team that was sitting here at the time.
										update municipality_challenges
											set voided_at = now()
											where location_id = v_location
												and settled_at is null
												and voided_at is null
												and user_id <> v_uid;
										-- Taking a town is worth the town and nothing beside it. It
										-- paid a booster box too while a player had a day's
										-- allowance of them to top up; boxes are the calendar's now,
										-- one per town, year and stock, so there is no balance left
										-- for a capture to pay into. What a conquest does to the
										-- boxes is change whose show the town deals.
										v_captured := true;
										v_turnover := v_turnover + 1;
										v_wins := v_required;
									end if;
								else
									-- Nothing banked (a loss, a draw or a stale fight): report the
									-- progress they already had against this generation.
									select s.wins into v_wins from municipality_sieges s
										where s.location_id = v_location
											and s.user_id = v_uid
											and s.turnover = v_turnover;
									v_wins := coalesce(v_wins, 0);
								end if;
								town_id := v_location;
								town_captured := v_captured;
								town_wins := v_wins;
								town_required := v_required;
								town_turnover := v_turnover;
								town_stale := v_stale;
							end;
							-- The fight is over: close the battle, freeing the player to start
							-- another. Every rejection above raises, which rolls this back with the
							-- experience — a refused report leaves them in the battle they were in.
							delete from battles where user_id = v_uid;
							-- And it is announced, on the one channel every game end in the project
							-- lands on: the combat-results topic. A public one — private => false — since
							-- it carries only what municipality_holders_public already publishes
							-- about a player, and it is pushed over WebSockets off the WAL rather
							-- than read out of a table by anybody. Sent from here and not from a
							-- trigger on the insert, because a fight is not finished until the town
							-- has been settled; swallowed on failure, because an announcement that
							-- could not be made must not roll back the fight it was announcing.
							begin
								select p.username, p.avatar_character_id, p.avatar_color
									into v_name, v_avatar_character, v_avatar_color
									from player_profiles p where p.user_id = v_uid;
								perform realtime.send(
									jsonb_build_object(
										'id', v_result_id,
										'at', v_fought_at,
										'outcome', p_outcome,
										'exp', v_award,
										'survivors', v_standing,
										'fielded', v_owned,
										'rivals', v_felled,
										'town', v_location,
										'captured', v_captured,
										'stale', v_stale,
										'player', jsonb_build_object(
											'id', v_uid,
											'name', v_name,
											'character_id', v_avatar_character,
											'color', v_avatar_color,
											'level', level_for_exp(coalesce(v_total, v_exp))
										)
									),
									'fight',
									'combat-results',
									false
								);
							exception
								when others then
									raise warning 'combat feed: % (%)', sqlerrm, sqlstate;
							end;
							awarded_exp := v_award;
							total_exp := coalesce(v_total, v_exp);
							at_level := v_level;
							span_exp := v_span;
							team_survivors := v_standing;
							team_fielded := v_owned;
							rivals_felled := v_felled;
							return next;
					end;
					$award_combat_exp$;
					grant execute on function award_combat_exp(text, jsonb, int) to authenticated;
					-- The acceptance ledger: which legal document, at which version, was agreed to
					-- by whom and when. Server-side because an acceptance held in the player's own
					-- browser demonstrates nothing — GDPR art. 5(2) puts the burden of showing it on
					-- the controller, and the controller is not the device. Every acceptance is kept
					-- rather than only the latest: the question that gets asked is "what did they
					-- agree to at the time", and only a row per version answers it. Nothing else
					-- about the moment is recorded — no IP, no user agent — because what has to be
					-- provable is which text was on screen and when, and collecting more than that
					-- for the record is exactly the failure art. 5(1)(c) names.
					-- See ../../supabase/legal_acceptances.sql for the annotated original.
					create table if not exists legal_acceptances (
							user_id uuid not null references auth.users (id) on delete cascade,
							document text not null check (document in ('terms', 'privacy', 'cookies', 'attributions')),
							version text not null check (char_length(version) between 1 and 32),
							-- The age attestation, made in the same act as the acceptance and so
							-- recorded on it: sixteen, the strictest floor GDPR art. 8 lets a member
							-- state set, and well over COPPA's thirteen.
							age_confirmed boolean not null default false,
							accepted_at timestamptz not null default now(),
							primary key (user_id, document, version)
						);
					create index if not exists legal_acceptances_user_idx
						on legal_acceptances (user_id, accepted_at desc);
					alter table legal_acceptances enable row level security;
					-- Read your own; write none. The only writer is the RPC below, so the ledger
					-- cannot be back-dated by the account it is evidence about.
					drop policy if exists legal_acceptances_select_own on legal_acceptances;
					create policy legal_acceptances_select_own on legal_acceptances
							for select using (auth.uid() = user_id);
					-- Record acceptance of a whole set of documents at named versions, as one call,
					-- because that is how they are ticked: the gate asks for the terms and the
					-- privacy notice together and either both land or neither does.
					create or replace function record_legal_acceptance(
						p_documents jsonb,
						p_age_confirmed boolean default false
					)
					returns setof legal_acceptances
					language plpgsql security definer set search_path = public as $record_legal_acceptance$
					declare
						v_uid uuid := auth.uid();
						v_doc text;
						v_version text;
					begin
						if v_uid is null then
							raise exception 'You must be signed in to record an acceptance.';
						end if;
						if p_documents is null or jsonb_typeof(p_documents) <> 'object' then
							raise exception 'A set of documents and versions is required.' using errcode = '22023';
						end if;
						for v_doc, v_version in select key, value #>> '{}' from jsonb_each(p_documents) loop
							if v_doc not in ('terms', 'privacy', 'cookies', 'attributions') then
								raise exception 'Unknown document: %', v_doc using errcode = '22023';
							end if;
							if v_version is null or btrim(v_version) = '' then
								raise exception 'A version is required for %', v_doc using errcode = '22023';
							end if;
							insert into legal_acceptances (user_id, document, version, age_confirmed)
								values (v_uid, v_doc, btrim(v_version), coalesce(p_age_confirmed, false))
								on conflict (user_id, document, version) do update
									set age_confirmed = legal_acceptances.age_confirmed
										or coalesce(excluded.age_confirmed, false);
						end loop;
						return query
							select * from legal_acceptances a
							where a.user_id = v_uid
							order by a.accepted_at;
					end;
					$record_legal_acceptance$;
					grant execute on function record_legal_acceptance(jsonb, boolean) to authenticated;
					-- Everything the game holds about the caller, in one document: GDPR art. 15 (a
					-- copy) and art. 20 (machine-readable) answered together, and the CCPA right to
					-- know with them. A function rather than a dozen client-side selects because
					-- several of these tables are unreadable under RLS, and because a right of
					-- access has to answer for the whole of what is held — which is a fact about the
					-- schema. Other players are deliberately absent: a town names its previous
					-- holder, but that is not the caller's personal data.
					create or replace function export_player_data()
					returns jsonb
					language plpgsql security definer set search_path = public as $export_player_data$
					declare
						v_uid uuid := auth.uid();
						v_out jsonb;
					begin
						if v_uid is null then
							raise exception 'You must be signed in to export your data.';
						end if;
						select jsonb_build_object(
							'exported_at', now(),
							'account', (
								select jsonb_build_object(
									'id', u.id,
									'email', u.email,
									'created_at', u.created_at,
									'last_sign_in_at', u.last_sign_in_at,
									'providers', u.raw_app_meta_data -> 'providers'
								)
								from auth.users u where u.id = v_uid
							),
							'profile', (select to_jsonb(p) from player_profiles p where p.user_id = v_uid),
							'legal_acceptances', coalesce((
								select jsonb_agg(to_jsonb(a) order by a.accepted_at)
								from legal_acceptances a where a.user_id = v_uid), '[]'::jsonb),
							'cards', coalesce((
								select jsonb_agg(to_jsonb(s) order by s.id)
								from character_spawns s where s.user_id = v_uid), '[]'::jsonb),
							'avatars', coalesce((
								select jsonb_agg(to_jsonb(av) order by av.granted_at)
								from player_avatars av where av.user_id = v_uid), '[]'::jsonb),
							'booster_claims', coalesce((
								select jsonb_agg(to_jsonb(bc) order by bc.claimed_at)
								from booster_claims bc where bc.user_id = v_uid), '[]'::jsonb),
							'combat_results', coalesce((
								select jsonb_agg(to_jsonb(cr) order by cr.fought_at)
								from combat_results cr where cr.user_id = v_uid), '[]'::jsonb),
							'battle', (select to_jsonb(b) from battles b where b.user_id = v_uid),
							'towns_held', coalesce((
								select jsonb_agg(to_jsonb(h) order by h.taken_at)
								from municipality_holders h where h.user_id = v_uid), '[]'::jsonb),
							'sieges', coalesce((
								select jsonb_agg(to_jsonb(si))
								from municipality_sieges si where si.user_id = v_uid), '[]'::jsonb),
							'challenges', coalesce((
								select jsonb_agg(to_jsonb(ch) order by ch.started_at)
								from municipality_challenges ch where ch.user_id = v_uid), '[]'::jsonb)
						) into v_out;
						return v_out;
					end;
					$export_player_data$;
					grant execute on function export_player_data() to authenticated;
					-- Erase the account and everything hanging off it (GDPR art. 17, and the
					-- deletion right every US state privacy law has a version of). One delete: every
					-- player-owned table here cascades off auth.users, towns held included — an
					-- erased account cannot go on occupying a municipality, and the town becomes
					-- unheld for the next challenger. A real delete rather than a flag: nothing here
					-- is under a retention duty, since no payments are taken and there is no invoice
					-- to keep. Takes no argument, so there is no account but the caller's it could
					-- be pointed at.
					create or replace function delete_player_account()
					returns void
					language plpgsql security definer set search_path = public as $delete_player_account$
					declare
						v_uid uuid := auth.uid();
					begin
						if v_uid is null then
							raise exception 'You must be signed in to delete your account.';
						end if;
						delete from auth.users where id = v_uid;
					end;
					$delete_player_account$;
					grant execute on function delete_player_account() to authenticated`
			)
			.then(() => undefined)
			.catch((error: unknown) => {
				// Reset so a transient failure (e.g. bad password) can be retried on the
				// next request instead of being cached forever.
				ensured = null;
				const message = error instanceof Error ? error.message : String(error);
				httpError(502, `Supabase DB connection failed: ${message}`);
			});
	}
	return ensured;
}

/** The local saved-show collection projected to templates: only id + name. */
async function localTemplates(): Promise<ShowTemplate[]> {
	let shows: ShowEntry[] = [];
	try {
		const raw = await readFile(SHOWS_PATH, 'utf-8');
		const parsed = JSON.parse(raw) as ShowsCollection;
		if (Array.isArray(parsed?.shows)) shows = parsed.shows;
	} catch {
		shows = [];
	}
	return shows
		.map((entry) => ({ id: entry.show.id, name: entry.show.name }))
		.sort((a, b) => a.id - b.id);
}

/** Fetch the remote templates, ordered by id. pg returns bigint as string. */
async function fetchRemote(): Promise<ShowTemplate[]> {
	await ensureTables();
	const { rows } = await getPool().query<{ id: string; name: string }>(
		'select id, name from show_templates order by id'
	);
	return rows.map((row) => ({ id: Number(row.id), name: row.name }));
}

/** Fetch every show→characters assignment as a { [showId]: characterId[] } map. */
async function fetchAssignments(): Promise<ShowCharacterAssignments> {
	await ensureTables();
	const { rows } = await getPool().query<{ show_id: string; character_id: string }>(
		'select show_id, character_id from show_characters order by show_id, character_id'
	);
	const map: ShowCharacterAssignments = {};
	for (const row of rows) {
		const showId = Number(row.show_id);
		(map[showId] ??= []).push(row.character_id);
	}
	return map;
}

export const showTemplatesRouter = Router();

// The remote template list, for the admin to compare against the local shows.
showTemplatesRouter.get(
	'/',
	asyncHandler(async (_req, res) => {
		const templates = await fetchRemote();
		res.json({ templates });
	})
);

// Mirror the local collection into Supabase: upsert every local template, then
// delete any remote row that no longer exists locally. Idempotent.
showTemplatesRouter.post(
	'/sync',
	asyncHandler(async (_req, res) => {
		const pool = getPool();
		const local = await localTemplates();
		const before = await fetchRemote();

		const beforeById = new Map(before.map((t) => [t.id, t]));
		const localIds = local.map((t) => t.id);
		const localIdSet = new Set(localIds);

		// Classify against the remote state before we touch it, so the response
		// describes exactly what this sync did.
		const added: number[] = [];
		const updated: number[] = [];
		for (const template of local) {
			const existing = beforeById.get(template.id);
			if (!existing) added.push(template.id);
			else if (existing.name !== template.name) updated.push(template.id);
		}
		const removed = before.map((t) => t.id).filter((id) => !localIdSet.has(id));

		// Bulk upsert via parallel arrays, then drop any id not in the local set.
		// Deleting a show cascades to its `show_characters` rows.
		if (local.length > 0) {
			await pool.query(
				`insert into show_templates (id, name)
				 select * from unnest($1::bigint[], $2::text[])
				 on conflict (id) do update set name = excluded.name, updated_at = now()`,
				[localIds, local.map((t) => t.name)]
			);
		}
		if (removed.length > 0) {
			await pool.query('delete from show_templates where not (id = any($1::bigint[]))', [localIds]);
		}

		const result: ShowTemplateSyncResult = {
			templates: await fetchRemote(),
			added,
			updated,
			removed
		};
		res.json(result);
	})
);

// The whole show→characters assignment map.
showTemplatesRouter.get(
	'/assignments',
	asyncHandler(async (_req, res) => {
		const assignments = await fetchAssignments();
		res.json({ assignments });
	})
);

// Set which show one character belongs to. Body: { showId: number | null } —
// null clears it, leaving the character unassigned.
//
// The sibling PUT below replaces a whole show's cast, which is what the /shows
// screen edits; this is the same join read from the character's side, which is
// what a per-character row edits. Doing it as one call rather than two cast
// rewrites keeps the move atomic (a character is never in both shows or neither)
// and never touches the rest of either cast.
//
// A character belongs to a single show here, so its existing rows are dropped
// whichever show they name. Both referenced rows are upserted first, from the
// local sources of truth, so an assignment works before an explicit sync has
// pushed either up.
showTemplatesRouter.put(
	'/assignments/:characterId',
	asyncHandler(async (req, res) => {
		const characterId = String(req.params.characterId);
		const character = characters.find((c) => c.id === characterId);
		if (!character) httpError(404, `No local character "${characterId}"`);

		const raw = (req.body as { showId?: unknown }).showId;
		if (raw !== null && !Number.isInteger(raw)) {
			httpError(400, 'Body must be { showId: number | null }');
		}
		const showId = raw === null ? null : Number(raw);

		// The show must exist in the local collection so we can upsert its name.
		let template: ShowTemplate | undefined;
		if (showId !== null) {
			template = (await localTemplates()).find((t) => t.id === showId);
			if (!template) httpError(404, `Show ${showId} is not in the saved collection`);
		}

		await ensureTables();
		const client = await getPool().connect();
		try {
			await client.query('begin');
			await client.query(
				`insert into character_templates (id, name) values ($1, $2)
				 on conflict (id) do update set name = excluded.name, updated_at = now()`,
				[characterId, character!.label]
			);
			await client.query('delete from show_characters where character_id = $1', [characterId]);
			if (template) {
				await client.query(
					`insert into show_templates (id, name) values ($1, $2)
					 on conflict (id) do update set name = excluded.name, updated_at = now()`,
					[template.id, template.name]
				);
				await client.query(
					'insert into show_characters (show_id, character_id) values ($1::bigint, $2)',
					[template.id, characterId]
				);
			}
			await client.query('commit');
		} catch (error) {
			await client.query('rollback').catch(() => undefined);
			const message = error instanceof Error ? error.message : String(error);
			httpError(400, `Could not save assignment: ${message}`);
		} finally {
			client.release();
		}

		res.json({ assignments: await fetchAssignments() });
	})
);

// Replace the character assignments for one show. Body: { characterIds: string[] }.
// The show template row is upserted first (from the local collection) so the FK
// holds without a separate sync; the characters, however, must already be synced
// into `character_templates` — an unsynced id trips the FK and returns a 400.
showTemplatesRouter.put(
	'/:showId/characters',
	asyncHandler(async (req, res) => {
		const showId = Number(req.params.showId);
		if (!Number.isInteger(showId)) httpError(400, 'showId must be an integer');

		const body = req.body as { characterIds?: unknown };
		if (!body || !Array.isArray(body.characterIds)) {
			httpError(400, 'Body must be { characterIds: string[] }');
		}
		const characterIds = [...new Set(body.characterIds as unknown[])];
		if (!characterIds.every((id) => typeof id === 'string')) {
			httpError(400, 'characterIds must all be strings');
		}

		// Reject ids that aren't in the local registry up front, with a clearer
		// message than the FK violation would give.
		const known = new Set(characters.map((c) => c.id));
		const unknown = (characterIds as string[]).filter((id) => !known.has(id));
		if (unknown.length > 0) {
			httpError(400, `Unknown character id(s): ${unknown.join(', ')}`);
		}

		// The show must exist in the local collection so we can upsert its name.
		const local = await localTemplates();
		const template = local.find((t) => t.id === showId);
		if (!template) httpError(404, `Show ${showId} is not in the saved collection`);

		const pool = getPool();
		const client = await pool.connect();
		try {
			await client.query('begin');
			await client.query(
				`insert into show_templates (id, name) values ($1, $2)
				 on conflict (id) do update set name = excluded.name, updated_at = now()`,
				[template!.id, template!.name]
			);
			await client.query('delete from show_characters where show_id = $1', [showId]);
			if ((characterIds as string[]).length > 0) {
				await client.query(
					`insert into show_characters (show_id, character_id)
					 select $1::bigint, * from unnest($2::text[])`,
					[showId, characterIds as string[]]
				);
			}
			await client.query('commit');
		} catch (error) {
			await client.query('rollback').catch(() => undefined);
			const message = error instanceof Error ? error.message : String(error);
			// A FK violation here means a character isn't synced to Supabase yet.
			httpError(400, `Could not save assignments: ${message}`);
		} finally {
			client.release();
		}

		res.json({ assignments: await fetchAssignments() });
	})
);
