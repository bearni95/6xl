-- Combat rewards: the ONLY way a player earns experience.
--
-- Fighting is the whole progression loop — claiming cards and opening boxes award
-- nothing. When a fight ends the browser reports it through the
-- `award_combat_exp` security-definer RPC below, which decides the award itself:
--
--   * A draw earns nothing at all.
--   * A loss earns **10 experience for each rival it took down** — nothing else. Not a
--     share of anything and not measured against what winning would have paid: what a
--     loss is paid for is the damage done on the way out, so a fight lost two lanes to
--     one is worth twice a fight lost having felled a single rival, and a whitewash is
--     worth nothing at all. It reads neither the level nor the player's own casualties,
--     which is why it is the same ten at level 1 and at level 19 — and why it is still
--     paid at level 20, where a win's span is zero. (Experience past the cap raises no
--     level; there is nowhere left for it to go.)
--   * A win earns a share of the player's *current level's full span* — the
--     experience between the threshold where that level begins and the one where
--     the next begins (300 at level 1, 600 at level 2, 1800 at level 3, …). The
--     whole span, not just the part not yet earned.
--   * That span is scaled linearly by how much of the player's team is left
--     standing: survivors / fielded. A flawless win — nobody taken down — earns
--     the entire span, i.e. exactly one level's worth from the base of the level;
--     a win with one of three left earns a third of it.
--   * At level 20 the span is 0, so a maxed player earns nothing further.
--
-- Combat itself runs in the browser (PixiJS board + combat controller), so it
-- cannot be replayed here. The report is therefore treated as a *claim* and
-- bounded rather than trusted:
--
--   * Every spawn in it must be one of the caller's own `character_spawns` rows;
--     a report naming a spawn the caller doesn't own is rejected outright.
--   * The team is counted here, not read from the report: at most 3 fighters, each
--     of them the caller's, each named once. A fighter is standing or it is down —
--     there is no health in this game — so the only thing the client states about
--     one is that flag, and the ratio it can inflate is bounded by the team size.
--   * The rivals felled are a number, not a line-up: they are the town's garrison
--     rather than cards the caller owns, so there is nothing to check them against.
--     What bounds them instead is the rival line-up the battle was opened with, which
--     is the server's own (battles.rivals) — and 3 on top of that. So the most a
--     report can talk itself into is one team's worth, 30 experience, off a battle
--     that had to be opened and a town's hour that had to be spent.
--   * The amount is never sent by the client: it is derived here from the
--     player's *stored* experience, which the client cannot write (player_profiles
--     has no insert/update policy and there is no longer an add_player_exp RPC).
--
-- What remains client-side is the outcome itself and the damage taken — a
-- tampered client can still claim a flawless win it did not earn. Closing that
-- gap needs the fight simulated server-side, which is a separate change.
--
-- The same RPC also settles TERRITORY, in the same transaction, when the fight
-- was picked over a town on the map: a win banks one siege win against that
-- town's sitting team, and enough of them flip the town to the winner. See
-- municipality_holders.sql for the tables and the rules.
--
-- It is no longer where BOOSTER BOXES are earned. A level reached, a town taken and a
-- town held each paid one into the player's day, back when a day had an allowance of
-- them to top up. A box is the calendar's now — one per player, per town, per year,
-- per stock (see booster_claims.sql) — so there is no balance left for a fight to pay
-- into. What a conquest still does to the boxes it does by holding the ground: a town
-- deals its occupier's show.
--
-- Every one of those bounds is on the WIN. A loss banks nothing and takes nothing, and
-- what it does pay is capped at one team's worth — off a report that says nothing about
-- the team, against a battle that had to be opened (and a town's challenge spent) before
-- it could be reported at all. There is nothing in thirty experience worth lying for
-- while the level's worth a win pays sits next to it, so a loss is always accepted,
-- whatever it names, and all else it does is close the
-- battle. That is what makes conceding a fight possible at all, and what stops a
-- battle that can never be won — a team whose cards are gone, a town taken in
-- the meantime — from becoming a fight its owner can never get out of. Opening one is
-- where a team is proved instead (`start_battle` in battles.sql), which is the only
-- place the answer is any use to the player.
--
-- Finishing a fight is also what ANNOUNCES it. The last thing the RPC does is put the
-- result on one Supabase Realtime channel — `combat-results`, a constant, so every game
-- end in the project lands on the same topic and an arena subscribes once to hear all of
-- them. It is a WebSocket push and not a table anybody reads: `realtime.send` writes the
-- message into `realtime.messages` and the Realtime service forwards it off the WAL, so
-- nothing polls anything and a fight settled anywhere arrives in every open arena as it
-- happens. See the send at the foot of the function for what it carries and why it can
-- never cost the fight.
--
-- A broadcast reaches whoever is listening at the moment it is made, so somebody who
-- opens the game at five past knows nothing of five o'clock. `recent_combat_feed` at the
-- foot of this file is the ten fights they are given to start from — the same rows, in
-- the same shape the channel sends them in, read once. Which is what puts the town and
-- the capture on this table: a fight that is going to be read out later has to record
-- what it was over, not only what it paid.
--
-- Territory is also where the challenge cooldown is *set*: settling a fight is
-- what shuts that town to its challenger for the next hour, timed from this
-- report rather than from when the fight opened, so a long fight is never also a
-- longer wait. Taking a town is likewise what excuses that hour for everyone
-- still fighting for the generation it ended, whose fights it just made
-- unwinnable. See municipality_challenges.sql.
--
-- @3xl/backend provisions all of this automatically alongside the other tables
-- (see ../src/routes/show-templates.ts), so you normally do NOT need to run this
-- file — it's kept for reference and for provisioning by hand.
--
-- Idempotent: safe to re-run.

-- One row per finished fight: the audit trail behind every experience gain, and
-- the only place awards are recorded. Written solely by award_combat_exp; RLS
-- lets a player read only their own fights.
create table if not exists public.combat_results (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	outcome text not null check (outcome in ('win', 'lose', 'draw')),
	-- Fighters left standing at the end / fielded at the start, as counted here.
	survivors integer not null,
	fielded integer not null,
	-- Rivals taken down, as bounded here — what a loss was paid for. 0 on a win or a
	-- draw, neither of which reads it.
	rivals_defeated integer not null default 0,
	-- The level whose span was at stake, and the span itself.
	level integer not null,
	level_span bigint not null,
	-- Experience actually awarded: a win's share of the span, ten a fallen rival for
	-- a loss, 0 for a draw.
	exp_awarded bigint not null,
	fought_at timestamptz not null default now()
);

-- Fights recorded while the award was weighed by compound HP carried hp_left/hp_max
-- instead. The two are not the same measure, so the columns are replaced rather than
-- renamed: an old row keeps the award it actually paid (outcome, level, exp_awarded)
-- and reads as 0 of 0 fighters, which is honestly "not recorded" rather than an HP
-- sum wearing a headcount's name.
alter table public.combat_results add column if not exists survivors integer not null default 0;
alter table public.combat_results add column if not exists fielded integer not null default 0;
alter table public.combat_results drop column if exists hp_left;
alter table public.combat_results drop column if exists hp_max;

-- Fights recorded while a loss was paid a hundredth of the level's span carry no rival
-- count, and read as 0 — which is what they were paid on, since the number played no
-- part in the award they actually got.
alter table public.combat_results
	add column if not exists rivals_defeated integer not null default 0;

-- WHERE the fight was, and what it did to the place. The row recorded what a fight paid
-- and never what it was over, which was fine while it was only an audit trail of awards
-- — and is not, now that the last ten of them are what a player joining the game is
-- shown (see recent_combat_feed below). A fight that cannot say which town it was over
-- cannot be read out.
--
-- Null on every row written before this, and that is what null means here: not "no
-- town", which no fight has, but "not recorded". The feed passes those over rather than
-- announcing a fight over nowhere.
alter table public.combat_results add column if not exists location_id text;
alter table public.combat_results add column if not exists captured boolean not null default false;
alter table public.combat_results add column if not exists stale boolean not null default false;

create index if not exists combat_results_user_day_idx
	on public.combat_results (user_id, fought_at);

-- The feed's own read: the last handful of fights across the whole game, newest first.
-- Nothing about a player is in the ordering, so this is the one index that is not by
-- user — everybody's fights are one list here.
create index if not exists combat_results_recent_idx
	on public.combat_results (fought_at desc)
	where location_id is not null;

alter table public.combat_results enable row level security;

drop policy if exists combat_results_select_own on public.combat_results;
create policy combat_results_select_own on public.combat_results
	for select using (auth.uid() = user_id);

-- Cumulative experience at which `p_level` begins — the D&D 5e table, clamped to
-- 1..20. Keep in sync with DND_LEVEL_THRESHOLDS / expForLevel in @3xl/shared
-- utils/progression/level.ts.
create or replace function public.exp_for_level(p_level int)
returns bigint language sql immutable set search_path = public as $$
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
$$;

-- The full width of a level: the experience between its threshold and the next
-- one. 0 at level 20 (no next threshold). Mirrors levelSpanExp in @3xl/shared.
create or replace function public.level_span_exp(p_level int)
returns bigint language sql immutable set search_path = public as $$
	select case
		when least(greatest(p_level, 1), 20) >= 20 then 0::bigint
		else public.exp_for_level(least(greatest(p_level, 1), 20) + 1)
			- public.exp_for_level(least(greatest(p_level, 1), 20))
	end;
$$;

-- Award experience for one finished fight (see the header for the rules and the
-- trust model). `p_fighters` is the player's side only, as a JSON array of
-- {"spawn_id": uuid, "down": boolean}; `p_rivals_defeated` is how many of the other
-- side went down, which is the whole of what a loss is paid for and is ignored
-- entirely by a win. Returns what was awarded and the state that
-- produced it, so the endgame screen can explain the number. security definer: it
-- writes player_profiles and combat_results, neither of which the anon key may
-- write.
--
-- **A report is only ever accepted against an open battle.** The caller's `battles`
-- row (battles.sql) is what says which town was fought and which generation of its
-- team — neither is taken from the report any more, so a browser cannot pick a
-- richer town to have won, nor pass off a fight against last week's occupant as a
-- fight against the one sitting there now. Reporting is also what ends the battle:
-- the row is deleted here, and only then may the player start another.
--
-- From that town: a win banks one siege win against its sitting team, and taking it
-- — turnover + 1 wins — rewrites municipality_holders with the winner and the team
-- they won with, wipes every siege on it, and raises the bar for the next
-- challenger. A fight against a generation that has since been superseded banks
-- nothing and comes back flagged `town_stale`. A town the caller already holds
-- cannot be fought for at all — the report is rejected outright, experience
-- included. Reporting is also what starts the town's cooldown for this player.
-- See municipality_holders.sql and municipality_challenges.sql.
--
-- (The OUT parameter names deliberately avoid the column names used in the body —
-- plpgsql would otherwise have to disambiguate them against the query.)

-- Every earlier signature is dropped rather than replaced. Leaving one in place would
-- give PostgREST overloads to choose between and make every rpc('award_combat_exp')
-- call ambiguous — and the four-argument one is precisely the version that let the
-- client name its own town and turnover.
drop function if exists public.award_combat_exp(text, jsonb);
drop function if exists public.award_combat_exp(text, jsonb, text, int);

create or replace function public.award_combat_exp(
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
	-- The rivals felled as this bounded them, which is what a loss was actually paid
	-- for — the report's own number is not echoed back.
	rivals_felled int,
	-- Territory, read off the battle that was being fought. The town is returned
	-- rather than echoed back from the report, because the report no longer names
	-- one: this is the browser learning which town it just fought over.
	town_id text,
	town_captured boolean,
	town_wins int,
	town_required int,
	town_turnover int,
	town_stale boolean
)
language plpgsql security definer set search_path = public as $$
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
	-- The rival line-up the battle was opened with, and the felled count bounded by it.
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
	-- The battle being reported: the town and the generation, as the server recorded
	-- them when the fight was opened.
	v_location text;
	v_fought int;
	-- The row this fight is filed as, and the moment it was filed. The announcement at
	-- the foot of this function carries exactly what was written down — it names the
	-- record rather than restating it, so a client that hears the same fight twice can
	-- tell that it is one fight.
	v_result_id uuid;
	v_fought_at timestamptz;
	-- Who fought it, as this game says a player: the name they chose and the avatar they
	-- wear. Read off player_profiles, which is where municipality_holders_public reads the
	-- same three fields from — already public to anyone who opens the map.
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

	-- The fight being reported has to be one the server opened. Everything about
	-- *what* was fought comes from here rather than from the report, and a report
	-- with no battle behind it is not a fight that happened — it is a claim about
	-- one, which is the whole thing this row exists to make impossible.
	select b.location_id, b.turnover, b.rivals into v_location, v_fought, v_rivals
		from public.battles b where b.user_id = v_uid;
	if v_location is null then
		raise exception 'You have no battle in progress to report.';
	end if;

	-- How many rivals the report may claim to have felled: the line-up this battle was
	-- opened against, which is the server's own, and never more than a team. A battle
	-- opened before line-ups were frozen carries none, and falls back to the team size
	-- rather than paying its loss nothing.
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

	-- The reported team, bounded against what the caller actually owns. A fighter is
	-- standing or it is down, so the survivors are simply counted over the fighters
	-- that turned out to be the caller's own.
	with reported as (
		select f.spawn_id, coalesce(f.down, false) as down
		from jsonb_to_recordset(p_fighters)
			as f(spawn_id uuid, down boolean)
	),
	owned as (
		select r.down
		from reported r
		join public.character_spawns cs on cs.id = r.spawn_id and cs.user_id = v_uid
	)
	select
		(select count(*) from reported),
		(select count(distinct spawn_id) from reported),
		(select count(*) from owned),
		(select count(*) from owned where not down)
	into v_reported, v_distinct, v_owned, v_standing;

	-- The report is bounded where it can buy something worth lying for, and only there.
	-- A win pays a level's worth of experience and banks ground, so it has to name a
	-- real team: at most three fighters, each of them the caller's own, each named once.
	-- A loss banks nothing, takes nothing, and pays only for the rivals it felled —
	-- thirty at the very most, off a count already bounded by the line-up the server
	-- itself froze — so it is always taken, whatever it names.
	-- Refusing one would not protect anything;
	-- it would strand a player in a fight they have already given up, which is exactly
	-- what happens to a battle opened before start_battle proved the team.
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

	-- The level at stake is the one the player is on *now*, before the award.
	select coalesce(exp, 0) into v_exp from public.player_profiles where user_id = v_uid;
	v_exp := coalesce(v_exp, 0);
	v_level := public.level_for_exp(v_exp);
	v_span := public.level_span_exp(v_level);

	-- A win earns the level's whole span, scaled by the share of the team still
	-- standing; a level-20 winner earns nothing, the span being zero. A loss earns ten
	-- for each rival it took down and nothing else — it reads neither the level nor the
	-- player's own casualties, so it is worth the same at every level (level 20
	-- included, where the experience raises nothing but is still paid for the work) and
	-- worth nothing at all when the fight was lost without felling anybody. A draw
	-- earns nothing, as it always did.
	if p_outcome = 'win' and v_span > 0 and v_owned > 0 then
		v_award := round(v_span::numeric * v_standing::numeric / v_owned::numeric);
	elsif p_outcome = 'lose' then
		v_award := v_felled * 10;
	else
		v_award := 0;
	end if;

	-- Only a loss was paid for the rivals, so only a loss records them: on a win or a
	-- draw the count played no part in the number beside it and is filed as 0.
	if p_outcome <> 'lose' then
		v_felled := 0;
	end if;

	if v_award > 0 then
		insert into public.player_profiles (user_id, exp)
			values (v_uid, v_award)
			on conflict (user_id) do update
				set exp = player_profiles.exp + v_award, updated_at = now()
			returning exp into v_total;
	else
		v_total := v_exp;
	end if;

	-- Territory. Every battle is picked over a town, so this always runs; the town is
	-- the one the battle was opened on.
	begin
		-- Serialise per town, so two challengers finishing at the same moment can't
		-- both read the same turnover and both take it.
		perform pg_advisory_xact_lock(hashtextextended('municipality:' || v_location, 0));

		select h.user_id, h.turnover into v_holder, v_turnover
			from public.municipality_holders h where h.location_id = v_location;
		-- A town whose sitting team is the caller's own cannot be WON: there is nothing
		-- to take off yourself. The map never offers the challenge, so a win reported
		-- against one did not come from the game — reject it outright, rolling back the
		-- experience with it, rather than paying out for a fight that should not have
		-- happened. A loss against it is simply a fight that ends, as every loss is.
		if v_holder is not null and v_holder = v_uid and p_outcome = 'win' then
			raise exception 'You already hold this town — you cannot challenge your own team.';
		end if;

		-- The town's cooldown starts here (see municipality_challenges.sql). The slot
		-- was opened by start_battle along with the battle itself, and settling it is
		-- what shuts the town for the next hour — measured from now, the end of the
		-- fight, so the time spent playing it is not also spent waiting. There is no
		-- way to arrive here with no slot at all: the battle this report is being made
		-- against could not have been opened without one.
		--
		-- A slot voided below (the town changed hands while this fight was open)
		-- settles like any other — the fight did happen and is paid for — but takes no
		-- cooldown: that fight was against a team that no longer sits there and its
		-- challenger is not made to wait for it. Settling is also what bounds the
		-- excuse, since a stale report cannot be replayed against a settled slot.
		update public.municipality_challenges
			set settled_at = now(),
				available_at = case
					when voided_at is null then now() + public.challenge_cooldown()
					else null
				end
			where user_id = v_uid
				and location_id = v_location
				and settled_at is null
			returning municipality_challenges.settled_at into v_challenge;
		-- Nothing to settle means this town's slot was closed by an earlier report,
		-- which is a second fight over the same town inside its cooldown. Only a win
		-- is refused for it — that would be a second payout of a level's worth, while
		-- a second loss pays what the first one did, ten a fallen rival off a
		-- battle that had to be opened to be reported at all, which is not worth
		-- stranding anybody over.
		if v_challenge is null and p_outcome = 'win' then
			raise exception 'You have just fought this town. Wait for it to open up again.';
		end if;

		-- No row at all means the town is still on its seeded OG team: turnover 0.
		v_turnover := coalesce(v_turnover, 0);
		v_required := greatest(1, v_turnover + 1);
		-- The generation the battle was opened against, against the one sitting there
		-- now: if the town has flipped since, what was beaten was not the sitting team
		-- and the win buys no ground. Both numbers are the server's own.
		v_stale := coalesce(v_fought, 0) <> v_turnover;

		if p_outcome = 'win' and not v_stale then
			-- Bank the win. A stored siege from an older generation is not added to —
			-- it restarts at this win, since it was earned against a team that no
			-- longer sits there.
			insert into public.municipality_sieges (location_id, user_id, wins, turnover)
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
				-- The town falls. Freeze the team that won it, in fielded order, copying
				-- each spawn's attributes rather than referencing the (RLS-scoped) row.
				--
				-- `location_id` is the town each card was CLAIMED in, not the one it has
				-- just taken: a card belongs to the place it was pulled at and goes on
				-- saying so wherever it is fielded. Null for a card claimed off the map,
				-- and missing altogether on rows frozen before this was carried across —
				-- readers fall back to the town they are standing on.
				select jsonb_agg(
						jsonb_build_object(
							'character_id', cs.character_id,
							'color', cs.color,
							'location_id', cs.location_id
						) order by f.ord
					)
					into v_team
					-- Ordinality over the raw elements (a scalar-returning SRF) rather than
					-- over jsonb_to_recordset, whose column-definition list does not combine
					-- with WITH ORDINALITY.
					from (
						select (e.elem->>'spawn_id')::uuid as spawn_id, e.ord
						from jsonb_array_elements(p_fighters) with ordinality as e(elem, ord)
					) f
					join public.character_spawns cs on cs.id = f.spawn_id and cs.user_id = v_uid;

				-- The occupant is recorded as a user id and nothing else. Their name is not
				-- copied in: the map reads it live off player_profiles.username through
				-- municipality_holders_public, so it is right after a rename and there is
				-- no second place a username could arrive from.
				insert into public.municipality_holders
					(location_id, user_id, team, turnover, taken_at)
					values (v_location, v_uid, coalesce(v_team, '[]'::jsonb),
						v_turnover + 1, now())
					on conflict (location_id) do update
						set user_id = excluded.user_id,
							team = excluded.team,
							turnover = excluded.turnover,
							taken_at = excluded.taken_at;

				-- A new generation voids every siege on the town, the winner's included.
				delete from public.municipality_sieges where location_id = v_location;

				-- It voids every fight still open against the old generation too. Those
				-- challengers started against a team that no longer sits here and their
				-- report, whenever it lands, will be refused as stale — so this town
				-- takes no hour off them for a fight this capture took away. The slot is
				-- marked, not deleted: their late report still settles this row (paying
				-- its experience and banking no ground, exactly as any stale report
				-- does), and the voided flag is what makes that settle carry no cooldown,
				-- so they may come straight back at the new occupant.
				--
				-- Only slots that were still open are excused — a challenger who already
				-- fought and reported here is inside a cooldown earned on a real fight
				-- against the team that was sitting here at the time.
				update public.municipality_challenges
					set voided_at = now()
					where location_id = v_location
						and settled_at is null
						and voided_at is null
						and user_id <> v_uid;
				-- Taking a town is worth the town, and nothing beside it. It paid a
				-- booster box too while a player had a day's allowance of them to top
				-- up; boxes are the calendar's now — one per town, year and stock (see
				-- booster_claims.sql) — so there is no longer a balance a capture could
				-- pay into. What a conquest does to the boxes is change whose show the
				-- town deals, which it does by holding it.
				v_captured := true;
				v_turnover := v_turnover + 1;
				v_wins := v_required;
			end if;
		else
			-- Nothing banked (a loss, a draw or a stale fight): report the progress
			-- they already had against this generation.
			select s.wins into v_wins from public.municipality_sieges s
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

	-- The fight is filed, and it is filed *here* — after the town has been settled rather
	-- than before it. The row is the audit trail behind the award, and it is now also the
	-- only memory the feed has: what a fight was over and whether it took the place are
	-- decided in the block above, so a row written before that block could only have said
	-- what the fight paid. Every rejection above raises and rolls the whole transaction
	-- back, so nothing is recorded that was not also paid.
	insert into public.combat_results
		(user_id, outcome, survivors, fielded, rivals_defeated, level, level_span, exp_awarded,
			location_id, captured, stale)
		values (v_uid, p_outcome, v_standing, v_owned, v_felled, v_level, v_span, v_award,
			v_location, v_captured, v_stale)
		returning id, fought_at into v_result_id, v_fought_at;

	-- The fight is over: the battle is closed and the player is free to start
	-- another. Every path that got here has already been paid for — the ones that
	-- reject a report raise, which rolls this back along with the experience, so a
	-- refused report leaves the player still in the battle they were in.
	delete from public.battles where user_id = v_uid;

	-- And it is announced. One channel takes every game end there is (`combat-results`,
	-- a constant), and it is a *public* topic — `private => false` — because what goes out
	-- on it is what anyone who opens the map can already read off a town: a player's
	-- chosen name, the avatar they wear, and what they did to a place. Nothing about the
	-- account behind it and nothing about the cards.
	--
	-- Sent from the end of the RPC rather than from a trigger on the insert above,
	-- because a fight is not finished until the town has been settled: whether it changed
	-- hands is decided below the row that records the award, and it is the most
	-- interesting thing the feed has to say.
	--
	-- The whole of it is swallowed on failure. A broadcast is a copy of the fight going
	-- out, not the fight: an announcement that could not be made must never roll back the
	-- experience, the ground taken and the closing of the battle it was announcing — so a
	-- project whose Realtime extension is missing or unwilling still fights, in silence.
	begin
		select p.username, p.avatar_character_id, p.avatar_color
			into v_name, v_avatar_character, v_avatar_color
			from public.player_profiles p where p.user_id = v_uid;

		perform realtime.send(
			jsonb_build_object(
				-- The record this announcement is of, so one fight heard twice reads as one.
				'id', v_result_id,
				'at', v_fought_at,
				'outcome', p_outcome,
				-- What it paid, and what it was paid on.
				'exp', v_award,
				'survivors', v_standing,
				'fielded', v_owned,
				'rivals', v_felled,
				-- The town, and what the fight did to it. A stale fight took nothing and says
				-- so, rather than passing for a fight against the team sitting there now.
				'town', v_location,
				'captured', v_captured,
				'stale', v_stale,
				'player', jsonb_build_object(
					'id', v_uid,
					'name', v_name,
					'character_id', v_avatar_character,
					'color', v_avatar_color,
					-- The level they are on *after* this fight, which is the level the fight
					-- left them at — read off the same stored experience everything else is.
					'level', public.level_for_exp(coalesce(v_total, v_exp))
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
$$;

grant execute on function public.award_combat_exp(text, jsonb, int) to authenticated;

-- The last few fights, for somebody who has only just started listening.
--
-- A broadcast is heard by whoever is on the channel at the moment it is made and by
-- nobody else, so an arena opened at five past the hour knows nothing of five o'clock.
-- This is the tail that fixes it: the newest {@link COMBAT_FEED_HISTORY} fights across the
-- whole game, read once as the channel is subscribed to, in **exactly the shape the
-- broadcast sends** — so a client has one thing to parse and one list to keep, and a fight
-- that arrives both ways (heard live, then read back on a re-subscribe) is recognised as
-- the same fight by the record id both carry.
--
-- Ten is the cap and not a suggestion: p_limit may only lower it. A feed is what is
-- happening, and a page of a hundred old fights is a log.
--
-- security definer, because combat_results is RLS-scoped to its owner and this is
-- deliberately everybody's: it publishes exactly what the channel already publishes to
-- anyone holding the anon key — a chosen name, the avatar worn, a level, and what a fight
-- did to a town. Rows from before a fight recorded its town are skipped rather than
-- announced from nowhere.
--
-- The level is the player's level *now* rather than the one the fight left them on. A
-- level frozen into a row goes stale the moment its owner gains one, and everywhere else
-- in this game a player is drawn as they currently stand (municipality_holders_public
-- reads their experience live for the same reason).
create or replace function public.recent_combat_feed(p_limit int default 10)
returns setof jsonb
language sql stable security definer set search_path = public as $$
	select jsonb_build_object(
		'id', r.id,
		'at', r.fought_at,
		'outcome', r.outcome,
		'exp', r.exp_awarded,
		'survivors', r.survivors,
		'fielded', r.fielded,
		'rivals', r.rivals_defeated,
		'town', r.location_id,
		'captured', r.captured,
		'stale', r.stale,
		'player', jsonb_build_object(
			'id', r.user_id,
			'name', p.username,
			'character_id', p.avatar_character_id,
			'color', p.avatar_color,
			'level', public.level_for_exp(coalesce(p.exp, 0))
		)
	)
	from public.combat_results r
	left join public.player_profiles p on p.user_id = r.user_id
	where r.location_id is not null
	order by r.fought_at desc
	limit least(greatest(coalesce(p_limit, 10), 1), 10);
$$;

grant execute on function public.recent_combat_feed(int) to anon, authenticated;
