<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import CombatFlanks from '$components/core/CombatFlanks.svelte';
	import CombatGround from '$components/core/CombatGround.svelte';
	import CombatHost from '$components/core/CombatHost.svelte';
	import IdleSprite from '$components/core/IdleSprite.svelte';
	import MugenBoard, { loadBoardEngine } from '$components/core/MugenBoard.svelte';
	import TownChallenge from '$components/core/TownChallenge.svelte';
	import TownPlate, { PLATE_FLUSH_CLASSES } from '$components/core/TownPlate.svelte';
	import { SPAWN_BORDER_CLASSES, SPAWN_FILL_CLASSES } from '$components/core/spawn-colors';
	import { combatColorHex } from '$utils/color/combat-color';
	import { ORDER_ICONS } from '$utils/color/traits';
	// Types only, so nothing here reaches the renderer at load time: the arena letters a
	// fight and the board draws one, and the board arrives when the fight does (see
	// `loadBoardEngine`). The two value imports that used to be here — a colour table and a
	// one-line reading of a cell's row, both since moved somewhere pixel-free — were enough
	// on their own to put the whole engine in the map's initial bundle.
	import type {
		BoardCharacter,
		BoardGrid,
		BoardOrder,
		MugenBoard as MugenBoardEngine
	} from '$utils/mugen/mugen-board';
	import { cellScreenY, type Cell } from '$utils/mugen/grid';
	import { standingLine, type StandingFighter } from '$utils/mugen/board-standing';
	import { loadDefinition, loadManifest } from '$utils/mugen/character-assets';
	import {
		boardFitsLineup,
		CombatController,
		COMBAT_ACTIONS,
		PLAYER_CELLS,
		RIVAL_CELLS,
		type CombatAction,
		type CombatState,
		type FighterView,
		type FighterSeed,
		type LineupFighter
	} from '$services/combat.controller';
	import type {
		CombatOutcome,
		CombatReport,
		CombatReward,
		TerritoryResult
	} from '$types/combat.type';
	import type { BattleBoardSnapshot } from '$types/battle.type';
	import type { TownPlateCard } from '$types/map.type';
	import { battleService } from '$services/battle.service';
	import {
		COMPOUND_COLORS,
		DEFAULT_COLOR,
		type CharacterMove,
		type CombatColor
	} from '$types/character-definition.type';
	import { characters as availableCharacters } from '@3xl/data';
	import { authService } from '$services/auth.service';
	import { openSignIn } from '$services/signInModal';
	import { rosterModalOpen } from '$services/rosterModal';
	import { spawnService } from '$services/spawn.service';
	import { teamService, TEAM_SIZE } from '$services/team.service';
	import { AuthStatus } from '$types/profile.type';
	import { SpawnColor, type CharacterSpawn } from '$types/character-spawn.type';

	// The opponent's team when this is a challenge: synthetic OG spawns (see
	// `ogTeamSpawns`). When a full team (TEAM_SIZE) is supplied the red (CPU) side
	// fields it; otherwise the CPU mirrors the player's own team (the classic match).
	export let ogTeam: CharacterSpawn[] = [];
	// The challenged town's geojson feature id. Which town a fight is over is the
	// server's record, not this prop — it is held on the player's open battle and read
	// back from there when the result is reported — so this is only ever used to key
	// and label the fight on screen.
	export let ogLocationId: string | null = null;
	// The town the fight is over, drawn on the very plate its pin carries on the map (see
	// TownPlate): the place, the show it flies, whoever is sitting on it and how far it has
	// been taken. Handed over already built, because what a town is called and whose it is
	// are the map's readings and not this arena's — it is the same card the player pressed to
	// get here, standing over the board while the board answers it.
	//
	// Without the challenge button, and that is the caller's doing too: the button starts a
	// fight, and a fight is what this is. Null draws no card at all, which is what a match
	// with no town behind it gets.
	export let location: TownPlateCard | null = null;
	// True while a finished fight is on its way to the server. Exported so the sheet this
	// arena is drawn on can hold its own way out shut for that moment — reporting is what
	// ends the battle, so a player let out before it lands walks away from a fight the
	// server still has open, and the town it was over never gets redrawn. Written from in
	// here and only ever read out (`bind:reporting` on the host).
	export let reporting = false;

	// Nothing about the fight in progress is a prop: the open battle is read off the
	// service, so the board this arena picks up is always the last one written back —
	// not the one that happened to be loaded when it mounted. A line-up rebuilt
	// mid-fight therefore resumes where the fight actually is, rather than rewinding to
	// wherever the page last looked.
	const openBattle = battleService.open;

	// The board the open battle was left on, if any — the live one, rewritten by every
	// turn this arena closes.
	$: battleBoard = ($openBattle?.board ?? null) as BattleBoardSnapshot | null;

	// The board *this* fight was built from: `battleBoard` as it stood when the fight was
	// set up, and then held still for the rest of it. It is the one thing both halves of a
	// resumed fight read — the controller restores the state off it, and the grids stand
	// everyone on the ground it records — so what the player sees and what the fight
	// believes can never be two different fights.
	let placement: BattleBoardSnapshot | null = null;

	// The spawn ids that battle is being fought with, in **fielded order** — a fight is
	// fixed at what was put on the board, so a resumed one fields these rather than
	// whatever the roster's active team is now.
	//
	// Read once per battle, and deliberately not derived from the live board: the board
	// is written back every turn, and a line-up that followed it would be rebuilt by
	// the very save it caused — the board tearing itself down and back up, turn after
	// turn. What a battle is being fought with is settled when the battle arrives.
	let battleTeam: string[] = [];
	let battleTeamFor: string | null = null;
	$: syncBattleTeam($openBattle?.startedAt ?? null, $openBattle?.team ?? null, $openBattle?.board ?? null);

	function syncBattleTeam(
		startedAt: string | null,
		team: string[] | null,
		board: BattleBoardSnapshot | null
	): void {
		if (!startedAt) {
			battleTeam = [];
			battleTeamFor = null;
			return;
		}
		if (startedAt === battleTeamFor) return;
		battleTeamFor = startedAt;
		// The line-up the server holds for this battle — proved to be the player's own
		// when it was opened, and therefore the one whose report it will accept. Only a
		// battle opened before it was recorded falls back to reading the board it wrote.
		battleTeam = team?.length === TEAM_SIZE ? [...team] : fieldedTeam(board);
	}

	/**
	 * The player's line-up out of a saved board, back in team order.
	 *
	 * A fighter's slot is its **lane**, and the lanes run top→bottom down the board, which
	 * is the order the team is fielded in: the lead takes the top row and the rest of the
	 * party unfolds downwards from it. So slot order *is* team order and this only has to
	 * sort by it — but it does have to sort, because nothing promises a saved board's rows
	 * come back in the order they were written, and a line-up assembled in the wrong order
	 * would quietly put every fighter in somebody else's duel.
	 */
	function fieldedTeam(board: BattleBoardSnapshot | null): string[] {
		return (board?.fighters ?? [])
			.filter((fighter) => fighter.side === 'info')
			.sort((a, b) => a.slot - b.slot)
			.map((fighter) => fighter.spawnId);
	}

	// `territory` fires once the server has settled what a finished fight did to the
	// town, so the host (the map) can reload the occupancy it is drawing.
	const dispatch = createEventDispatcher<{ close: void; territory: TerritoryResult }>();
	function close(): void {
		dispatch('close');
	}

	// The glyph each order is given — the same three the cards wear in their corners (see
	// `traitIcons`), so a charge, a guard and a shot are one picture each wherever the game
	// speaks of them.
	const ACTION_ICONS: Record<CombatAction, string> = ORDER_ICONS;

	// The lanes of the fight, 1..n, for the score: one square per lane, filled once that
	// many have been taken. A lane is a fighter of each side and the white cell between
	// them, so there are as many of them as a team has members — the score is drawn from
	// the same count the team is built to, and cannot come to say a fight is longer or
	// shorter than it is.
	const LANES = Array.from({ length: TEAM_SIZE }, (_, index) => index + 1);

	// The rivals' half of the score is read the other way round, so its squares are laid
	// out backwards and its count fills from the right — see the score's own note. The
	// order is the whole of the difference between the two: same squares, same rule.
	const RIVAL_LANES = [...LANES].reverse();

	const characterById = new Map(availableCharacters.map((option) => [option.id, option]));

	// The blue side is the player's team; the red side (the CPU) either mirrors it or,
	// in a challenge, fields the supplied OG team. Both draw from the player's one
	// team — there is no in-board picker.
	const authStatus = authService.status;
	const profile = authService.profile;
	const teamMemberIds = teamService.slots;
	const spawns = spawnService.spawns;

	// The signed-in player, or null. Colours (and the team's characters) come from
	// this player's Supabase spawns, so playing requires being signed in.
	$: currentUserId = $authStatus === AuthStatus.SignedIn && $profile ? String($profile.id) : null;

	// The team that fights. A resumed battle fields the one it was started with — the
	// fight is fixed at what was put on the board, so re-picking the team mid-battle
	// cannot swap a fallen fighter for a fresh one — and any other fight fields the
	// team the player currently holds.
	$: teamMembers =
		battleTeam.length === TEAM_SIZE
			? battleTeam
			: $teamMemberIds.filter((id): id is string => Boolean(id));
	// Every slot has to be one of this player's own claimed spawns. The team is read
	// off those cards, so this can only fail while they are still arriving — or on a
	// battle resumed with a line-up that has been recycled since. A fight fielding
	// those is one the server would refuse the report of, after it had been played
	// out.
	$: ownSpawnIds = new Set(($spawns as CharacterSpawn[]).map((spawn) => spawn.id));
	$: teamReady =
		spawnsLoaded && teamMembers.length === TEAM_SIZE && teamMembers.every((id) => ownSpawnIds.has(id));
	$: playable = !!currentUserId && teamReady;
	// The player's spawns are still on their way: the team cannot be judged yet, so the
	// arena waits rather than announcing there is not one.
	$: spawnsPending = $authStatus === AuthStatus.SignedIn && !spawnsLoaded;

	// A full OG team means the red side fields it instead of mirroring the player's.
	$: challengeReady = ogTeam.length === TEAM_SIZE;

	// Load the player's spawns once signed in, so their rolled colours are available.
	// Nothing else is fetched: the board draws fighters and the orders they can be
	// given, and a fighter's rarity, show and claim place belonged to the trading card
	// that used to sit beside it.
	//
	// Cards already in the store count as loaded, and the read still runs behind them. The
	// map loads this same set the moment the player signs in, so the arena was opening on a
	// spinner while a round trip fetched a list it was already holding — and nothing about
	// the fight could start until it landed: not the line-up, not the controller, and above
	// all not the canvas, whose own boot is the long pole and was queued behind it. What
	// re-reading them is actually for is a claim made in another tab, which is worth
	// following and is not worth a blank screen.
	let loadedForUser: string | null = null;
	let spawnsLoaded = false;
	$: if (currentUserId && currentUserId !== loadedForUser) {
		loadedForUser = currentUserId;
		spawnsLoaded = spawnService.hasSpawns(currentUserId);
		void spawnService.loadSpawns(currentUserId).then(() => (spawnsLoaded = true));
	}

	// Every fieldable spawn by id: the player's own claimed spawns plus (in a
	// challenge) the synthetic OG spawns, so both sides' slots resolve here.
	$: spawnById = new Map(
		([...$spawns, ...ogTeam] as CharacterSpawn[]).map((spawn) => [spawn.id, spawn])
	);

	// Slots 0–2 are the red (CPU) grid, 3–5 the blue (player) grid. In a challenge the
	// red side fields the town's OG team; otherwise the CPU mirrors the player's team.
	$: slots = playable
		? challengeReady
			? [...ogTeam.map((spawn) => spawn.id), ...teamMembers]
			: [...teamMembers, ...teamMembers]
		: [];

	// Where each side opens. Both sides' ground belongs to the controller — it is what
	// decides who faces whom, and it is what walks the winner of a lane on or off the
	// white cell it was fought over — so the cells are taken from there rather than
	// restated here: the rivals on their own half, the player's team on column c, which is
	// the whole of theirs, level with them row for row and the white column standing empty
	// between the two.
	//
	// Both lines are filled the same way round: the party's lead on the top row, the rest
	// of it unfolding downwards in the order the team is held in. So slot one faces slot
	// one across the board, and reading either line down the screen reads that party in
	// its own order. The player's used to fill its column upwards, its lead nearest the
	// viewer, which put the two parties' leads in different lanes and made the player's
	// line the one you read bottom to top.

	// The two sides can field the SAME spawn line-up (a mirror match), so a bare spawn
	// id is not unique across the board. Every board actor / fighter is identified by a
	// per-side instance id (`error:<spawnId>`); the underlying spawn (for its assets,
	// definition and colour) is recovered via spawnById. Without this, id lookups
	// (board actors, the combat controller) collide between the two sides and combat
	// never starts.
	function instanceId(side: 'error' | 'info', spawnId: string): string {
		return `${side}:${spawnId}`;
	}

	function spawnIdOf(id: string): string {
		return id.slice(id.indexOf(':') + 1);
	}

	function characterIdOf(basePath: string): string {
		const segments = basePath.split('/').filter(Boolean);
		return segments[segments.length - 2] ?? segments[segments.length - 1] ?? '';
	}

	function boardCharacter(
		spawnId: string,
		side: 'error' | 'info',
		spawns: Map<string, CharacterSpawn>
	): BoardCharacter {
		const spawn = spawns.get(spawnId);
		const option = (spawn && characterById.get(spawn.characterId)) ?? availableCharacters[0];
		return {
			id: instanceId(side, spawnId),
			basePath: option.basePath,
			animation: 'idle'
		};
	}

	// Each side's cells take the colour of that side's leader — the team's first slot
	// (ids[0] on the left, ids[3] on the right). Falls back to the classic red/blue if
	// the leader has no rolled colour yet.
	function leaderColorHex(
		leaderId: string,
		spawns: Map<string, CharacterSpawn>,
		fallback: number
	): number {
		const color = spawns.get(leaderId)?.color;
		return color ? combatColorHex(color) : fallback;
	}

	// Left: the rival line on its own half; right: the player's
	// team on column c, which is the whole of its own — the white column between them starts
	// empty, being the ground the lanes are played for. Each side's first slot leads (it is the grid's own
	// character, the rest are extras) and stands on the topmost cell, so team order and
	// the board's top→bottom order are one and the same. Rebuilt whenever a slot or a
	// spawn changes. `spawns` is passed in explicitly so Svelte's legacy reactive
	// tracking sees the spawn map as a dependency of `grids`.
	//
	// Those cells are where a line *opens*, and a fight being picked up did not stop
	// there: `resumed` is the board the battle was left on, and it is what actually
	// stands the fighters up — each on the ground it holds, the fallen included, since
	// being beaten moves a fighter to the back of its own half rather than taking it off
	// the board. Without it a reloaded fight redraws itself as a fresh one — everybody
	// back on their opening cells — over a controller that knows better, and the picture
	// is a lie about the score.
	function buildGrids(
		ids: string[],
		spawns: Map<string, CharacterSpawn>,
		resumed: BattleBoardSnapshot | null
	): [BoardGrid, BoardGrid] {
		// Matched by the instance id, not by the spawn: the two sides can field the same
		// spawn (a mirror match), and each of them stands somewhere of its own. Whether a
		// fighter is still in the fight says nothing about where it is drawn, so it is not
		// passed on: every fighter the board records is stood back up on the cell it records.
		const held: StandingFighter[] = (resumed?.fighters ?? []).map((fighter) => ({
			id: instanceId(fighter.side, fighter.spawnId),
			cell: fighter.cell
		}));
		const half = (
			side: 'error' | 'info',
			offset: number,
			cells: Cell[],
			fallback: number
		): BoardGrid => {
			const characters = new Map(
				cells.map((cell, index) => {
					const character = boardCharacter(ids[offset + index], side, spawns);
					return [character.id as string, { character, opening: cell }];
				})
			);
			const placed = standingLine(
				[...characters].map(([id, entry]) => ({ id, opening: entry.opening })),
				held
			).map((entry) => ({ ...characters.get(entry.id)!.character, ...entry.cell }));
			return {
				color: leaderColorHex(ids[offset], spawns, fallback),
				character: placed[0],
				extras: placed.slice(1)
			};
		};
		return [
			half('error', 0, RIVAL_CELLS, 0xff0000),
			half('info', 3, PLAYER_CELLS, 0x2563eb)
		];
	}

	$: grids = buildGrids(slots, spawnById, placement);
	// Remounts the Pixi board (and thus repositions everyone) on any slot change or
	// spawn-colour change (so home cells and order buttons repaint once colours load).
	// A finished fight never restarts in place — the arena closes — so there is nothing
	// else to key on: the board a fight is resumed onto is settled once, with the fight
	// itself, and never moves under a running one (see `placement`).
	$: boardKey = `${slots.join(',')}:${slots
		.map((id) => spawnById.get(id)?.color ?? '')
		.join(',')}`;

	// One badge per character on the board, in board order (red half then blue).
	// Static display info (name, face, colour, moves); the live combat state (charges,
	// orders, who is down) lives in the CombatController store.
	interface Badge {
		id: string;
		basePath: string;
		side: 'error' | 'info';
		name: string;
		face: string | null;
		/** The moves this character's JSON definition declares, in declared order. */
		moves: CharacterMove[];
		/** The character's combat color — its Supabase spawn colour, and the whole of
		 * what it does differently in a fight. */
		color: CombatColor;
		/**
		 * Top→bottom screen position of the character's cell on the canvas (arbitrary
		 * units that increase downward; only the ordering matters). Used to lay the
		 * cards out left→right in the order the characters stand top-of-board first,
		 * matching the canvas card band.
		 */
		gridY: number;
	}

	// One side's whole line, in the order the controller is seeded in: sorted by where
	// that side's slots stand top→bottom on screen, which is the order the lanes are
	// numbered in and the order a saved board's slots mean.
	//
	// Read off the cells the line **opens** on, never off where anybody is standing now.
	// A fighter that has taken ground stands somewhere else and a fallen one stands
	// nowhere, so seeding from the live board would renumber the lanes of the very fight
	// being resumed — every fighter into somebody else's duel — and would refuse the
	// board outright once a side is short. The line-up is the whole six, the fallen
	// included: they are gone from the canvas, not from the fight.
	function rosterFor(
		ids: string[],
		side: 'error' | 'info',
		offset: number,
		cells: Cell[],
		spawns: Map<string, CharacterSpawn>
	): Pick<Badge, 'id' | 'basePath' | 'side' | 'gridY'>[] {
		return cells
			.map((cell, index) => {
				const character = boardCharacter(ids[offset + index], side, spawns);
				return {
					id: character.id as string,
					basePath: character.basePath,
					side,
					// Vertical on-screen position of the opening cell.
					gridY: cellScreenY(cell)
				};
			})
			.sort((a, b) => a.gridY - b.gridY);
	}

	let badges: Badge[] = [];
	let board: MugenBoardEngine | null = null;
	let controller: CombatController | null = null;
	let state: CombatState | null = null;
	let unsubscribe: (() => void) | null = null;

	function onBoardReady(engine: MugenBoardEngine): void {
		board = engine;
		engine.onOrder(giveOrder);
		controller?.attachBoard(engine);
	}

	/**
	 * A button beside a fighter was tapped. The board only reports which one; what an
	 * order means is the controller's, as it is for every other input.
	 *
	 * There are only three orders and each button is one of them. What a fighter's
	 * colour adds on top is never tapped for — it is passive, it comes off the back of
	 * whatever order *was* given, and the border round a button is where it is read.
	 */
	function giveOrder(fighterId: string, orderId: string): void {
		controller?.setAction(fighterId, orderId as CombatAction);
	}

	/**
	 * Which of the three orders a fighter's colour hands it free, marked by edging that
	 * order's own button in the fighter's colour — and only while the fight is on its
	 * opening turn, which is the only turn a gift is ever in hand for.
	 *
	 * A gift *is* one of these three orders, had for nothing, so the place to say a fighter
	 * has one is the button for that very order: a red fighter's Shoot is edged, an
	 * orange one's Shoot and Charge both are, and reading the column reads what the colour
	 * is worth without a second thing on the board to look at. And it says it where the
	 * choice is being made, which is what makes it worth knowing — the gift never comes on
	 * the order it is given, so an edged button is the one order that throws its own gift
	 * away.
	 *
	 * The borders come off with the turn. Whatever a colour granted has been taken or has
	 * lapsed by the end of turn one, so a mark left standing after it would be saying a
	 * fighter still holds something it cannot use again — the marks at a fighter's feet
	 * that this replaces kept a spent gift drawn for the rest of the fight, an account of
	 * the opening that stayed on the board long after the opening was over.
	 */
	function giftedOrders(fighter: FighterView, turn: number): Set<CombatAction> {
		return new Set(turn === 1 ? fighter.passives : []);
	}

	/**
	 * The column beside one of the player's fighters: the three orders it can be given. Every
	 * one of the three is always drawn — an order out of reach is greyed rather than dropped,
	 * so a fighter's column never changes shape under the cursor — and all of them lock while
	 * a turn is playing out. What its colour does for it of its own accord is not a fourth
	 * button: it is never tapped for, so it is not among the things that can be, and it is
	 * said as a border round the order it is a gift of ({@link giftedOrders}).
	 */
	function orderButtons(
		fighter: FighterView,
		phase: CombatState['phase'],
		turn: number
	): BoardOrder[] {
		const locked = phase !== 'planning';
		const gifts = giftedOrders(fighter, turn);
		return COMBAT_ACTIONS.map((action) => ({
			id: action,
			icon: ACTION_ICONS[action],
			selected: fighter.action === action,
			disabled: locked || (action === 'shoot' && !fighter.canShoot),
			color: fighter.color,
			gift: gifts.has(action)
		}));
	}

	/**
	 * The same three orders beside a rival — and they are the same three, because that is
	 * the whole of what the player is guessing at. The column is not an input: it is never
	 * tapped, and it says nothing about what the rival *can* do, only what it turned out to
	 * have done. So none of them is greyed for being out of reach, which would answer the
	 * question the fight is asking, and none is chosen while the rival's order is still
	 * secret — the controller withholds a rival's `action` right through planning and hands
	 * it over as the turn is carried out, so the button lights up at the moment the fighter
	 * acts and stays lit for the rest of the turn.
	 *
	 * It lights up in the fighter's own colour, as the player's own column does. And a rival
	 * wears its gifts the same way the player's own fighters do: what a rival's colour
	 * hands it is not a secret — it is a thing about the card and not a choice it has made —
	 * and it is what the player is planning the opening turn against.
	 */
	function rivalOrderButtons(fighter: FighterView, turn: number): BoardOrder[] {
		const gifts = giftedOrders(fighter, turn);
		return COMBAT_ACTIONS.map((action) => ({
			id: action,
			icon: ACTION_ICONS[action],
			selected: fighter.action === action,
			disabled: false,
			readonly: true,
			color: fighter.color,
			gift: gifts.has(action)
		}));
	}

	// Push every fighter's orders onto the board whenever the fight moves. Both `state` and
	// `board` are named so Svelte's legacy reactive tracking sees them as dependencies; the
	// board itself only redraws what actually changed.
	$: syncOrders(state, board);

	function syncOrders(current: CombatState | null, engine: MugenBoardEngine | null): void {
		if (!engine || !current) return;
		for (const fighter of current.fighters) {
			// Two fighters are asked for nothing more and keep no column at all: one standing on
			// the white cell it won, which has settled its lane, and one that has been taken
			// down, which is still on the board — at the back of its own half — and must not go
			// on wearing a column of orders it can never be given, or be shown one it can never
			// carry out. An empty list is what clears it.
			const spent = fighter.down || fighter.holdsGround;
			if (spent) {
				engine.setOrders(fighter.id, []);
				continue;
			}
			// Both sides wear a column; only the player's is a way of giving an order. The
			// rival's is the same three glyphs read back to the player.
			//
			// Where the two stand says which they are. The player's are given on the ground
			// the lanes are played for — the middle column, against the border with the
			// player's own half — because that is what they are for: a plan laid on the
			// contested ground, in the one place on the board both lines can be read from.
			// A rival's are a reading rather than an input, and a reading belongs on the
			// thing it is about, so they stand on the rival's own cell, at its left end.
			// Every one of them is on its own fighter's row either way, so a lane read
			// across is what its two fighters have been told to do.
			engine.setOrders(
				fighter.id,
				fighter.side === 'info'
					? orderButtons(fighter, current.phase, current.turn)
					: rivalOrderButtons(fighter, current.turn),
				fighter.side === 'info'
					? { cell: 'center', side: 'right' }
					: { cell: 'fighter', side: 'left' }
			);
		}
	}

	/**
	 * The player's own line, as rows of a list: who each fighter is, and the column of orders
	 * the board hangs beside it — the very same list, off the very same call, so the two are
	 * one set of buttons drawn twice and cannot come to disagree about what may be pressed.
	 *
	 * It is what the phone is given instead of aiming at the board (see the markup). Only the
	 * player's own fighters are in it: a rival's column is a reading rather than an input, and
	 * a reading belongs where the fighter it is about is standing.
	 *
	 * A fighter that is out of the turn — down, or holding the ground its lane was played for
	 * — is left with no orders at all, exactly as the board clears its column: it keeps its
	 * row, because it is still one of the player's three, and there is nothing left to ask of
	 * it. Every name is spelled out so Svelte's legacy reactive tracking sees `state` and
	 * `badges` both.
	 */
	$: orderRows = state ? playerRows(state, badges) : [];

	/** One of the player's fighters as the phone's panel needs it: who it is, the art it is
	 * drawn from, and the very orders the board is handed for it. */
	interface PlayerRow {
		fighter: FighterView;
		basePath: string | null;
		orders: BoardOrder[];
	}

	function playerRows(current: CombatState, roster: Badge[]): PlayerRow[] {
		const art = new Map(roster.map((badge) => [badge.id, badge.basePath]));
		return current.fighters
			.filter((fighter) => fighter.side === 'info')
			.map((fighter) => ({
				fighter,
				basePath: art.get(fighter.id) ?? null,
				orders:
					fighter.down || fighter.holdsGround
						? []
						: orderButtons(fighter, current.phase, current.turn)
			}));
	}

	// --- The phone's panel, which shows one of those fighters at a time ------------------

	/**
	 * Which of the player's three the phone's panel is turned to. An index into
	 * `orderRows` rather than an id: the list is the same three in the same order for the
	 * whole fight, and what the arrows do is move along it.
	 */
	let shownIndex = 0;
	/** The turn the panel was last turned to the front of, so it is done once a turn. */
	let openedTurn = 0;

	// Open each turn on the fighter it is going to be planned from. Every name is spelled
	// out so Svelte's legacy reactive tracking sees `state` and `orderRows` both — the rows
	// especially, since they are what is being pointed into and they settle in the same
	// flush the turn does.
	$: openPanel(state, orderRows);

	/**
	 * Turn the panel to the first fighter with an order still to give, which on a fresh turn
	 * is the leader: the rows are in the board's own top-to-bottom order and the lead fills
	 * the top row. Only on a change of turn — inside a turn the panel is where the player
	 * left it, and being carried back to the top mid-plan would undo the arrows.
	 */
	function openPanel(current: CombatState | null, rows: PlayerRow[]): void {
		if (!current || current.turn === openedTurn) return;
		openedTurn = current.turn;
		shownIndex = Math.max(
			0,
			rows.findIndex((row) => row.orders.length > 0)
		);
	}

	// The row on show, whatever the arrows have been doing: the index is taken modulo the
	// line, which is what makes the slider endless in both directions and also what keeps it
	// pointing at somebody if the line is ever shorter than it was.
	$: shownRow = orderRows.length > 0 ? orderRows[shownIndex % orderRows.length] : null;

	/** Turn the panel one fighter along, wrapping at either end — there is no first or last
	 * fighter here, only the next one round. */
	function stepFighter(delta: number): void {
		const count = orderRows.length;
		if (count === 0) return;
		shownIndex = (((shownIndex + delta) % count) + count) % count;
	}

	/**
	 * An order given on the phone's panel: the same order the board takes, and then the
	 * panel moves on by itself.
	 *
	 * On to the next fighter that has not been ordered yet, not simply the next along —
	 * planning a turn is answering for each of the three once, so the thing to be shown next
	 * is one of them that is still unanswered. Which also means the panel skips a fighter
	 * that is down or has taken its lane, having nothing to be asked; and that when the last
	 * one is answered there is nowhere to go, so it stays where it is and the turn plays
	 * itself out under a panel that has just gone quiet ({@link commitWhenReady}).
	 *
	 * The rows it is looking at are the ones from before this very order — the store has
	 * been written but Svelte has not re-run anything yet — which is exactly right: the
	 * fighter just ordered is the one being stepped off, and nothing about the others has
	 * moved.
	 */
	function giveOrderFromPanel(fighterId: string, orderId: string): void {
		giveOrder(fighterId, orderId);
		const count = orderRows.length;
		for (let step = 1; step <= count; step++) {
			const at = (shownIndex + step) % count;
			const row = orderRows[at];
			if (row.orders.length > 0 && !row.fighter.action) {
				shownIndex = at;
				return;
			}
		}
	}

	/**
	 * Whether the panel is closed to input: there is nothing to plan. Either the turn is
	 * being carried out, or every standing fighter has been ordered and it is about to be
	 * ({@link commitWhenReady}), or the fight is decided. It is not emptied or taken away —
	 * the fighter on show stays on show, faded, because a panel that vanished the moment
	 * the last order was given would take the plan off the screen at the moment it is being
	 * played out.
	 */
	$: panelLocked = !state || state.phase !== 'planning' || state.ready || !!state.outcome;

	/**
	 * Mark the fighter the panel is turned to on the board itself, by walking it on the spot
	 * on its own cell ({@link MugenBoardEngine.setPacing}).
	 *
	 * The panel and the board are two ways of reaching the same three orders, and the one
	 * thing the panel could not say was *which* of the fighters on the canvas it was
	 * speaking for. Now the canvas says it: whichever fighter is showing in the panel is the
	 * only one moving on a board that is otherwise standing still, so the answer is on the
	 * picture and not in a caption under it.
	 *
	 * It is off exactly when the panel is ({@link panelLocked}): the moment the last order is
	 * given the turn is taken out of the player's hands and played out, and a fighter still
	 * pacing through it would be saying it is waiting to be told something. The board goes
	 * still, the turn happens, and the pace comes back on the fighter the next turn opens on.
	 * A fighter with nothing left to be asked — down, or holding the ground its lane was
	 * played for — is never paced either: it keeps its row in the panel because it is still
	 * one of the player's three, and there is nothing to answer for it.
	 *
	 * Every name is spelled out so Svelte's legacy reactive tracking sees all three.
	 */
	$: syncPacing(board, shownRow, panelLocked);

	function syncPacing(
		engine: MugenBoardEngine | null,
		row: PlayerRow | null,
		locked: boolean
	): void {
		engine?.setPacing(!locked && row && row.orders.length > 0 ? row.fighter.id : null);
	}

	// What each of the three orders is called, for a button that is otherwise a picture. The
	// board never needs them — a glyph on a canvas has nobody to say itself to — so they are
	// the one part of an order that only the document asks for.
	$: ORDER_LABELS = {
		charge: $_('combat.orders.charge'),
		defend: $_('combat.orders.defend'),
		shoot: $_('combat.orders.shoot')
	} satisfies Record<CombatAction, string>;

	// The player's six colours as fills, for the one button that is drawn in the fighter's own
	// colour: the chosen order. Every other state is the dark tile below, which is what white
	// artwork needs under it (see the icon note in CLAUDE.md).
	function orderFill(order: BoardOrder): string {
		return order.selected ? SPAWN_FILL_CLASSES[order.color as SpawnColor] : 'bg-neutral';
	}

	// The line-up the controller will be seeded with, as identities alone: both sides in
	// seed order, which is the order a saved board's slots are numbered in. Built without
	// fetching anything, so whether a board is this fight's can be asked before the fight
	// is built — and it is, because the board's own placement rides on the answer.
	function lineupOf(ids: string[]): LineupFighter[] {
		return [
			...rosterFor(ids, 'error', 0, RIVAL_CELLS, spawnById),
			...rosterFor(ids, 'info', 3, PLAYER_CELLS, spawnById)
		].map((entry) => ({ side: entry.side, spawnId: spawnIdOf(entry.id) }));
	}

	// Bumped on every setup() call so a stale in-flight load can't clobber a
	// newer roster after the line-up changes mid-fetch.
	let setupToken = 0;

	// (Re)build the fight from the current slots: load each participant's manifest and
	// definition and hand a fresh CombatController the fighters. Runs whenever the
	// playable line-up changes.
	async function setup(): Promise<void> {
		const token = ++setupToken;
		const roster: Pick<Badge, 'id' | 'basePath' | 'side' | 'gridY'>[] = [
			...rosterFor(slots, 'error', 0, RIVAL_CELLS, spawnById),
			...rosterFor(slots, 'info', 3, PLAYER_CELLS, spawnById)
		];

		const loaded = await Promise.all(
			roster.map(async (entry) => {
				// `entry.id` is the per-side instance id (`error:<spawnId>`); recover the
				// spawn (its rolled colour) and the character id (which keys the
				// definition JSON) from it, falling back to the basePath-derived id.
				const spawn = spawnById.get(spawnIdOf(entry.id));
				const characterId = spawn?.characterId ?? characterIdOf(entry.basePath);
				// The same two documents the board is reading to draw these very fighters, and
				// the same request: both are memoised for the page (`character-assets`), so a
				// mirror match asks for one manifest and one definition per character rather
				// than one per side per surface. This used to be a bare pair of fetches beside
				// the board's own, racing them for the connections the frame PNGs needed.
				const [manifest, definition] = await Promise.all([
					loadManifest(entry.basePath),
					loadDefinition(characterId)
				]);
				// Combat colour comes from the spawn; only if a slot somehow has no spawn
				// colour do we fall back to the definition's compound colour (or DEFAULT_COLOR).
				const color: CombatColor =
					(spawn?.color as CombatColor) ??
					(COMPOUND_COLORS.includes(definition?.color!) ? definition!.color! : DEFAULT_COLOR);
				// Face: the portrait the definition picked in /admin/characters, else
				// the manifest's default. Both resolve to a file under the char's frames.
				const faceFile = definition?.face || manifest?.face?.file || null;
				return {
					...entry,
					name: manifest?.name ?? '',
					face: faceFile ? `${entry.basePath}/${faceFile}` : null,
					moves: definition?.moves ?? [],
					color
				};
			})
		);
		if (token !== setupToken) return;

		badges = loaded;

		// Hand the fighters to the combat controller and wire its store. Its colour is
		// the whole of what makes one fighter play differently from another — there is
		// nothing else to a card in a fight.
		const seeds: FighterSeed[] = badges.map((badge) => ({
			id: badge.id,
			// The spawn behind the instance id, so a won fight can be reported for
			// experience against the actual `character_spawns` rows fielded.
			spawnId: spawnIdOf(badge.id),
			name: badge.name,
			side: badge.side,
			color: badge.color,
			moves: badge.moves
		}));
		unsubscribe?.();
		// Read at the moment the controller is built, not captured earlier: whatever the
		// last closed turn wrote back is what this fight resumes from — and it is the same
		// board `placement` stood the fighters up on.
		controller = new CombatController(seeds, placement);
		savedTurn = 0;
		savingTurn = 0;
		saveFailure = null;
		unsubscribe = controller.subscribe((next) => (state = next));
		if (board) controller.attachBoard(board);
	}

	// The turn whose board the server has taken, so each is written back once.
	let savedTurn = 0;
	// The turn being written back right now, or 0 while nothing is in flight — both the
	// re-entry guard (the store emits several times a turn) and what the button reads.
	let savingTurn = 0;
	// Why the server would not take the last turn, or null. While it is set the fight
	// holds: the next turn cannot be committed on top of one that was never recorded.
	let saveFailure: string | null = null;

	// Write the board back as each turn closes — and once as the fight opens, so a
	// battle left before a single order is given still comes back to this board rather
	// than to a freshly rolled one. `state` and `controller` are both named so Svelte's
	// legacy reactive tracking sees them as dependencies.
	$: void saveBoard(state, controller);

	async function saveBoard(
		current: CombatState | null,
		ctrl: CombatController | null
	): Promise<void> {
		// Only between turns: mid-resolution the board is half-played, and a decided
		// fight is about to be reported, which deletes the battle outright.
		if (!current || !ctrl || current.phase !== 'planning' || current.outcome) return;
		if (current.turn === savedTurn || current.turn === savingTurn) return;
		await writeBoard(ctrl, current.turn);
	}

	/**
	 * Hand the board as this turn opens to the player's battle row, and only call the
	 * turn before it closed once the server has it.
	 *
	 * A turn is not over when it has been played out on screen — it is over when it has
	 * been recorded, because the fight lives in that row and not in this tab. So a write
	 * that fails is not shrugged off: the fight holds where it is, says so, and offers
	 * the write again. Playing on over a refused save would build turns on top of a
	 * board the server never took, and every one of them would be gone on the next
	 * reload — which is exactly the thing being prevented.
	 *
	 * The row is never created here and never duplicated: `save_battle` updates the one
	 * row the player has open (its primary key is the player), so a fight has exactly one
	 * record of itself from the moment it is opened to the moment it is reported.
	 */
	async function writeBoard(ctrl: CombatController, turn: number): Promise<void> {
		savingTurn = turn;
		saveFailure = null;
		try {
			await battleService.save(ctrl.snapshot());
			savedTurn = turn;
		} catch (error) {
			// The whole refusal to the console — Postgres' code, detail and hint — and its
			// sentence to the player, as with a refused report.
			console.error('Battle save refused', error);
			saveFailure = refusal(error, $_('combat.saveRefused'));
		} finally {
			savingTurn = 0;
		}
	}

	// Close the turn the moment there is nothing left to decide about it. A turn used to
	// be closed by a button, and that button was only ever tappable on this exact
	// condition — every standing fighter ordered, this turn's board already recorded, and
	// nothing refused — so the condition is the whole of what a commit was: pressing it
	// was a formality over a decision the orders had already made. Ordering the last
	// fighter is therefore what plays the turn out.
	//
	// The board is still written before the turn moves, not after it: `saveBoard` runs
	// first (it is declared above) and holds `savingTurn` while the write is in flight,
	// so the fight cannot play on over a turn the server has not taken — the same hold
	// the button sat under. Every name here is spelled out so Svelte's legacy reactive
	// tracking sees all four as dependencies, `savingTurn` included: it is what re-runs
	// this once a save lands.
	$: commitWhenReady(state, controller, savingTurn, saveFailure);

	function commitWhenReady(
		current: CombatState | null,
		ctrl: CombatController | null,
		saving: number,
		failure: string | null
	): void {
		if (!current || !ctrl || !current.ready || saving !== 0 || failure) return;
		ctrl.commit();
	}

	/** Write the same turn back again, after a refusal. */
	function retrySave(): void {
		if (!controller || !state || savingTurn) return;
		void writeBoard(controller, state.turn);
	}

	// The controller whose result has already been reported, so the award fires
	// exactly once per game.
	let reportedFor: CombatController | null = null;

	// Report the fight the moment it is decided. Both `state` and `controller` are
	// named here so Svelte's legacy reactive tracking sees them as dependencies.
	$: void reportOutcome(state, controller);

	// The player's fighters back in the order the team was built — slots 3–5, i.e. the
	// roster's team order. The line-up the controller hands over is the board's top→bottom
	// order, which is the team's own order now that the lead fills the top row: this sorts
	// a list that should already be in step. It stays because a captured town freezes the
	// reported line-up verbatim as its garrison and the map's panel draws the town's team
	// from it — the one place the order outlives the fight is not the place to be relying
	// on two orders happening to agree.
	function inTeamOrder(fighters: CombatReport['fighters']): CombatReport['fighters'] {
		const fielded = slots.slice(TEAM_SIZE);
		if (fielded.length === 0) return fighters;
		const rank = new Map(fielded.map((spawnId, index) => [spawnId, index]));
		return [...fighters].sort(
			(a, b) => (rank.get(a.spawnId) ?? fielded.length) - (rank.get(b.spawnId) ?? fielded.length)
		);
	}

	// A decided fight is over: report it, and then stand still. The arena does not walk
	// itself out — the board stays up with the result read out under it, and it is left
	// when the player says so (see `reward` and the Close button).
	async function reportOutcome(
		current: CombatState | null,
		ctrl: CombatController | null
	): Promise<void> {
		if (!current?.outcome || !ctrl || reportedFor === ctrl) return;
		reportedFor = ctrl;
		await sendReport(ctrl);
	}

	// Why the server refused the last report, or null while none has been refused. The
	// arena stays open on it and says so.
	let reportFailure: string | null = null;
	// What the server paid for the finished fight, once it has taken the report: the
	// experience it awarded and the team it counted to arrive at it. Null until then —
	// which is what the results block reads to know whether the number is in yet.
	//
	// It is the *server's* account of the fight, not this tab's, which is the only one
	// worth showing: the amount is decided from the player's stored experience by the
	// same RPC that banks it, so a figure worked out here would be a guess at what was
	// actually paid.
	let reward: CombatReward | null = null;

	/**
	 * Hand the finished fight to the server, and stay where we are once it has been taken.
	 *
	 * A refusal is not a shrug. Reporting is what *ends* the battle — the row is deleted
	 * inside the same RPC that pays the award — so a report the server turns down leaves
	 * the player in this fight, and closing on it would put them straight back into the
	 * very same board, to win it again and be refused again, with nothing on screen ever
	 * saying why. So the arena holds, shows what the server said, and offers the report
	 * again.
	 *
	 * A report the server *takes* does not close the arena either. The fight is over and
	 * there is something to say about it — how it went and what it earned — so the board
	 * stays up with the result under it and the player leaves when they have read it. An
	 * arena that walked itself out the moment the last fighter fell was throwing that
	 * away: the one screen that could say what the fight was worth appeared for no time
	 * at all.
	 */
	async function sendReport(ctrl: CombatController): Promise<void> {
		const report = ctrl.report();
		if (!report) {
			close();
			return;
		}
		reporting = true;
		reportFailure = null;
		try {
			// The amount, which town this was, and whether it changed hands are all the
			// server's to decide — read off the open battle it has been holding since
			// the fight started. This only states how the fight went.
			const paid: CombatReward | null = await authService.reportCombat({
				...report,
				fighters: inTeamOrder(report.fighters)
			});
			// Reporting is what ends the battle server-side, so let go of it here too —
			// the map must stop offering the way back into a fight that is over.
			battleService.clear();
			// Let the host redraw the town: a capture rewrites its team and its
			// turnover, and even a banked win moves the progress it shows.
			if (paid?.territory) dispatch('territory', paid.territory);
			// What the fight earned, for the block under the board to read out.
			reward = paid;
		} catch (error) {
			// The battle is left alone: the server still has it open and the player is
			// still in it, which is exactly what the message has to be read against. The
			// box below carries the sentence; the console carries the whole refusal —
			// Postgres' code, detail and hint — which is what a bug report is made of.
			console.error('Combat report refused', error);
			reportFailure = refusal(error);
			return;
		} finally {
			reporting = false;
		}
	}

	/** Hand the same finished fight over again, after a refusal. */
	function retryReport(): void {
		if (!controller || reporting) return;
		void sendReport(controller);
	}

	// How a finished fight is headed, and in whose colour. The three outcomes are the
	// player's — a fight is always read from their side — so a win is the info colour the
	// player's own line holds the board in and a loss is the rivals' error colour, the
	// same two the score above the board is counted in.
	// Reactive because it is wording: the line the fight ends on has to follow the language
	// like any other, and a `const` map would have been read once at module scope.
	$: OUTCOME_LABELS = {
		win: $_('combat.won'),
		lose: $_('combat.lost'),
		draw: $_('combat.draw')
	} satisfies Record<CombatOutcome, string>;
	const OUTCOME_CLASSES: Record<CombatOutcome, string> = {
		win: 'text-info',
		lose: 'text-error',
		draw: 'opacity-70'
	};

	// What the server said, as it said it. Supabase hands back a plain object rather
	// than an Error, so both shapes are read before falling back to a line of our own.
	function refusal(error: unknown, fallback = $_('combat.reportRefused')): string {
		const message =
			error instanceof Error
				? error.message
				: String((error as { message?: unknown } | null)?.message ?? '');
		return message.trim() || fallback;
	}

	onMount(() => {
		// The engine, as the sheet goes up, rather than once there is a board to mount on it.
		// Everything above this — the session, the player's cards, the line-up — has to
		// settle before the board's own component exists, and the chunk it would then ask
		// for owes nothing to any of it, so it is asked for alongside them instead of behind
		// them. Nothing here waits on it; the board itself does, and finds it in hand.
		void loadBoardEngine();
		authService.init();
	});

	onDestroy(() => unsubscribe?.());

	// (Re)build the fight whenever the playable line-up or its colours change. The key
	// folds in each slot's character id and its resolved spawn colour, so the
	// controller is rebuilt only on a real change — not on every unrelated tick.
	$: fightKey =
		playable && spawnsLoaded
			? `${slots.join(',')}|${slots.map((id) => spawnById.get(id)?.color ?? '').join(',')}`
			: '';
	let lastFightKey = '';
	$: if (fightKey && fightKey !== lastFightKey) {
		lastFightKey = fightKey;
		// The board this fight is picked up from, taken once — here, where the fight is
		// built — and not followed afterwards. Every closed turn writes a new board to the
		// open battle, so a placement that tracked `battleBoard` would restand the
		// line-up in the middle of the fight that just moved it. What a fight resumes
		// from is settled when the fight is built, and the controller is handed the very
		// same board (see `setup`).
		//
		// A board this line-up cannot take is dropped here rather than half-used: the
		// fight would refuse it anyway and start fresh, and drawing a line-up on it
		// meanwhile would leave the canvas showing a fight nobody is playing.
		placement = boardFitsLineup(battleBoard, lineupOf(slots)) ? battleBoard : null;
		void setup();
	}

</script>

<!-- The arena is the sheet: it takes the whole of it and centres one thing in it. That one
     thing is the board while there is a fight to draw, and a card saying why there is not
     otherwise — those carry their own margin, since a card wants to stand off the edge of a
     screen and a board does not. A fight is the one of those with two things to place, so it
     brings its own box and lays itself out inside it (below). -->
<div class="flex h-full w-full items-center justify-center">
	{#if !authService.configured}
		<div class="alert alert-warning m-6 max-w-md text-sm">
			<span>{$_('combat.notConfigured')}</span>
		</div>
	{:else if $authStatus === AuthStatus.Loading || spawnsPending}
		<span class="loading loading-spinner loading-md"></span>
	{:else if $authStatus !== AuthStatus.SignedIn}
		<div class="card m-6 max-w-md bg-base-100 shadow-xl">
			<div class="card-body gap-4">
				<h2 class="card-title">{$_('combat.signInTitle')}</h2>
				<p class="text-sm opacity-70">{$_('combat.signInBody')}</p>
				<!-- The way in is a box over the map, and this arena is a sheet over the map,
				     so the prompt puts the sheet away rather than raising a door behind it. -->
				<button
					class="btn btn-primary btn-sm w-fit"
					on:click={() => {
						close();
						openSignIn();
					}}
				>
					{$_('combat.signIn')}
				</button>
			</div>
		</div>
	{:else if !teamReady}
		<!-- Signed in, but there's no team ready to field. -->
		<div class="card m-6 max-w-md bg-base-100 shadow-xl">
			<div class="card-body gap-4">
				<h2 class="card-title">{$_('combat.noTeamTitle')}</h2>
				<p class="text-sm opacity-70">
					{$_('combat.noTeamBody', { values: { size: TEAM_SIZE } })}
				</p>
				<!-- The roster is a modal over the map, not a page, so this raises it right
					over the arena rather than navigating out of the fight. -->
				<button
					class="btn btn-primary btn-sm w-fit"
					on:click={() => rosterModalOpen.set(true)}
				>
					{$_('combat.openRoster')}
				</button>
			</div>
		</div>
	{:else}
		<!-- The fight: the head of it and the board it is played on, and the whole of the sheet
		     to put the two in (the modal is bare, so this box is the viewport). The head is
		     hung off *this* and never off the canvas — what the fight is over belongs at the top
		     of the screen, not at the top of a drawing floating in the middle of it.
		     How the two are arranged is the only thing that changes with the screen, and it
		     changes because the room does. On a wide one the board is drawn as large as the
		     viewport allows and there is nothing left over, so the head is lifted out of the
		     flow and laid on the board's top edge, the board keeping the whole box and the
		     middle of it (`sm:` and up: `absolute`, and this centring the canvas alone). On a
		     phone the board is limited by the width instead — a view far narrower than the
		     field is deep, which leaves a band of nothing above and below it — so the head is
		     left in the flow, and with it the orders, and the three of them are spread down the whole
		     height of the view: the head at the top, the fighters' rows at the foot under the
		     thumb that presses them, and the board in what is left between the two. Whatever
		     room the screen turns out to have goes into the two gaps rather than into a band
		     under everything, and each of the three keeps the end of the view it belongs to on
		     a tall phone and a short one alike. -->
		<div
			class="relative isolate flex h-full w-full flex-col items-center justify-between sm:justify-center"
		>
			<!-- The sky, which is the page's and not the canvas's: the board's top row and the
			     gaps in the fringe the field starts with are drawn on nothing at all, so what
			     shows through both is this. `sky-300` is the value the canvas held itself
			     (#7dd3fc) until the document needed the same blue over the board as in it — one
			     sky, painted once, rather than a colour kept in step across a canvas and a
			     stylesheet.
			     It is the **canvas's own column** and not the whole sheet: nine squares wide,
			     which is the canvas's own width (`CombatGround` has the figures), centred on the
			     same middle the canvas is. On a phone that is the whole width and there is no
			     difference; on anything wider the canvas is limited by the height and leaves a
			     band at each end, and those bands are not the fight — they are the sheet, with
			     the town still faintly through them. Sky out there would have made the arena a
			     blue screen with a board on it.
			     It is a **layer under everything in the sheet** (`-z-10`) and not merely the
			     first thing written in it. Being written first is not enough: the head of the
			     fight is a flex item carrying `order-first`, and a flex container paints its
			     items in the order `order` puts them rather than the order they are written in —
			     so on a phone, where the head is in the flow, it was painted before a strip
			     written above it and the sky swallowed the town and the score. Anything laid
			     across the whole sheet would meet that again; a layer of its own is the answer
			     that does not depend on what else is in here. `isolate` on the box above keeps
			     the negative inside it — without one it would sink past the sheet the arena is
			     drawn on. It takes no pointer either: it is a colour, not a surface. The head,
			     the board and the ground below the board all stand on it. -->
			<div
				class="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[calc(9*min(100vw/9,100dvh/11))] -translate-x-1/2 bg-sky-300"
				aria-hidden="true"
			></div>
			<!-- What is beside the board, on every screen the board does not fill the width of:
			     the picture's own rows carried out to the left and right edges of the view, the
			     board's own count of squares running on past its edges rather than its edge tile
			     stamped along a band. It is the same answer `CombatGround` gives below the board
			     on a phone, given on the other axis — whichever axis the canvas did not run out on
			     is the fight's ground rather than the page.
			     It is also why the sky above stays the board's own column and is not widened to
			     the sheet: out here the sky is a row of the picture like the grass under it, and
			     the flanks carry that row out themselves. Written after the sky and on the same
			     layer, so it stands on it. -->
			<CombatFlanks />
			<!-- The board, and nothing round it. No card, no body, no column, and no border: the
			     arena is one drawing and every box round a drawing is scale taken off it, since the
			     canvas is fitted to the room it is given. What used to stand under the board stands
			     on it now — the score at its head, the way out reached for on that same plate, and
			     whatever the fight has to say in the middle.
			     This box hugs the canvas rather than filling the sheet: it is a flex item and the
			     canvas is its only child in flow, so it is exactly the canvas on both axes, which
			     is what makes `inset-0` on the two overlays inside it mean the board's own edges
			     and not the viewport's. That is the whole of what belongs in here: a panel in the
			     middle of the fight is in the middle of the *board*, where the head of the fight
			     is at the top of the view and hangs off the sheet instead (below). -->
			<div class="relative">
				{#key boardKey}
					<!-- The whole board, on every screen, at the largest size that fits the view: the
					     canvas measures itself against the viewport on both axes and nothing here
					     has anything to add. It used to hand the canvas a `--board-bleed` below `sm:`
					     — a phone limited the board by its width, so half a column was pushed off
					     each edge to buy the rest a fifth more size, the two outermost columns being
					     ground no lane was played across. Those columns have come off the field
					     itself, so the saving is banked and there is nothing spare left to spend. -->
					<MugenBoard {grids} on:ready={(event) => onBoardReady(event.detail)} />
				{/key}
				{#if state?.outcome}
					<!-- The fight is over, and everything there is left to say about it is said
					     on one panel in the middle of the board it happened on. The board itself
					     stands exactly as it finished underneath — every fighter where the last
					     blow left it, the ground each side took still held — so the result is
					     read against the thing it is a result of rather than under it, where a
					     tall board pushed it off the bottom of the sheet.

					     Laid over the canvas rather than in the column with it, so it takes no
					     room and nothing below shifts when it arrives. The sheet takes no
					     pointer of its own — only the panel does — so it covers the board
					     without swallowing anything the board still answers. -->
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
						<div
							class="pointer-events-auto card w-full max-w-xs border border-base-300 bg-base-100/95 shadow-2xl"
						>
							<div class="card-body items-center gap-3 p-5">
								{#if reportFailure}
									<!-- Played out, and the server would not take it. The refusal is
									     given in the server's own words — the battle is still open, so
									     this is the fight the player is in, not one they have lost track
									     of — and the offer is to report it again, not to leave. -->
									<div class="alert alert-error text-sm" role="alert">
										<span>{reportFailure}</span>
									</div>
									<button
										type="button"
										class="btn btn-primary btn-block"
										disabled={reporting}
										on:click={retryReport}
									>
										{#if reporting}
											<span class="loading loading-spinner loading-xs"></span>
											{$_('combat.reporting')}
										{:else}
											{$_('combat.reportAgain')}
										{/if}
									</button>
								{:else}
									<!-- Nothing is dismissed for the player: the arena is left when they
									     say so. Reporting is what ends the battle server-side, so Close
									     waits on it — leaving first would walk out of a fight the server
									     still has open. -->
									<p class={classNames('text-lg font-bold', OUTCOME_CLASSES[state.outcome])}>
										{OUTCOME_LABELS[state.outcome]}
									</p>
									<dl class="flex w-full flex-col gap-1 text-sm">
										<!-- The fight is three duels and this is how they went: the same
										     count the board has been keeping all along, standing still now. -->
										<div class="flex items-baseline justify-between gap-4">
											<dt class="opacity-70">{$_('combat.encountersWon')}</dt>
											<dd class="font-mono font-bold tabular-nums">
												<span class="text-info">{state.wins.info}</span>
												<span class="opacity-40">–</span>
												<span class="text-error">{state.wins.error}</span>
											</dd>
										</div>
										{#if reward}
											<!-- Both figures are the server's own count of the team it paid
											     for, not this tab's: the award is a share of the level's span
											     decided from how much of the team came through, so the count
											     and the number it produced are read out together. -->
											<div class="flex items-baseline justify-between gap-4">
												<dt class="opacity-70">{$_('combat.survivors')}</dt>
												<dd class="font-mono font-bold tabular-nums">
													{reward.survivors} / {reward.fielded}
												</dd>
											</div>
											<div class="flex items-baseline justify-between gap-4">
												<dt class="opacity-70">{$_('combat.expGained')}</dt>
												<dd class="font-mono font-bold tabular-nums text-success">
													+{reward.awarded}
												</dd>
											</div>
										{/if}
									</dl>
									<button
										type="button"
										class="btn btn-primary btn-block"
										disabled={reporting}
										on:click={close}
									>
										{#if reporting}
											<span class="loading loading-spinner loading-xs"></span>
											{$_('combat.reporting')}
										{:else}
											{$_('common.close')}
										{/if}
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
				{#if state && !state.outcome && saveFailure}
					<!-- The turn was played out and the server would not take it. The fight holds
					     here rather than playing on over a turn nothing has recorded: everything
					     after it would be built on a board that was never written, and gone the
					     moment this page is reloaded.
					     On the board like the rest of it, and in the middle like the end of the
					     fight, which it cannot be up at the same time as: both are the fight stopped
					     on something the player has to answer, and the middle of the board is where
					     this arena puts a thing that is waiting on an answer. -->
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
						<div
							class="pointer-events-auto card w-full max-w-xs border border-base-300 bg-base-100/95 shadow-2xl"
						>
							<div class="card-body items-center gap-3 p-5">
								<div class="alert alert-warning text-sm" role="alert">
									<span>{saveFailure}</span>
								</div>
								<button
									type="button"
									class="btn btn-primary btn-block"
									disabled={savingTurn !== 0}
									on:click={retrySave}
								>
									{#if savingTurn}
										<span class="loading loading-spinner loading-xs"></span>
										{$_('combat.saving', { values: { turn: state.turn } })}
									{:else}
										{$_('combat.saveAgain', { values: { turn: state.turn } })}
									{/if}
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
			<!-- The player's line as a list, beside the board or under it — whichever way up the
			     screen is. It is the same panel either way, and it is the one thing the board
			     cannot draw for itself: the orders on the canvas are drawn at whatever scale the
			     board came out at, and they are the one part of the picture that has to be hit
			     rather than looked at.
			     Where it stands is the room the canvas did not take, which is the axis the canvas
			     did not run out on. **Standing up** — a phone — the board is limited by the width
			     and leaves a band under itself, so the panel is the flex item that grows into it,
			     the head at the top of the view and the orders at the foot under the thumb that
			     presses them. **Lying down** — anything wider than it is tall, a turned phone and
			     every desktop alike — the board is limited by its height and takes the whole of it,
			     and what is left is a band at each end: the panel takes the right-hand one, out of
			     the flow entirely (`absolute`, so the board is never sized against it) and the full
			     height of the view, exactly as wide as the gap between the canvas's right edge and
			     the screen's — `(100vw − the canvas's own nine squares) / 2`, the figures spelled
			     again in CSS as `CombatFlanks` and `CombatGround` spell them, since a class is a
			     literal.
			     It is not `sm:`-scoped any more, which is what used to stand in for this: on a wide
			     screen the panel was simply gone and the only orders were the canvas's own. The two
			     are both there now on every screen, which is what they were always meant to be —
			     one order given on either is drawn on both.
			     One fighter at a time, whichever way up: the character on
			     show, this fighter's three orders squared off at the foot of it, and an arrow at
			     either edge of the picture — so everything the panel can be pressed for is one
			     square of the same size, ruled by one grid of five columns whether it is drawn on
			     the row or over it. A phone is a screen with room for one thing, so it is given one
			     thing, at the size a thing that has to be hit wants to be — where laying all
			     three fighters out at once meant nine buttons over the width of a phone, each a
			     third of a third of it.
			     Nothing about the fight is decided here that is not decided there. The panel
			     carries the very list the board is handed (`orderRows`), presses the very handler
			     a tap on the canvas presses, and a fighter with nothing left to be asked shows
			     with no buttons under it exactly as its strip on the board is cleared. So the
			     board is still the fight; this is a second way of reaching the same three orders,
			     and both are live at once — an order given on either is drawn on both.
			     It is turned by both of its controls. The arrows step it one fighter along and
			     wrap at either end — there is no first or last here, only the next one round —
			     and giving an order turns it to the next fighter still waiting for one, because
			     planning a turn is answering for each of the three once and the panel's job is to
			     put the next unanswered one in front of the player. Answer the last and there is
			     nowhere to go: the turn commits itself and the panel closes to input, faded but
			     still showing the fighter it was left on, since the plan is the thing being
			     played out and taking it off the screen at that moment is exactly wrong.
			     Standing up it takes whatever the board leaves and not a fixed height of its own:
			     the canvas is `min(100vw, 100dvh × aspect)` and on a phone the width is what runs
			     out, so what is under the board is however much of the view a board that shape did
			     not need. The panel is the flex item that grows into it, the head and the board
			     being sized by what is in them, and the character is drawn at the full height of
			     what is left — so a tall phone gives the fighter a tall picture and a short one
			     gives it a short one, with nothing between the foot of the board and the foot of
			     the screen going spare. `min-h-0` so that on a view with nothing left over the
			     panel yields rather than pushing the board off the bottom. Lying down none of that
			     applies: the panel is out of the flow, and the height it is drawn at is the view's.
			     Which fighter it is turned to is said on the board as well as here — that fighter,
			     and no other, walks on the spot on its own cell while it is waiting to be told
			     something (see `syncPacing`). So the panel names one of the three and the picture
			     points at the same one, and neither has to describe the other.
			     The orders are then laid *over* the foot of that picture rather than under it,
			     which is what lets the picture have the whole band: the buttons are what has to
			     be reached, so they take the end of the screen the thumb is at, and the character
			     stands behind them. The arrows are over the picture too, at its own middle height.
			     On its own fill: it is the foot of the sheet, where the page is graded down to
			     nine tenths and the town is faintly through it, so the orders read off their own
			     ground rather than off whatever is under there.
			     Drawn whether there is a fighter in it yet or not: it is the foot of a column
			     spread end to end (above), so a block that arrived with the fight would have let
			     the board settle at the bottom of the view first and then jump up as the orders
			     came in. An empty one holds the place they are coming to. -->
			<div
				class="relative min-h-0 w-full flex-1 p-3 landscape:absolute landscape:inset-y-0 landscape:right-0 landscape:w-[calc((100vw_-_9*min(100vw/9,100dvh/11))/2)]"
			>
				<!-- What the band stands on: the board's own ground, carried on into the document
				     past the last row the canvas had room to draw. It is laid under the whole of
				     the panel, padding included, so the field runs out of the picture and into the
				     page rather than stopping at a plate's edge.
				     Under the panel standing below the board and nowhere else: the band beside the
				     board already has its ground, drawn by `CombatFlanks` across the whole sheet,
				     and earth laid over that would be a second floor on top of the grass. The box
				     is what carries the scope, since the ground itself has no say in where it is
				     drawn — it is absolute, so this one is too, and its `inset-0` is what the
				     ground's own then means. -->
				<div class="absolute inset-0 landscape:hidden" aria-hidden="true">
					<CombatGround />
				</div>
				{#if shownRow}
					{@const row = shownRow}
					<div
						class={classNames('relative h-full rounded-box bg-base-100/80 p-2 shadow-xl', {
							'pointer-events-none opacity-50': panelLocked
						})}
					>
						<!-- Who the panel is turned to, told the way the fight tells it: the character
						     standing there, idling, as they are on the board. No veil — the reveal is a
						     thing a card does when a player first meets it, and by here they are three
						     fighters in a battle already under way. -->
						<div class="h-full w-full">
							<IdleSprite basePath={row.basePath} label={row.fighter.name} veiled={false} />
						</div>
						<!-- This fighter's three orders, at the foot of the panel: the middle three of
						     five columns, the two end ones left standing empty. Columns of a grid rather
						     than a row of fixed sizes, so the whole of it fits the narrowest phone and
						     every square is the same square.
						     Five columns for three buttons because the width of an order is settled by the
						     row and not by what happens to be in it: the ends are held open (`col-start-2`
						     on the first order) so the three are one size on every panel, whatever is
						     drawn beside them and whether or not anything is. The arrows used to fill
						     those two columns and are over the panel now (below), so had the row been cut
						     to three, taking them off it would have made the orders half as wide again.
						     A plain button rather than a `btn` for the three: the glyphs are the canvas's
						     own white artwork, so what they need is a dark tile under them in *every*
						     state (see the icon note in CLAUDE.md), and daisyUI repaints a disabled
						     button's face. So the tile stays and the states are said over it — the chosen
						     order in the fighter's own colour, the rest dark, and one out of reach faded
						     rather than dropped, as the board's own column greys it. -->
						<div class="absolute inset-x-2 bottom-2 grid grid-cols-5 gap-2">
							{#each row.orders as order, index (order.id)}
								<!-- An order the fighter's colour hands it free is edged in that colour, exactly
								     as the board edges it: a border round the whole button, because what is
								     being said is about the whole of that order. On the one button *filled*
								     with that very colour — the order the fighter has been given — a white
								     seam is laid inside the border, which is the whole of what keeps the two
								     apart; it is an inset ring rather than a second border so it costs the
								     glyph no room and the three buttons stay one size whatever they wear.
								     It comes and goes with the board's own, both being drawn off the same
								     `gift` flag on the same list of orders, so it is only ever on the opening
								     turn — the turn a gift is in hand for. -->
								<button
									type="button"
									class={classNames(
										'relative flex aspect-square w-full items-center justify-center rounded-box border-2',
										index === 0 && 'col-start-2',
										orderFill(order),
										order.gift
											? SPAWN_BORDER_CLASSES[order.color as SpawnColor]
											: 'border-transparent',
										{
											'opacity-40': order.disabled,
											'ring-2 ring-white ring-inset': order.gift && order.selected
										}
									)}
									disabled={order.disabled}
									aria-label={ORDER_LABELS[order.id as CombatAction]}
									aria-pressed={order.selected}
									on:click={() => giveOrderFromPanel(row.fighter.id, order.id)}
								>
									<img src={order.icon} alt="" class="w-3/5" />
								</button>
							{/each}
						</div>
						<!-- The way back round the line and the way on round it, laid over the whole
						     panel rather than standing on the row of orders. They are not orders — they
						     are what the panel is turned by — so they are drawn off that row entirely,
						     against the fighter's own picture, one at either edge and along the top of
						     it, the far end of the panel from the orders.
						     Their own five columns over the same inset the orders are ruled by, with the
						     middle three empty: it is the same grid, so an arrow stands exactly over the
						     end column its row leaves open and the two layers are read as one row of five
						     wherever they cross. `items-start` rather than a height, so the pair sits on
						     the top edge of the panel whatever the panel came out at — the band under a
						     board on a phone, the full height of the view lying down — and the picture
						     runs on under it.
						     The layer takes no pointer itself and only the two buttons do, or its three
						     empty cells would be a sheet laid over the orders and the fighter under it. -->
						<div class="pointer-events-none absolute inset-2 grid grid-cols-5 items-start gap-2">
							<button
								type="button"
								class="pointer-events-auto col-start-1 flex aspect-square w-full items-center justify-center rounded-box border border-base-content/25"
								disabled={panelLocked}
								aria-label={$_('combat.previousFighter')}
								on:click={() => stepFighter(-1)}
							>
								<!-- An inline triangle: this one is drawn in the document rather than onto
								     the canvas, so it takes its colour from the text around it like every
								     other mark in a page. -->
								<svg viewBox="0 0 24 24" fill="currentColor" class="w-1/2" aria-hidden="true">
									<path d="M14 7l-5 5 5 5z" />
								</svg>
							</button>
							<button
								type="button"
								class="pointer-events-auto col-start-5 flex aspect-square w-full items-center justify-center rounded-box border border-base-content/25"
								disabled={panelLocked}
								aria-label={$_('combat.nextFighter')}
								on:click={() => stepFighter(1)}
							>
								<svg viewBox="0 0 24 24" fill="currentColor" class="w-1/2" aria-hidden="true">
									<path d="M10 7l5 5-5 5z" />
								</svg>
							</button>
						</div>
					</div>
				{/if}
			</div>
			<!-- The head of the fight: what it is over, and then how it stands. Both are read
			     before the board and in that order — the town is the reason there is a fight at all
			     and the score is what has become of it — so they are stacked at the top rather than
			     set beside each other, with the score's banner hanging under the card.
			     Hung off the sheet and not off the canvas, which is why it is not in the box above:
			     the board is centred in the viewport and is only as tall as it is, so a head taking
			     the canvas's own top edge floated somewhere down the middle of the screen with a
			     band of live map above it. The top of the fight is the top of the view.
			     From `sm:` up it is laid *on* the board's top edge — the board has the whole box and
			     is drawn as large as the viewport allows, so anything the head took would come off
			     the fight — and it is written after the board so that it stands over it: both are
			     positioned and neither carries a layer of its own, so it is the order they are
			     written in that decides. On a phone it stays in the flow instead, and `order-first`
			     is what puts it back at the head of the column it is written at the foot of. The
			     board follows it there rather than under it, out of the room a width-limited canvas
			     leaves standing empty.
			     Neither takes the pointer except where it has to (see the banner's plate): they are
			     readings laid over the board, and the board underneath is what is played.
			     The column is only as wide as the widest thing in it — the banner, in practice — and
			     everything in it is stretched to that, so the head is one block of chrome and not two
			     objects that happen to be stacked. Centred by the row it sits in rather than by
			     centring its own contents, which is what leaves the stretching to it. -->
			<div
				class="pointer-events-none order-first flex w-full justify-center sm:absolute sm:inset-x-0 sm:top-0 sm:w-auto"
			>
				<div class="flex flex-col">
					<!-- The two things the fight is about, side by side: the place on the left and
					     whoever is sitting on it on the right. They are of a kind — what is being
					     fought for, and who it is being fought with — so they are read across rather
					     than stacked, and the grid is what makes the two cells the same width whatever
					     either of them holds: a name of any length and a town of any length are laid
					     out by the head, not by each other.
					     One column where nobody holds the town, which is a town still on its seeded
					     house team: there is no player on the other side to name, and half a head of
					     empty plate would be saying there is one and we have lost them. -->
					<div class={classNames('grid items-stretch', location?.holder ? 'grid-cols-2' : 'grid-cols-1')}>
						<!-- The town, on the very plate its pin carries on the map: the same mark, drawn
						     the same way, showing what was pressed to get here. Only the challenge button
						     is missing, and the caller is what leaves it out — a fight already under way
						     has nothing left to start.
						     Flush: laid into a cell it takes the cell's width and squares its corners,
						     where a pin's plate settles its own width and rounds them.
						     Without its holder row, which is the one thing a pin's plate says that this
						     head now says better: the row is a face and a name squeezed under the place,
						     which is all a pin has room for, and the cell beside this is the whole
						     account. Said twice, side by side, the second saying reads as a second
						     player. The plate keeps the row everywhere else — this is the caller
						     leaving it out, exactly as it leaves out the challenge button. -->
						{#if location}
							<TownPlate {...location} holder={null} challenge={null} flush />
						{/if}
						<!-- Whose town it is — the account behind the line-up on the other side of the
						     board, said the way this game says a player wherever it says one: the face
						     they wear, the name they chose and the level they have reached. Written
						     second, so it takes the right-hand cell. -->
						{#if location?.holder}
							<CombatHost
								name={location.holder.name}
								characterId={location.holder.characterId}
								color={location.holder.color}
								level={location.holder.level}
							/>
						{/if}
						<!-- How far the town has been taken, on a cell of its own under the two: it is
						     about both of them at once — the wins this player has banked against the
						     side sitting there, and the bar the town's own turnover sets — so it is
						     read across the whole head rather than tucked into either column. It is
						     also the one thing here that is a picture of a quantity, and a bar is worth
						     the full width it is given.
						     Off the plate for that reason, which is why it brings the plate's own
						     surface with it: TownChallenge draws no ground of its own (it is normally
						     already standing on a pin's), so the flush plate is what it is laid on
						     here, butting into the two cells above as one block of chrome.
						     `col-span-2` only where there are two columns to span — in a one-column
						     grid it would open an implicit second one and pull the head off centre. -->
						{#if location?.challenge}
							<div
								class={classNames(PLATE_FLUSH_CLASSES, location.holder && 'col-span-2')}
							>
								<TownChallenge
									siege={location.challenge.siege}
									button={location.challenge.button}
									unlocksAt={location.challenge.unlocksAt}
									onUnlock={location.challenge.onUnlock}
								/>
							</div>
						{/if}
					</div>
					{#if state && !state.outcome}
					<!-- The score, at the head of the fight it is a score of, under the town being
					     fought over.
					     The fight is three duels, each played for one cell of the white column
					     down the middle of the board, so the score is drawn as that ground:
					     three squares a side, one per lane, filled white as that side takes it.
					     A number said how many; these say which of a known three, and they are
					     cells of a board rather than a length being filled, which is what the
					     thing being counted is. Each side's three sit over the half of the board
					     that side holds — the rivals' to the left, the player's to the right.
					     Between them, the turn, which is the other thing a fight is counted
					     in and belongs between the two counts rather than beside one of them.
					     Both counts grow outwards from that turn, so the rivals' three are laid
					     out backwards and fill from the right: it is the same count read either
					     way round, and the two then mirror each other across the middle rather
					     than both running left to right. Both are drawn white — the ground down
					     the middle they are played for is white, and a count of it says so at a
					     glance.
					     While the fight is running only: a decided one reads its score off the
					     panel in the middle of the board, and the same score at both ends of
					     one canvas would be one score too many. -->
					<div class="flex justify-center">
						<!-- On the same plate the map's breadcrumb bar stands on: the base colour at
						     four fifths so the board reads through it, white type and a shadow to lift
						     it off what it covers. The score and the path are the same kind of thing —
						     a line of state laid over a picture that fills the view — so they are drawn
						     as one thing and not two. Its corners are the one thing not carried over:
						     both ends are joined to a wing (below), and a rounded edge under a flush
						     one is a notch. It hugs its contents rather than running the width of the
						     canvas: a band across the top would be a bar of colour over the board,
						     where a plate is a label on it. -->
						<!-- The plate's two wings: a right triangle at either end, in the plate's own
						     colour, so what hangs off the top of the board is one shape — a banner —
						     rather than a box with two marks beside it. Each keeps its square corner
						     against the count nearest it and slopes away from there, the rivals'
						     square corner at the top right and the player's at the top left, so the
						     two lean outwards from the turn exactly as the counts do.
						     Drawn as a border rather than as a shape, which is what a triangle is in
						     CSS: a box with no size at all, one side of it coloured and the side it
						     leans on transparent, so the coloured side is cut off at 45°. Both legs
						     are the plate's own height, which is what makes the other two angles 45
						     apiece and butts the wing flush against the plate's full depth. -->
						<span
							class="h-0 w-0 border-t-[2rem] border-l-[2rem] border-t-base-100/80 border-l-transparent"
							aria-hidden="true"
						></span>
						<div
							class="group pointer-events-auto flex h-8 items-stretch gap-4 bg-base-100/80 text-white shadow-xl"
						>
							<!-- Each side's count is three cells in a row, laid out as cells of the
							     board because that is what is being counted: the plate is `h-8` and a
							     block is three of that across (`w-24`), over three equal columns, so
							     the plate's own depth sets the cell's width and the two figures are
							     read together — a taller plate wants a wider block.
							     Nothing is ruled between them. The cells were divided by a line down each
							     of their sides, and what the lines were dividing is three discs in a row
							     with a plate's own width of air around them — a thing already read as
							     three from across the room, since a count of three is what a disc apart
							     from another disc says. So the rules were drawing a grid over a figure
							     that did not need one, and the busiest mark on the banner was the one
							     carrying the least. The grid still sets the spacing; it simply is not
							     drawn any more.
							     A lane taken is a disc in its cell rather than the cell painted in: the
							     ground a lane is played for is one white cell of the middle column, and
							     a mark set in a cell reads as something standing on that ground where a
							     filled cell reads as the ground itself having changed. The disc is
							     always drawn and simply carries no colour until the lane is won, so the
							     three cells hold their spacing whatever the score is. -->
							<div
								class="grid h-full w-24 grid-cols-3 py-1"
								role="progressbar"
								aria-label={$_('combat.rivalWins')}
								aria-valuemin={0}
								aria-valuemax={TEAM_SIZE}
								aria-valuenow={state.wins.error}
							>
								{#each RIVAL_LANES as lane}
									<span class="flex items-center justify-center">
										<span
											class={classNames(
												'size-4 rounded-full',
												lane <= state.wins.error && 'bg-white'
											)}
										></span>
									</span>
								{/each}
							</div>
							<!-- The turn, and over it the way out of the fight — one slot in the middle
							     of the banner holding both, because they are the same place read at two
							     moments: what the fight is on now, and the one thing that can be done
							     about the fight as a whole.
							     The way out is the only one there is: a battle is ended by a result,
							     never by walking off, so giving it up reports the loss it is and closes
							     the arena exactly as being wiped out would. Between turns only — a turn
							     already being carried out settles itself.
							     Out of sight until the plate is under the pointer, because it is the one
							     control here that is not part of playing: a fight is played with the
							     buttons beside the fighters, and what stands over the board at all times
							     should be what is true of the fight. Reached for rather than offered.
							     It is laid over the slot rather than put beside the turn, and the slot is
							     as wide as the wider of the two whichever is showing: a control that took
							     room of its own pushed both counts outwards the moment the pointer
							     touched the banner, so the whole thing changed shape under the hand
							     reaching for it. The turn goes invisible as the button arrives — the
							     button is see-through, and the two of them stacked would be one line of
							     type over another.
							     Reaching for it is a thing a pointer does, so this is the pointer's copy
							     and it is scoped to `sm:` outright: below that the slot is the turn and
							     nothing else — a touch screen has no hover to hide a control behind, and
							     the emulated one a tap leaves behind would swap the turn for a button and
							     leave it swapped. The phone is given the same control as a row of its
							     own, at the foot of the orders (above), where it can be seen to be
							     there. -->
							<div class="relative flex w-28 items-center justify-center">
								<span
									class="font-mono text-lg font-bold tabular-nums opacity-70 sm:group-hover:invisible"
								>
									{$_('combat.turn', { values: { turn: state.turn } })}
								</span>
								<button
									type="button"
									class="btn absolute inset-0 hidden btn-ghost btn-sm text-error sm:group-hover:inline-flex"
									disabled={state.phase !== 'planning'}
									on:click={() => controller?.concede()}
								>
									{$_('combat.concede')}
								</button>
							</div>
							<div
								class="grid h-full w-24 grid-cols-3 py-1"
								role="progressbar"
								aria-label={$_('combat.yourWins')}
								aria-valuemin={0}
								aria-valuemax={TEAM_SIZE}
								aria-valuenow={state.wins.info}
							>
								{#each LANES as lane}
									<span class="flex items-center justify-center">
										<span
											class={classNames('size-4 rounded-full', lane <= state.wins.info && 'bg-white')}
										></span>
									</span>
								{/each}
							</div>
						</div>
						<span
							class="h-0 w-0 border-t-[2rem] border-r-[2rem] border-t-base-100/80 border-r-transparent"
							aria-hidden="true"
						></span>
					</div>
					<!-- Giving up, which on a phone is here and nowhere else. On the banner it is
					     reached for — hidden under the turn until the pointer is on the plate — and a
					     phone has no pointer to put there, so that control needs a place of its own on
					     a touch screen. It is the head's last row: the head is what is true of the
					     fight as a whole, which is exactly what giving it up is about, and it is the
					     one control on this screen that is not part of playing — so it stands at the
					     end of the view the thumb is *not* resting at, away from the orders, where it
					     cannot be taken for one of them.
					     The same button in every other respect — it reports the loss it is and closes
					     the arena exactly as being wiped out would, and it is offered between turns
					     only, a turn already being carried out settling itself. Off once the fight is
					     decided: there is nothing left to give up, and the result panel's Close is the
					     way out of a fight that is over.
					     Its own pointer: the head is a reading laid over the board and takes no taps,
					     and this is the one thing in it that is pressed. -->
					<button
						type="button"
						class="pointer-events-auto btn w-full border-0 bg-base-100/80 text-error shadow-xl sm:hidden"
						disabled={state.phase !== 'planning'}
						on:click={() => controller?.concede()}
					>
						{$_('combat.concede')}
					</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
