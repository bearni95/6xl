-- Player profiles: per-player progression state, keyed by the Supabase auth user.
-- It holds an accumulated `exp` total — the frontend reads it and derives a level
-- from the D&D 5e experience table (see @3xl/shared's utils/progression/level.ts)
-- — plus which of the player's own avatars they are wearing (see
-- player_avatars.sql): the character and the colour, together, because that pair
-- is what one avatar is. The profile card in the navbar shows all three.
--
-- Like `character_spawns`, this is player-owned and RLS-gated. But unlike the
-- spawns table it is NOT written directly by the frontend, and it has no
-- general-purpose "add experience" entry point either: the only mutation path is
-- the `award_combat_exp` RPC (see combat_results.sql), which decides the amount
-- itself from a finished fight. There is deliberately no insert/update policy, so
-- a client holding the anon key can read its own total but can neither set it nor
-- name the increment. Which avatar is worn is the one thing a player does set
-- themselves, and it too goes through an RPC (`set_player_avatar` below) rather
-- than a write policy — so the same row's experience stays out of reach, and the
-- pair being worn is checked against what the player actually holds.
--
-- The earlier `add_player_exp(bigint)` RPC — which took the amount straight from
-- the browser, and which the /claim panel called to award experience per card
-- pulled — is dropped below: experience now comes from combat only.
--
-- @3xl/backend creates this table automatically alongside the other tables (see
-- ../src/routes/show-templates.ts), so you normally do NOT need to run this file
-- — it's kept for reference and for provisioning by hand.
--
-- Idempotent: safe to re-run.

create table if not exists public.player_profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	-- Accumulated experience. Starts at 0; only ever increased by award_combat_exp.
	exp bigint not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- The avatar the player wears, as the two halves that name one: the character
-- whose portrait it is, and the colour that portrait is printed in. Purely
-- cosmetic, and always read together — an avatar is the pair (see
-- player_avatars.sql), so half of one names nothing. Both null leaves the account
-- on the initial-letter avatar. Which portrait a character shows is not stored
-- here: it is the definition's own face, authored in the admin /characters/faces
-- screen, so re-cropping it there moves every player's avatar with it.
alter table public.player_profiles add column if not exists avatar_character_id text
	references public.character_templates (id) on delete set null;
alter table public.player_profiles add column if not exists avatar_color text;

-- Avatars worn under the old rule have no colour, and a portrait without one is no
-- longer an avatar: back then a player earned the *character* by collecting all six
-- colours of its card, and now they hold a character-in-a-colour dealt by a box.
-- There is no colour to infer — the old choice never named one — so these go back
-- to the letter avatar, and the boxes deal them their first real one.
update public.player_profiles
	set avatar_character_id = null
	where avatar_character_id is not null and avatar_color is null;

-- The player's chosen name, and the only place in the schema one is stored. It is
-- never derived from anything: not the `full_name` Google and Discord stamp onto
-- the auth user, not the address a magic link was sent to. A fresh account is null
-- here — nameless — and stays that way until its owner types a name through
-- `set_player_username` below, which is the sole writer. Clearing it puts the
-- account back to null, which is a state the game is happy to leave it in.
alter table public.player_profiles add column if not exists username text;

-- Unique across the game, case-insensitively, so two players cannot answer to the
-- same name. Null is not a name: it is excluded from the index, so any number of
-- accounts may sit at nameless at once.
create unique index if not exists player_profiles_username_key
	on public.player_profiles (lower(username))
	where username is not null;

-- Row-level security: a player may read only their own row. No insert/update
-- policy — mutation happens exclusively through the security-definer
-- `award_combat_exp` RPC in combat_results.sql, `set_player_avatar` and
-- `set_player_username` below.
alter table public.player_profiles enable row level security;

drop policy if exists player_profiles_select_own on public.player_profiles;
create policy player_profiles_select_own on public.player_profiles
	for select using (auth.uid() = user_id);

-- Usernames are public, the rest of the row is not. The map has to name whoever
-- holds a town to every visitor, signed in or not, but that must not open the
-- experience total beside it — and RLS grants rows, not columns. So the two
-- columns that are public get a view of their own: it is owned by the definer
-- (security_invoker off), so it reads past the table's own policy, and it selects
-- nothing else. Nameless accounts are left out entirely; there is nothing to name.
create or replace view public.player_names
	with (security_invoker = false) as
	select user_id, username
	from public.player_profiles
	where username is not null;

-- Read, and only read. This is not the belt to `grant select`'s braces: a view over
-- one table with no aggregate is **auto-updatable**, Supabase's default privileges
-- hand anon and authenticated every verb on anything new in this schema, and a
-- definer-owned view is not subject to the table's RLS. Granting select without
-- taking the rest away would therefore have opened a write path through the view
-- that the table itself refuses — any browser holding the anon key renaming any
-- player. Every definer view below does this, and any new one must too.
revoke all on public.player_names from anon, authenticated;
grant select on public.player_names to anon, authenticated;

-- The plate a player is read by, for every visitor: the name, the picture, and the
-- experience the level on it is worked out from. This is what `/profile/[id]`
-- draws, and it is the one thing here the view above deliberately would not open —
-- so the reasoning is worth stating rather than quietly reversing. A level is what
-- a player is ranked by; a profile page that would not say it is not a profile, and
-- the same number is already on the plate at the map's corner and read out of every
-- town its owner holds. What stays shut is everything about how the account signs
-- in: the address, the providers, the last time it was seen. None of those columns
-- is on this table at all, and the ones that are and are private — nothing today,
-- but that is what this list is for — are simply not selected.
--
-- Nameless accounts are kept, unlike `player_names`: an account with no name still
-- has a level and still fields a team, and the page words the missing name itself.
create or replace view public.player_profiles_public
	with (security_invoker = false) as
	select user_id, username, exp, avatar_character_id, avatar_color, created_at
	from public.player_profiles;

-- Read only, and here it matters most: this view is over one table with no
-- aggregate, so without the revoke it would be a way for any browser to *write*
-- its own experience total (see the note on player_names above).
revoke all on public.player_profiles_public from anon, authenticated;
grant select on public.player_profiles_public to anon, authenticated;

-- Wear one of the caller's own avatars, named by the pair that IS one: a character
-- and a colour. Passing nulls clears back to the initial-letter avatar; the two
-- halves are only ever set or cleared together, since half an avatar is none.
--
-- security definer because the table takes no client writes: this touches exactly
-- two cosmetic columns and can never reach `exp`. The rule it enforces is
-- ownership, and it is the rule — the caller must hold a `player_avatars` row for
-- that exact pair, which only a booster box can have put there. The picker only
-- ever shows what is held, but this is what decides, so a crafted call cannot wear
-- a portrait nobody dealt it.
--
-- The single-argument version this replaces enforced the retired rule (own the
-- character in all six card colours) and is dropped: a call with no colour is a
-- call from before avatars were items, and there is no colour to guess for it.
drop function if exists public.set_player_avatar(text);

create or replace function public.set_player_avatar(p_character_id text, p_color text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	v_uid uuid := auth.uid();
begin
	if v_uid is null then
		raise exception 'You must be signed in to choose an avatar.';
	end if;
	-- Clearing: either half missing means the letter avatar, and neither is stored.
	if p_character_id is null or p_color is null then
		insert into public.player_profiles (user_id, avatar_character_id, avatar_color)
			values (v_uid, null, null)
			on conflict (user_id) do update
				set avatar_character_id = null,
					avatar_color = null,
					updated_at = now();
		return null;
	end if;
	if not exists (
		select 1 from public.player_avatars a
		where a.user_id = v_uid
			and a.character_id = p_character_id
			and a.color = p_color
	) then
		raise exception 'You do not hold that avatar. Open booster packs to be dealt one.';
	end if;
	insert into public.player_profiles (user_id, avatar_character_id, avatar_color)
		values (v_uid, p_character_id, p_color)
		on conflict (user_id) do update
			set avatar_character_id = excluded.avatar_character_id,
				avatar_color = excluded.avatar_color,
				updated_at = now();
	return p_character_id;
end;
$$;

grant execute on function public.set_player_avatar(text, text) to authenticated;

-- Set, change, or clear (with null or blank) the caller's username. security
-- definer for the same reason as the avatar — the table takes no client writes, and
-- this touches one column and can never reach `exp` — but also because uniqueness
-- cannot be checked by a caller who, under RLS, can only see their own row.
--
-- The name must be typed to get here. Nothing is defaulted, suggested or
-- back-filled from the identity the caller signed in with; passing nothing simply
-- makes them nameless again.
create or replace function public.set_player_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
			raise exception 'A username is between 3 and 32 characters.' using errcode = '22023';
		end if;
		-- ASCII letters, digits and the underscore, and nothing else. A username is an
		-- identifier — it is what one player is called by another and what a town plate
		-- prints — so the accents, spaces and punctuation the old rule allowed are out:
		-- they are how one player comes to be mistaken for another. `[[:alnum:]]` is not
		-- used, since under a UTF-8 collation it takes accented letters back in.
		--
		-- The same rule is stated for the screens in @3xl/shared's types/profile.type.ts
		-- (USERNAME_PATTERN and the two lengths above) and checked before a name is sent,
		-- but this is what decides: nothing reaches the column except through here.
		if v_name !~ '^[A-Za-z0-9_]+$' then
			raise exception 'A username may use letters, digits and underscores only.'
				using errcode = '22023';
		end if;
		-- Checked explicitly as well as by the index, so the answer is a sentence
		-- rather than a constraint name. Case-insensitive: one Bernat is enough.
		if exists (
			select 1 from public.player_profiles p
			where p.user_id <> v_uid and lower(p.username) = lower(v_name)
		) then
			raise exception 'That username is already taken.' using errcode = '23505';
		end if;
	end if;

	insert into public.player_profiles (user_id, username)
		values (v_uid, v_name)
		on conflict (user_id) do update
			set username = excluded.username,
				updated_at = now();

	return v_name;
exception
	-- Two players naming themselves the same thing at the same moment: the index is
	-- what actually decides, and the loser is told the same thing.
	when unique_violation then
		raise exception 'That username is already taken.' using errcode = '23505';
end;
$$;

grant execute on function public.set_player_username(text) to authenticated;

-- Retire the client-driven award path. `add_player_exp(amount)` let whoever held
-- the anon key name their own increment, so any browser could grant itself an
-- arbitrary total. Experience is now computed server-side from a finished fight
-- by `award_combat_exp` (combat_results.sql) and nowhere else.
drop function if exists public.add_player_exp(bigint);
