-- Booster claiming: the server-side enforcement behind the frontend's booster boxes.
--
-- Opening a booster box is gated by two rules that must hold regardless of what the
-- browser does:
--   1. The town must be celebrating a festa major inside the booster window — it
--      must have a row in `festivities` (see festivities.sql) for a date from 3 days
--      before through 4 days after today in Europe/Madrid (Catalan) time. A festa
--      major runs over its weekend rather than on one evening, so the window is the
--      whole stretch around it; keep it in step with BOOSTER_DAYS_BEHIND /
--      BOOSTER_DAYS_AHEAD in @3xl/shared utils/festes/booster-window.ts, and with the
--      festivity sync's own lower bound (../src/routes/festivities.ts), which must
--      reach at least as far back or the days behind get pruned before anyone can
--      claim them.
--   2. **One box per player, per town, per year, per stock.** A town deals two boxes
--      a year and no more: the white one printed on the day of its festa major, and
--      the black one printed around it. Take either and it is taken — that pairing is
--      the unique index below, and it is what a claim is refused against.
--
--      The year is the *festa's* own, not the day somebody opened it: the box belongs
--      to a town's celebration, and the window reaches four days past the last of them,
--      so a festa on the 2nd of January is the new year's box even to a player opening
--      it on the 30th of December. Which festa, when a town holds several inside the
--      window, is the nearest one to today — the same festa the stock is read off, so
--      the box's colour and the box's year are always the one celebration's.
--
--      This replaced a *daily* allowance: a cap of `floor(level/4) + 1` boxes a day,
--      plus two on the day the account was created, plus a `booster_grants` ledger
--      that a level reached, a town taken, a town held and an admin's grant all paid
--      into. Everything about it is dropped below — the table, the four functions that
--      added it up, and `recycle_spawns`, which existed to buy into it. What a day is
--      worth is no longer a number a player has: it is the festes on the calendar,
--      which is the same offer for everybody and cannot be farmed.
--
--      Two kinds of box are not a town's at all: the **welcome box**, dealt once to
--      each player when they arrive, and the **level boxes**, one for each level a
--      player has reached (see `claim_welcome_booster` and `claim_level_booster` at the
--      foot of this file). Neither needs a rule of its own — both are filed under a town
--      and a year no festa can ever produce, so the same unique index that spends a
--      town's box is what spends them. The level boxes put the *level* where the year
--      goes, which is what makes them one apiece rather than one in total.
--
-- Because the frontend talks to Supabase directly with the anon key, these rules
-- live in the database, not the client: `character_spawns` has no insert policy
-- (see character_spawns.sql), so the ONLY way to create spawns is the
-- `claim_booster` security-definer RPC here, which applies both rules atomically.
-- The same is true of `player_avatars` (see player_avatars.sql): a box grants one
-- avatar alongside its five cards, and that grant is the only way an avatar exists.
--
-- @3xl/backend provisions all of this automatically alongside the other tables
-- (see ../src/routes/show-templates.ts), so you normally do NOT need to run this
-- file — it's kept for reference and for provisioning by hand.
--
-- Idempotent: safe to re-run.

-- One row per booster box a player has opened, and the record the one-per-town-per-
-- year-per-stock rule is enforced against. Written only by claim_booster; RLS lets a
-- player read only their own claims, which is what the game reads to grey out the
-- boxes they have already taken.
create table if not exists public.booster_claims (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	show_id bigint references public.show_templates (id) on delete set null,
	location_id text not null,
	-- The stock the box was printed on ('white' / 'black') and the year of the festa
	-- it was printed for. Together with the player and the town they are the claim:
	-- see the unique index below.
	box text,
	year integer,
	claimed_at timestamptz not null default now()
);

alter table public.booster_claims add column if not exists box text;
alter table public.booster_claims add column if not exists year integer;

-- Rows written before the two columns existed carry the rule implicitly and have to
-- be given it explicitly, or the index below would file every one of them under the
-- same (null, null) pair.
--
-- The stock comes off the box's own cards: a claim and the five spawns it dealt are
-- one transaction, so they share `now()` to the microsecond, and `character_spawns`
-- has stamped every card with the box it came out of since well before this. A claim
-- whose cards are gone (recycled, when recycling existed) reads as black, the stock
-- all but a handful of boxes are printed on.
update public.booster_claims bc set box = s.box
from (
	select distinct on (user_id, location_id, created_at)
		user_id, location_id, created_at, box
	from public.character_spawns
	where box is not null
) s
where bc.box is null
	and s.user_id = bc.user_id
	and s.location_id = bc.location_id
	and s.created_at = bc.claimed_at;

update public.booster_claims set box = 'black' where box is null;

-- The year is taken from when the box was opened rather than from the festa it was
-- printed for: which festivity that was is not recorded on the claim, and the two
-- differ only for the week either side of New Year.
update public.booster_claims
	set year = extract(year from (claimed_at at time zone 'Europe/Madrid'))::int
	where year is null;

-- Under the old daily allowance one player could open a town's box many times over.
-- Keep the first of each (player, town, year, stock) and drop the rest, so the unique
-- index can be created at all. Only the claim rows go: the cards and avatars those
-- boxes dealt are the player's and stay theirs.
delete from public.booster_claims bc
using public.booster_claims keep
where bc.user_id = keep.user_id
	and bc.location_id = keep.location_id
	and bc.year = keep.year
	and bc.box = keep.box
	and (keep.claimed_at, keep.id) < (bc.claimed_at, bc.id);

alter table public.booster_claims alter column box set not null;
alter table public.booster_claims alter column year set not null;

alter table public.booster_claims drop constraint if exists booster_claims_box_stock;
alter table public.booster_claims add constraint booster_claims_box_stock
	check (box in ('white', 'black'));

-- The rule itself. claim_booster checks for the row before it rolls anything (so a
-- refusal is a sentence and not a constraint violation), but the check and the insert
-- are only atomic because of this index: two boxes opened at once would both find
-- nothing and both insert, and the second is what this refuses.
create unique index if not exists booster_claims_once_idx
	on public.booster_claims (user_id, location_id, year, box);

-- Every box a player has taken this year, which is what the game greys out. The old
-- (user_id, claimed_at) index served a daily count nothing asks for any more.
drop index if exists public.booster_claims_user_day_idx;
create index if not exists booster_claims_user_year_idx
	on public.booster_claims (user_id, year);

alter table public.booster_claims enable row level security;

drop policy if exists booster_claims_select_own on public.booster_claims;
create policy booster_claims_select_own on public.booster_claims
	for select using (auth.uid() = user_id);

-- The daily allowance and everything that paid into it. Dropped in dependency order:
-- `recycle_spawns` and the two granting functions call `grant_boosters`, which reads
-- and writes `booster_grants` alongside `booster_allowance`. `boosters_status` went
-- with them — what is left to open is no longer a number the server adds up, it is
-- the window's festes minus the rows above, which the browser already has both halves
-- of. `level_for_exp` stays: a player still has a level, it simply no longer buys
-- boxes.
drop function if exists public.recycle_spawns(uuid[]);
drop function if exists public.grant_level_up_boosters(uuid, bigint, bigint);
drop function if exists public.grant_boosters(uuid, int, text, text);
drop function if exists public.booster_allowance(uuid);
drop function if exists public.daily_booster_allowance(int);
drop function if exists public.boosters_status();
drop table if exists public.booster_grants;

-- Player level from an accumulated experience total: the cumulative D&D 5e
-- thresholds, level 20 the cap. Keep in sync with DND_LEVEL_THRESHOLDS /
-- levelForExp in @3xl/shared utils/progression/level.ts.
create or replace function public.level_for_exp(p_exp bigint)
returns int language sql immutable set search_path = public as $$
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
$$;

-- Weighted pick out of a pool: `p_ids` with `p_weights` summing to `p_total`, one
-- id back, the cumulative walk. Its own function because claim_booster draws from
-- the same pool twice — once per card, and once for the avatar — and two copies of
-- a draw are two things to keep in step.
create or replace function public.pick_weighted(
	p_ids text[],
	p_weights numeric[],
	p_total numeric
)
returns text
language plpgsql
volatile
set search_path = public
as $$
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
	-- Floating-point slack at the very top of the range: the last id is the answer.
	return p_ids[array_length(p_ids, 1)];
end;
$$;

-- Open a booster box for the caller, enforced entirely server-side (see header).
-- Rolls 5 cards from the town's show — which is the caller's `p_show_id` only while
-- nobody holds the town; once a player has taken it the town deals ITS occupier's
-- team's show, read off `municipality_holders` here (see below) — from that show's
-- assigned, template-backed roster, weighted by
-- rarity (each higher tier 2x rarer), each card taking one of the three colours
-- its box holds — plus ONE avatar (see player_avatars.sql), drawn from those same
-- two possibilities: a character on this show, in one of this box's colours. It
-- returns both.
--
-- Both halves come back in one jsonb object rather than as a row set, because they
-- are two shapes: `{ "spawns": [...], "avatar": {...} }`. (This is why the function
-- is dropped and recreated below — Postgres will not replace a function's return
-- type in place.) An avatar the player already holds is not dealt twice: the insert
-- hands the held row back, so the collection never carries the same portrait twice
-- and the pack still shows what it gave.
--
-- Which box that is, this decides for itself, from the same `festivities` rows the
-- window check reads: the town's nearest festa to today. Celebrating today, it deals
-- the white box, which holds the secondaries (purple/green/orange); past or still to
-- come inside the window, the black one, which holds the primaries
-- (red/blue/yellow). It is the same white/black the boxes are printed on and the map
-- draws its discs in, so what a player is shown is what they get — but the browser is
-- not asked, it is read here, and stamped on every card as `character_spawns.box` and
-- on the claim itself. Inside a box the three colours are equally likely: the rare
-- thing is the white box, there being one day of it against the window's other seven.
-- Keep the triples in step with BOX_SPAWN_COLORS in @3xl/shared utils/spawn/color.ts.
--
-- A per-user advisory lock serialises concurrent opens, so a town's one box cannot be
-- taken twice by racing the check; the unique index is the backstop under it.
-- security definer: it inserts despite character_spawns having no client insert
-- policy.
drop function if exists public.claim_booster(bigint, text);

create or replace function public.claim_booster(p_show_id bigint, p_location_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v_uid uuid := auth.uid();
	v_today date := (now() at time zone 'Europe/Madrid')::date;
	-- The booster window around today (see header).
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
	v_row public.character_spawns%rowtype;
	v_avatar public.player_avatars%rowtype;
	v_spawns jsonb := '[]'::jsonb;
	i int;
begin
	if v_uid is null then
		raise exception 'You must be signed in to open a booster.';
	end if;
	if p_location_id is null or p_location_id = '' then
		raise exception 'A location is required to open a booster.';
	end if;

	-- Serialise this player's opens, so two at once can't both pass the check below.
	perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

	-- The festa this box is printed for: the town's nearest one inside the window,
	-- which is today's whenever it has one. It is the whole of what the box is — its
	-- stock and its year both come off this one date — so a town with no festa in
	-- range has no box at all.
	select f.date into v_festa
		from public.festivities f
		where f.location_id = p_location_id
			and f.date between v_today - v_days_behind and v_today + v_days_ahead
		order by abs(f.date - v_today), f.date
		limit 1;
	if v_festa is null then
		raise exception 'This town is not celebrating a festa major these days.';
	end if;

	-- White while the festa is on, black around it; and the year is the festa's, so a
	-- celebration reached across New Year is still the one box.
	v_year := extract(year from v_festa)::int;
	if v_festa = v_today then
		v_box := 'white';
		v_colors := array['purple', 'green', 'orange'];
	else
		v_box := 'black';
		v_colors := array['red', 'blue', 'yellow'];
	end if;

	-- One box per player, per town, per year, per stock. Asked before anything is
	-- rolled so the refusal is a sentence a player can read; the unique index on the
	-- table is what actually makes it impossible.
	if exists (
		select 1 from public.booster_claims c
		where c.user_id = v_uid
			and c.location_id = p_location_id
			and c.year = v_year
			and c.box = v_box
	) then
		raise exception 'You have already opened this town''s % box for %.', v_box, v_year;
	end if;

	-- Which show this town's boxes deal.
	--
	-- A town nobody has taken deals the show its own geometry seeds it with (see
	-- @3xl/shared's utils/geo/municipality-show.ts) — an answer worked out from the
	-- polygons, which exist only in the browser, so that one arrives as p_show_id
	-- and is taken as given. A town
	-- somebody HOLDS deals its occupier's show instead: the sitting team's lead's,
	-- exactly as the map labels the town — and it is read here rather than accepted
	-- from the caller, because which show a conquered town deals is a consequence of
	-- the conquest and not a choice the browser gets to make. It follows the town
	-- automatically: the holder row is rewritten the moment the town changes hands,
	-- and the next box opened there is already the new show's.
	--
	-- A lead on several shows resolves to the alphabetically first, the same tie the
	-- browser breaks (showIdsByCharacter in @3xl/shared utils/spawn/team-show.ts
	-- walks the shows in name order), so the cover on the box and the pool behind it
	-- name one show. A holder whose lead is on no show leaves the box as the caller
	-- found it, which is the seeded show the map still draws it with.
	v_show_id := p_show_id;
	select h.team->0->>'character_id' into v_lead
		from public.municipality_holders h
		where h.location_id = p_location_id;
	if v_lead is not null then
		select sc.show_id into v_ruling_show
			from public.show_characters sc
			join public.show_templates st on st.id = sc.show_id
			where sc.character_id = v_lead
			order by st.name, sc.show_id
			limit 1;
		v_show_id := coalesce(v_ruling_show, v_show_id);
	end if;

	-- Roll pool: characters assigned to the show (any show when null) that exist
	-- as templates, with their rarity tiers.
	with pool as (
		select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
		from public.show_characters sc
		join public.character_templates ct on ct.id = sc.character_id
		where v_show_id is null or sc.show_id = v_show_id
	)
	select array_agg(id order by id), array_agg(rarity order by id)
		into v_ids, v_rarities
	from pool;

	if v_ids is null or array_length(v_ids, 1) is null then
		raise exception 'There are no claimable characters for this show.';
	end if;

	-- Selection weights: tier 0 weighs 1, each higher tier 2x rarer.
	select array_agg(w order by ord), sum(w)
		into v_weights, v_total
	from (
		select ord, 1.0 / (2 ^ r) as w
		from unnest(v_rarities) with ordinality as t(r, ord)
	) s;

	-- Record the box as taken, then roll its cards. This is the row that spends the
	-- town's year, so it is written before anything is dealt.
	insert into public.booster_claims (user_id, show_id, location_id, box, year)
		values (v_uid, v_show_id, p_location_id, v_box, v_year);

	for i in 1..v_size loop
		-- Weighted-by-rarity character pick, then a colour: one of the box's three,
		-- each equally likely.
		v_pick := public.pick_weighted(v_ids, v_weights, v_total);
		v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];

		insert into public.character_spawns (user_id, character_id, show_id, location_id, color, box)
			values (v_uid, v_pick, v_show_id, p_location_id, v_color, v_box)
			returning * into v_row;
		v_spawns := v_spawns || to_jsonb(v_row);
	end loop;

	-- The box's avatar: one portrait, drawn exactly as a card is — the same
	-- rarity-weighted pool, the same three colours — because what a box can deal is
	-- what a box can deal, whichever kind of thing comes out of it. A pair the player
	-- already holds is not a second item: the conflict clause touches nothing and
	-- hands back the row they hold, so the box still has an avatar to show.
	v_pick := public.pick_weighted(v_ids, v_weights, v_total);
	v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
	insert into public.player_avatars (user_id, character_id, color, show_id, location_id)
		values (v_uid, v_pick, v_color, v_show_id, p_location_id)
		on conflict (user_id, character_id, color) do update
			set granted_at = player_avatars.granted_at
		returning * into v_avatar;

	return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar));
end;
$$;

grant execute on function public.claim_booster(bigint, text) to authenticated;

-- The welcome box: the one booster a player is given rather than has to go and find.
--
-- It deals exactly what a town's box deals — five rarity-weighted cards and one avatar,
-- all six out of one show's assigned, template-backed roster, each in one of the three
-- colours its stock holds — and it differs from `claim_booster` in only three ways:
--
--   * There is no festa and no window. It is not printed for a celebration, so there is
--     nothing to be inside of and nothing to read a stock or a year off.
--   * The show is the caller's own pick, passed and not derived. A town's box takes its
--     show from the polygon under it (seeded) or from whoever holds it; this box stands
--     on nothing, so the browser's choice IS the answer rather than a suggestion the
--     server may overrule.
--   * It is one per player, full stop — not one per player per year. Which is why the
--     year below is 0 and not the year it was opened in: a year that moved would deal a
--     second welcome every January.
--
-- What it is emphatically NOT is a rule of its own. "One and no more" is already the
-- unique index on (user_id, location_id, year, box); all this box needs is a town and a
-- year no festa can ever produce, which is what the three constants below are. Keep them
-- in step with `welcome-box.ts` in @3xl/shared, which is where the browser spells the
-- same three — the caption the box carries where a town and a year would go is there too,
-- and is the only part of this that is not also a claim key.
--
-- White stock, so the secondaries (purple/green/orange): the rare one of the two, for the
-- one box a player does not have to go anywhere for.
--
-- security definer for the same reason as `claim_booster`: `character_spawns` and
-- `player_avatars` take no client insert at all, and the per-user advisory lock is the
-- same one, so a welcome and a town's box cannot be opened at the same instant either.
create or replace function public.claim_welcome_booster(p_show_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v_uid uuid := auth.uid();
	-- The three that make this box's claim key (see above).
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
	v_row public.character_spawns%rowtype;
	v_avatar public.player_avatars%rowtype;
	v_spawns jsonb := '[]'::jsonb;
	i int;
begin
	if v_uid is null then
		raise exception 'You must be signed in to open a booster.';
	end if;
	if p_show_id is null then
		raise exception 'Choose a show to open your welcome box.';
	end if;

	-- Serialise this player's opens, so two at once can't both pass the check below.
	perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

	-- One to a player. Asked on the location alone rather than on the whole key: the
	-- year and the stock are constants here, so a row under this town is the welcome
	-- box whatever else is on it, and a refusal is a sentence a player can read. The
	-- unique index is what actually makes a second one impossible.
	if exists (
		select 1 from public.booster_claims c
		where c.user_id = v_uid and c.location_id = v_location
	) then
		raise exception 'You have already opened your welcome box.';
	end if;

	-- Roll pool: characters assigned to the chosen show that exist as templates, with
	-- their rarity tiers. Unlike a town's box there is no "any show" case — a box with
	-- no show is a box with no cover, and this one is chosen by its cover.
	with pool as (
		select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
		from public.show_characters sc
		join public.character_templates ct on ct.id = sc.character_id
		where sc.show_id = p_show_id
	)
	select array_agg(id order by id), array_agg(rarity order by id)
		into v_ids, v_rarities
	from pool;

	if v_ids is null or array_length(v_ids, 1) is null then
		raise exception 'There are no claimable characters for this show.';
	end if;

	-- Selection weights: tier 0 weighs 1, each higher tier 2x rarer.
	select array_agg(w order by ord), sum(w)
		into v_weights, v_total
	from (
		select ord, 1.0 / (2 ^ r) as w
		from unnest(v_rarities) with ordinality as t(r, ord)
	) s;

	-- Record the box as taken, then roll its cards — the row that spends the welcome, so
	-- it is written before anything is dealt.
	insert into public.booster_claims (user_id, show_id, location_id, box, year)
		values (v_uid, p_show_id, v_location, v_box, v_year);

	for i in 1..v_size loop
		v_pick := public.pick_weighted(v_ids, v_weights, v_total);
		v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
		insert into public.character_spawns (user_id, character_id, show_id, location_id, color, box)
			values (v_uid, v_pick, p_show_id, v_card_location, v_color, v_box)
			returning * into v_row;
		v_spawns := v_spawns || to_jsonb(v_row);
	end loop;

	-- The box's avatar, drawn exactly as a card is. This one is very likely the first
	-- portrait its player holds, and the browser puts it on for anybody still wearing the
	-- initial-letter avatar (see WelcomeBoosterModal) — through `set_player_avatar` like
	-- any other choice, since what is worn is the player's and not this function's to set.
	v_pick := public.pick_weighted(v_ids, v_weights, v_total);
	v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
	insert into public.player_avatars (user_id, character_id, color, show_id, location_id)
		values (v_uid, v_pick, v_color, p_show_id, v_card_location)
		on conflict (user_id, character_id, color) do update
			set granted_at = player_avatars.granted_at
		returning * into v_avatar;

	return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar));
end;
$$;

grant execute on function public.claim_welcome_booster(bigint) to authenticated;

-- The level boxes: one booster box for every level a player has reached.
--
-- The third and last kind of box, and the second that belongs to no town. A town's is
-- printed for a festa major and has to be gone to; the welcome one is printed for a
-- player arriving and is dealt once; this one is printed for a *level*, from the first
-- one upward, each opened on its own and each on a show the player picks. Reaching
-- level 4 with none of them taken is four boxes standing there and not one, which is
-- why the level is part of the claim key rather than a running count somebody could
-- spend twice.
--
-- Like the welcome box it is not a rule of its own. "One box per level" is already the
-- unique index on (user_id, location_id, year, box): all it needs is a town no festa
-- can produce and a *year* that is really the level. So the claim key is
-- ('nivell', <level>, 'black') — and the black stock, the primaries, because white is
-- the rare one, printed for the day of a festa and for the single welcome, and a box
-- that comes again at every level is not that. Keep the three in step with
-- `level-box.ts` in @3xl/shared, which is where the browser spells the same ones.
--
-- What IS this box's own rule, and the one thing the index cannot say, is that the
-- player has actually reached the level they are asking for. That is read here, off
-- `player_profiles.exp` through `level_for_exp` — never taken from the caller, who
-- names only *which* of their levels they are opening. Experience comes from fighting
-- and from nothing else (see `award_combat_exp`), so a level is earned before it is a
-- box; a player with no profile row yet has earned nothing and is level 1, which is
-- the one box everybody starts with.
--
-- security definer for the same reason as the other two, and it takes the same
-- per-user advisory lock, so a level box, a welcome and a town's box cannot be opened
-- at the same instant.
create or replace function public.claim_level_booster(p_show_id bigint, p_level int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v_uid uuid := auth.uid();
	-- The three that make this box's claim key (see above); the year is the level.
	v_location constant text := 'nivell';
	-- Where this box's *cards* are filed, which is not where its claim is: the level
	-- goes on the card, so a card can say which time its owner levelled up long after
	-- the box that dealt it is off the screen. The claim keeps the bare sentinel — the
	-- level is already its `year`, and putting it in the town as well would file one box
	-- under two names. See `levelBoxLocationId` in @3xl/shared's level-box.ts.
	v_card_location constant text := v_location || ':' || p_level;
	v_box constant text := 'black';
	v_colors constant text[] := array['red', 'blue', 'yellow'];
	v_size constant int := 5;
	-- The highest level this player has actually reached, read here and not accepted.
	v_reached int;
	v_ids text[];
	v_rarities int[];
	v_weights numeric[];
	v_total numeric;
	v_pick text;
	v_color text;
	v_row public.character_spawns%rowtype;
	v_avatar public.player_avatars%rowtype;
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

	-- Serialise this player's opens, so two at once can't both pass the checks below.
	perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

	-- The level the box is claimed against. A player who has never fought has no
	-- profile row at all, which is level 1 and not "no levels": the first box is the
	-- one everybody has from the start.
	select public.level_for_exp(coalesce(p.exp, 0)) into v_reached
		from public.player_profiles p
		where p.user_id = v_uid;
	v_reached := coalesce(v_reached, public.level_for_exp(0));
	if p_level > v_reached then
		raise exception 'You have not reached level % yet.', p_level;
	end if;

	-- One box per level. Asked before anything is rolled so the refusal is a sentence a
	-- player can read; the unique index is what makes a second one impossible.
	if exists (
		select 1 from public.booster_claims c
		where c.user_id = v_uid
			and c.location_id = v_location
			and c.year = p_level
			and c.box = v_box
	) then
		raise exception 'You have already opened your level % box.', p_level;
	end if;

	-- Roll pool: characters assigned to the chosen show that exist as templates, with
	-- their rarity tiers. As with the welcome box there is no "any show" case — this box
	-- is chosen by its cover.
	with pool as (
		select distinct ct.id as id, coalesce(ct.rarity, 0) as rarity
		from public.show_characters sc
		join public.character_templates ct on ct.id = sc.character_id
		where sc.show_id = p_show_id
	)
	select array_agg(id order by id), array_agg(rarity order by id)
		into v_ids, v_rarities
	from pool;

	if v_ids is null or array_length(v_ids, 1) is null then
		raise exception 'There are no claimable characters for this show.';
	end if;

	-- Selection weights: tier 0 weighs 1, each higher tier 2x rarer.
	select array_agg(w order by ord), sum(w)
		into v_weights, v_total
	from (
		select ord, 1.0 / (2 ^ r) as w
		from unnest(v_rarities) with ordinality as t(r, ord)
	) s;

	-- Record the box as taken, then roll its cards — the row that spends this level.
	insert into public.booster_claims (user_id, show_id, location_id, box, year)
		values (v_uid, p_show_id, v_location, v_box, p_level);

	for i in 1..v_size loop
		v_pick := public.pick_weighted(v_ids, v_weights, v_total);
		v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
		insert into public.character_spawns (user_id, character_id, show_id, location_id, color, box)
			values (v_uid, v_pick, p_show_id, v_card_location, v_color, v_box)
			returning * into v_row;
		v_spawns := v_spawns || to_jsonb(v_row);
	end loop;

	-- The box's avatar, drawn exactly as a card is: what a box can deal is what a box
	-- can deal, whichever kind of thing comes out of it.
	v_pick := public.pick_weighted(v_ids, v_weights, v_total);
	v_color := v_colors[1 + floor(random() * array_length(v_colors, 1))];
	insert into public.player_avatars (user_id, character_id, color, show_id, location_id)
		values (v_uid, v_pick, v_color, p_show_id, v_card_location)
		on conflict (user_id, character_id, color) do update
			set granted_at = player_avatars.granted_at
		returning * into v_avatar;

	-- The level goes back with the cards: the caller opened the box it thought was
	-- oldest, and this is the server saying which one it actually spent.
	return jsonb_build_object('spawns', v_spawns, 'avatar', to_jsonb(v_avatar), 'level', p_level);
end;
$$;

grant execute on function public.claim_level_booster(bigint, int) to authenticated;

-- Cards dealt before the level was written onto one are all filed under the bare
-- sentinel, so every one of them says `Nivell` and none says which. The level is
-- recoverable exactly: a claim and the five cards it dealt are one transaction, so they
-- share `now()` to the microsecond — the same join the `box` backfill above is made on —
-- and the claim's `year` IS the level. Cards with no such claim (there are none, but the
-- join answers for it) keep the bare sentinel and go on saying the bare word.
--
-- Idempotent: after this there are no cards left under it to move.
update public.character_spawns s
	set location_id = 'nivell:' || c.year
from public.booster_claims c
where s.location_id = 'nivell'
	and c.user_id = s.user_id
	and c.location_id = 'nivell'
	and c.claimed_at = s.created_at;

update public.player_avatars a
	set location_id = 'nivell:' || c.year
from public.booster_claims c
where a.location_id = 'nivell'
	and c.user_id = a.user_id
	and c.location_id = 'nivell'
	and c.claimed_at = a.granted_at;
