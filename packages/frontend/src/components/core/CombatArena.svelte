<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import CombatFeedButton from '$components/core/CombatFeedButton.svelte';
	import CombatFlanks from '$components/core/CombatFlanks.svelte';
	import CombatGround from '$components/core/CombatGround.svelte';
	import CombatHead from '$components/core/CombatHead.svelte';
	import CombatNarration from '$components/core/CombatNarration.svelte';
	import CombatPlayerBadge from '$components/core/CombatPlayerBadge.svelte';
	import MugenBoard, { loadBoardEngine } from '$components/core/MugenBoard.svelte';
	import CombatOrderGuide from '$components/core/CombatOrderGuide.svelte';
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
	import { openRoster } from '$services/roster';
	import { spawnService } from '$services/spawn.service';
	import { teamService, TEAM_SIZE } from '$services/team.service';
	import { AuthStatus } from '$types/profile.type';
	import type { CharacterSpawn } from '$types/character-spawn.type';

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
		controller?.attachBoard(engine);
		// The one thing on the canvas that is pressed rather than read, and now the only place
		// the three orders are drawn at all: the column standing in the lane of the fighter
		// being answered for. The board says which fighter and which order, and everything
		// after that — telling the controller, moving the panel on to the next fighter still
		// to answer — happens here.
		engine.onOrder = giveOrderFromPanel;
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
	 * One of the player's fighters' three orders, as the column standing in its lane draws
	 * them. Every one of the three is always drawn — an order out of reach is greyed rather
	 * than dropped, so the column never changes shape — and all of them lock while a turn is
	 * playing out. What its colour does for it of its own accord is not a fourth button: it is
	 * passive, so it is not among the things that can be given, and it is said as a border
	 * round the order it is a gift of ({@link giftedOrders}).
	 *
	 * There is one drawing of this list and it is the one that is pressed: the column out in
	 * the lane of the fighter being answered for ({@link giveOrderFromPanel}). Nothing stands
	 * beside a fighter any more — three buttons on every one of six fighters was the board
	 * saying six things at once where the fight only ever asks one, and the lane column is
	 * both the question and the answer to it.
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

	// Push the player's own fighters' orders onto the board whenever the fight moves. Both
	// `state` and `board` are named so Svelte's legacy reactive tracking sees them as
	// dependencies; the board itself only redraws what actually changed.
	$: syncOrders(state, board);

	function syncOrders(current: CombatState | null, engine: MugenBoardEngine | null): void {
		if (!engine || !current) return;
		// Only the player's own side, and only ever as the list the lane column is drawn from:
		// a rival is not asked anything, so it has no orders to hand the board. What a rival
		// turned out to have done is read where every other outcome of a turn is — in the
		// sentence said over it, and in what the figure does on the ground.
		for (const fighter of current.fighters) {
			if (fighter.side !== 'info') continue;
			// Two fighters are asked for nothing more and keep no column at all: one standing on
			// the white cell it won, which has settled its lane, and one that has been taken
			// down, which is still on the board — at the back of its own half — and must not be
			// shown orders it can never carry out. An empty list is what clears it.
			const spent = fighter.down || fighter.holdsGround;
			engine.setOrders(
				fighter.id,
				spent ? [] : orderButtons(fighter, current.phase, current.turn)
			);
		}
	}

	/**
	 * The player's own line, as rows of a list: who each fighter is, and the column of orders
	 * the board hangs beside it — the very same list, off the very same call, so the two are
	 * one set of orders drawn twice and cannot come to disagree about what may be pressed.
	 *
	 * The plate carries none of them any more: the orders are drawn on the board, a reading
	 * beside each fighter and, out in the lane of the one being answered for, a copy that is
	 * pressed ({@link giveOrderFromPanel}). What this is still read for is the panel's own
	 * business — which fighter it is turned to, which of them are still to answer, and
	 * therefore where it steps to next. Only the player's own fighters are in it: what a
	 * rival has done is read where that rival is standing, and there is nothing to ask of it.
	 *
	 * A fighter that is out of the turn — down, or holding the ground its lane was played for
	 * — is left with no orders at all, exactly as the board clears its column: it keeps its
	 * row, because it is still one of the player's three, and there is nothing left to ask of
	 * it. `state` is the whole of what it is read off, and is named here so Svelte's legacy
	 * reactive tracking sees it.
	 */
	$: orderRows = state ? playerRows(state) : [];

	/** One of the player's fighters as the phone's panel needs it: who it is, and the very
	 * orders the board is handed for it — which the panel no longer draws and reads only to
	 * know whether this fighter is still to answer. No art — the panel draws none. */
	interface PlayerRow {
		fighter: FighterView;
		orders: BoardOrder[];
	}

	function playerRows(current: CombatState): PlayerRow[] {
		return current.fighters
			.filter((fighter) => fighter.side === 'info')
			.map((fighter) => ({
				fighter,
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
	 * whole fight, and turning the panel is moving along it.
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
	 * the top row. Only on a change of turn — inside a turn the panel is wherever the orders
	 * given have carried it, and being pulled back to the top mid-plan would put it on a
	 * fighter that has already answered.
	 */
	function openPanel(current: CombatState | null, rows: PlayerRow[]): void {
		if (!current || current.turn === openedTurn) return;
		openedTurn = current.turn;
		shownIndex = Math.max(
			0,
			rows.findIndex((row) => row.orders.length > 0)
		);
	}

	// The row on show, wherever the turn has carried the panel: the index is taken modulo the
	// line, which keeps it pointing at somebody if the line is ever shorter than it was.
	$: shownRow = orderRows.length > 0 ? orderRows[shownIndex % orderRows.length] : null;

	/**
	 * An order given: the controller is told, the board's column reads it back beside the
	 * fighter, and then the panel moves on by itself. What an order *means* is the
	 * controller's, as it is for every other input; there are only three and each button is
	 * one of them, and what a fighter's colour adds on top is never pressed for — it is
	 * passive, it comes off the back of whatever order *was* given, and the border round a
	 * button is where it is read.
	 *
	 * **Both places an order can be pressed come through here** — the three buttons along the
	 * foot of this panel, and the same three standing out in the lane of the fighter being
	 * answered for on the canvas ({@link onBoardReady}). One function for the pair, because a
	 * press is the same act wherever it lands: the two are drawn off one list and answered by
	 * one path, so the panel steps along the line the same way whichever was pressed.
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
		controller?.setAction(fighterId, orderId as CombatAction);
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
	 * ({@link commitWhenReady}), or the fight is decided.
	 *
	 * It is closed and not changed: the card takes no pointer and the guide's ink comes off,
	 * and that is the whole of it — the plate is drawn exactly as it is between turns, at the
	 * same size in the same place, since it is also what the narration is read off and there
	 * is nothing on it that stops being true while a turn plays out.
	 */
	$: panelLocked = !state || state.phase !== 'planning' || state.ready || !!state.outcome;

	/**
	 * Mark the fighter the panel is turned to on the board itself
	 * ({@link MugenBoardEngine.setPacing}), which says it twice over: that fighter walks on
	 * the spot on its own cell, and its own three orders stand in the middle of its lane —
	 * on the ground between it and the rival across from it. One call for the pair, off one
	 * id, so the two marks are never on different fighters.
	 *
	 * The lane column is that fighter's own column drawn a second time, off the very list
	 * this component hands the board for it ({@link orderButtons}), so it wears the chosen
	 * order, the greyed one and the gift edging exactly as the column beside the fighter
	 * does — the board mirrors the list rather than being handed a second one, which is why
	 * nothing here has to push it.
	 *
	 * The panel and the board are two ways of reaching the same three orders, and the one
	 * thing the panel could not say was *which* of the fighters on the canvas it was
	 * speaking for. Now the canvas says it: whichever fighter is showing in the panel is the
	 * only one moving on a board that is otherwise standing still and the only one wearing a
	 * mark, so the answer is on the picture and not in a caption under it.
	 *
	 * Both are off exactly when the panel is ({@link panelLocked}): the moment the last order
	 * is given the turn is taken out of the player's hands and played out, and a fighter
	 * still pacing through it — or still standing over a column of orders — would be saying
	 * it is waiting to be told something. The board goes still, the turn happens, and the
	 * pace and the lane column come back together on the fighter the next turn opens on,
	 * which is also what keeps a column off the lane while the lane is being played out.
	 * A fighter with nothing left to be asked — down, or holding the ground its lane was
	 * played for — is never marked either: it keeps its row in the panel because it is still
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

	// What each of the three orders is called and what it does are the document's alone — a
	// glyph on a canvas has nobody to say itself to — and both are read where the orders are
	// now explained rather than pressed (see CombatOrderGuide). Nothing here words them.

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
		savedStamp = '';
		savingStamp = '';
		saveFailure = null;
		unsubscribe = controller.subscribe((next) => (state = next));
		if (board) controller.attachBoard(board);
	}

	/**
	 * Which board is on file, as `turn:stage`.
	 *
	 * A turn is written back **twice** — as it opens with nobody ordered, and again the
	 * moment its orders are complete, which is the turn itself and is what the animation
	 * is about to play out — so the turn number alone does not say which of the two the
	 * server is holding. The stage does.
	 */
	const boardStamp = (current: CombatState): string =>
		`${current.turn}:${current.ready ? 'ordered' : 'open'}`;

	// The board the server has taken, so each is written back once.
	let savedStamp = '';
	// The board being written back right now, or '' while nothing is in flight — the
	// re-entry guard (the store emits several times a turn), the one thing that keeps the
	// two writes of a turn from going out at once, and what the button reads.
	let savingStamp = '';
	// Why the server would not take the last turn, or null. While it is set the fight
	// holds: the next turn cannot be committed on top of one that was never recorded.
	let saveFailure: string | null = null;

	// Write the board back as each turn opens *and* as its orders close it, so a battle
	// left before a single order is given comes back to this board rather than to a
	// freshly rolled one, and a battle left the instant the orders were given comes back
	// with those orders on it. `savingStamp` is named alongside `state` and `controller`
	// so Svelte's legacy reactive tracking sees all three as dependencies: it is what
	// re-runs this when a write lands, which is when the second of a turn's two boards
	// gets its turn to go out.
	$: void saveBoard(state, controller, savingStamp);

	async function saveBoard(
		current: CombatState | null,
		ctrl: CombatController | null,
		inFlight: string
	): Promise<void> {
		// Only between turns: mid-resolution the board is half-played, and a decided
		// fight is about to be reported, which deletes the battle outright.
		if (!current || !ctrl || current.phase !== 'planning' || current.outcome) return;
		// One write at a time. The board that was skipped for this is not lost: landing
		// clears the stamp, which re-runs this with whatever the fight has moved on to.
		if (inFlight) return;
		// A refusal is answered by the player, not by this. Landing clears the stamp either
		// way, so a write that came back refused would otherwise be sent again on the spot,
		// and again, for as long as the server went on saying no.
		if (saveFailure) return;
		const stamp = boardStamp(current);
		if (stamp === savedStamp) return;
		await writeBoard(ctrl, stamp);
	}

	/**
	 * Hand the board to the player's battle row, and let the fight go on only once the
	 * server has it.
	 *
	 * A turn is not over when it has been played out on screen — it is over when it has
	 * been recorded, because the fight lives in that row and not in this tab. Which is
	 * why the turn is written the moment it is *decided* rather than when it has finished
	 * playing: the orders are the turn, everything after them is the same turn being
	 * shown, and the animation is the one part of it a reload has no business waiting on.
	 * So the write goes out first and the volley plays over it — a fight left, reloaded or
	 * picked up on another device mid-volley comes back to a turn with its orders on it,
	 * which plays itself out and hands the next one over, rather than to a turn whose
	 * orders were never given.
	 *
	 * A write that fails is not shrugged off: the fight holds where it is, says so, and
	 * offers the write again. Playing on over a refused save would build turns on top of a
	 * board the server never took, and every one of them would be gone on the next
	 * reload — which is exactly the thing being prevented.
	 *
	 * The row is never created here and never duplicated: `save_battle` updates the one
	 * row the player has open (its primary key is the player), so a fight has exactly one
	 * record of itself from the moment it is opened to the moment it is reported.
	 */
	async function writeBoard(ctrl: CombatController, stamp: string): Promise<void> {
		savingStamp = stamp;
		saveFailure = null;
		try {
			await battleService.save(ctrl.snapshot());
			savedStamp = stamp;
		} catch (error) {
			// The whole refusal to the console — Postgres' code, detail and hint — and its
			// sentence to the player, as with a refused report.
			console.error('Battle save refused', error);
			saveFailure = refusal(error, $_('combat.saveRefused'));
		} finally {
			savingStamp = '';
		}
	}

	// Close the turn the moment there is nothing left to decide about it. A turn used to
	// be closed by a button, and that button was only ever tappable on this exact
	// condition — every standing fighter ordered, this turn's board already recorded, and
	// nothing refused — so the condition is the whole of what a commit was: pressing it
	// was a formality over a decision the orders had already made. Ordering the last
	// fighter is therefore what plays the turn out.
	//
	// The ordered board goes out before the turn is played, never after it: `saveBoard`
	// runs first (it is declared above) and holds `savingStamp` while the write is in
	// flight, so the volley cannot start over a turn the server has not taken — the same
	// hold the button sat under. Every name here is spelled out so Svelte's legacy
	// reactive tracking sees all five as dependencies, `savingStamp` included: it is what
	// re-runs this once the save lands.
	//
	// And never before there is a board to play it on. A turn given here is given by a
	// player looking at the fight, so the board has long since been standing — but a turn
	// **resumed** is complete the moment the controller is built, which can be before the
	// canvas has said it is ready. Played then, the volley would run its full length with
	// every move going nowhere, and the fight would arrive at the next turn having shown
	// the player nothing of the one they came back to. So the engine is named here too,
	// and attaching it is what lets the resumed turn go.
	$: commitWhenReady(state, controller, board, savingStamp, saveFailure);

	function commitWhenReady(
		current: CombatState | null,
		ctrl: CombatController | null,
		engine: MugenBoardEngine | null,
		saving: string,
		failure: string | null
	): void {
		if (!current || !ctrl || !engine || !current.ready || saving || failure) return;
		ctrl.commit();
	}

	/** Write the same board back again, after a refusal. */
	function retrySave(): void {
		if (!controller || !state || savingStamp) return;
		void writeBoard(controller, boardStamp(state));
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

	// Whether the view is lying down, which is the one thing about the arena's layout that
	// cannot be said in CSS. Everything else that changes with the shape of the screen changes
	// in a class (`landscape:` on the board, the sky, the flanks and the panel), but *where the
	// head of the fight is mounted* is not a thing a media query decides: it is one block, and
	// the two places it stands — laid over the board standing up, at the top of the orders panel
	// lying down — are far enough apart that drawing both and hiding one would mean a second
	// town plate, a second avatar and a second flag alive on the screen for one fight.
	// Watched rather than read once, since a phone is turned and a window is dragged, and it
	// starts saying no: standing up is the arrangement that is right on a screen nothing has
	// been measured about yet, and the first measurement moves the head a tick later if it is
	// wrong.
	let lyingDown = false;

	onMount(() => {
		const orientation = window.matchMedia('(orientation: landscape)');
		const syncOrientation = () => (lyingDown = orientation.matches);
		syncOrientation();
		orientation.addEventListener('change', syncOrientation);
		// The engine, as the sheet goes up, rather than once there is a board to mount on it.
		// Everything above this — the session, the player's cards, the line-up — has to
		// settle before the board's own component exists, and the chunk it would then ask
		// for owes nothing to any of it, so it is asked for alongside them instead of behind
		// them. Nothing here waits on it; the board itself does, and finds it in hand.
		void loadBoardEngine();
		authService.init();
		return () => orientation.removeEventListener('change', syncOrientation);
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
				<!-- The roster is a page of its own now, so this walks out of the arena to it —
					and back here when it is left, the roster leaving for wherever it was opened
					from. Nothing is lost by going: the fight is the server's record and the
					staging outlives the page (see $services/combat), so what is come back to is
					this same fight with its town on it. -->
				<button class="btn btn-primary btn-sm w-fit" on:click={() => void openRoster()}>
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
		     field is deep, which leaves a band of nothing above and below it — so the board and
		     the panel under it are held to the **foot** of the view (`justify-end`) and the
		     whole of the room left over is the sky above the fight. The panel is as tall as what
		     it has to say and no taller (below), where it used to be the item that grew into
		     everything the board did not want: a plate stretched down a third of a phone to hold
		     three lines of text, with its own emptiness under them. Sky is the one thing here
		     that is worth nothing per pixel, so it is what takes the slack — the board keeps its
		     size either way, being fitted to the width, and the fight and the thing that answers
		     for it stay together under the thumb.
		     Which end of the width the board takes changes with the same thing. Standing up the
		     board is the whole width and there is no end to take. Lying down the width is what
		     is left over, and the whole of it goes to the orders in one piece rather than being
		     halved into a band at either end of a centred board — so the board is put against
		     the left edge of the view (`landscape:items-start`) and the panel takes everything
		     past its right one (below). The bands beside a centred board were the room the
		     orders wanted, and half of it was on the wrong side of them. -->
		<div
			class="relative isolate flex h-full w-full flex-col items-center justify-end sm:justify-center landscape:items-start"
		>
			<!-- The sky, which is the page's and not the canvas's: the board's top row and the
			     gaps in the fringe the field starts with are drawn on nothing at all, so what
			     shows through both is this. `sky-300` is the value the canvas held itself
			     (#7dd3fc) until the document needed the same blue over the board as in it — one
			     sky, painted once, rather than a colour kept in step across a canvas and a
			     stylesheet.
			     It is the **canvas's own column** and not the whole sheet: eight squares wide,
			     which is the canvas's own width (`CombatGround` has the figures), standing where
			     the canvas stands — centred with it standing up, and against the left edge with
			     it lying down (`landscape:left-0`, the centring translate taken back off). On a
			     phone that is the whole width and there is no difference; on anything wider the
			     canvas is limited by the height and leaves the rest of the width over, and that
			     is not the fight — it is the sheet, with the town still faintly through it. Sky
			     out there would have made the arena a blue screen with a board on it.
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
				class="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[calc(8*min(100vw/8,100dvh/11))] -translate-x-1/2 bg-sky-300 landscape:left-0 landscape:translate-x-0"
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
					<!-- The turn was given and the server would not take it. The fight holds here
					     rather than playing it out over a turn nothing has recorded: the volley and
					     everything after it would be built on a board that was never written, and
					     gone the moment this page is reloaded.
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
									disabled={savingStamp !== ''}
									on:click={retrySave}
								>
									{#if savingStamp}
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
			<!-- The head of the fight: what it is over, who it is with, and how it stands (see
			     CombatHead, which is the whole block). It is drawn here on a screen taller than
			     it is wide, and in the sidebar with the orders on one lying down — a real
			     conditional either way, because the two are not one box moved but one block put
			     in one of two places, and mounting both would put two of every plate and avatar
			     on the screen for one fight.
			     Standing up it is pinned to the top of the **sheet**, which is the top of the
			     view: what the fight is over and who it is with is read first and stays where a
			     reader's eye starts, whatever the board and the panel under it leave. It sat on
			     the canvas's own top edge until the board was held to the foot of the view — with
			     the slack going to the sky above it, that edge is a good way down the screen, and
			     a bar riding down there with it read as a caption on the picture rather than the
			     head of the page.
			     It is the board's **own column** and not the whole width, spelled exactly as the
			     sky behind it is (`CombatFlanks` and `CombatGround` spell the same figures): the
			     town at one end and whoever holds it at the other, with the standing on the seam
			     where the two meet, and the seam over the middle of the board it is about. On a
			     phone that column is the whole width and there is no difference.
			     Written after the board so that it stands on it — both are positioned and neither
			     carries a layer of its own, so it is the order they are written in that decides —
			     which matters on the one view where the two meet: a board tall enough to fill the
			     height leaves no sky, and the head is back on its top edge, over it as it was.
			     It takes no pointer: it is a reading, and the board under it is what is played. -->
			{#if !lyingDown}
				<div
					class="pointer-events-none absolute top-0 left-1/2 w-[calc(8*min(100vw/8,100dvh/11))] -translate-x-1/2"
				>
					<CombatHead {location} />
					<!-- And directly under it, whose side this is: the same three facts about the
					     player playing that the row above says about the player being played (see
					     CombatPlayerBadge, which is the whole block, the way out of the fight
					     included). It sat in the top corner of the panel at the foot of the view until
					     now, a third of a screen from the account it is the answer to — the two are
					     one reading, a fight being between two players, so they are one block of rows
					     at the top of the view and are read down.
					     **Half the width, in the middle of the bar**, on the head's own surface
					     (`bg-base-100/50`): the two are one block of chrome at the top of the view
					     rather than a bar with something loose under it, and the paint is the head's
					     value rather than a second one kept in step with it. Centred and not ranged to
					     an edge, because it is not about either end of the row above — the town is at
					     one end and its holder at the other, and the account answering for both stands
					     on the seam the two meet at.
					     It takes the pointer back off the block round it — the head is a reading and
					     this is pressed. -->
					<CombatPlayerBadge
						classes="pointer-events-auto mx-auto w-1/2 bg-base-100/50"
						canConcede={!!state && !state.outcome && state.phase === 'planning'}
						over={!!state?.outcome}
						on:concede={() => controller?.concede()}
					/>
				</div>
			{/if}
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
			     and what is left is width: the board is put against the left edge of the view and
			     the panel takes the whole of the rest, out of the flow entirely (`absolute`, so the
			     board is never sized against it) and the full height of the view. That is room
			     enough for more than the orders, so lying down this is the whole side of the fight
			     that is not the fight: a column of the head and then the orders, the head at the
			     size it reads at and the plate under it taking everything left. It is anchored to
			     the canvas's right edge and runs to the screen's — `left` is the canvas's own eight
			     squares and `right` is nothing, with no width of its own to keep the two in step,
			     the figures spelled again in CSS as `CombatFlanks` and `CombatGround` spell them,
			     since a class is a literal. It used to be half of that, `(100vw − eight squares) / 2`,
			     the board sitting in the middle with an identical empty band on its other side —
			     which is a screen's worth of room spent on nothing while the orders were squeezed
			     into what was left.
			     It is not `sm:`-scoped any more, which is what used to stand in for this: on a wide
			     screen the panel was simply gone and the only orders were the canvas's own. The two
			     are both there now on every screen, which is what they were always meant to be —
			     one order given on either is drawn on both.
			     One fighter at a time, whichever way up: this fighter's three orders squared off
			     at the foot of the plate, and nothing else — so everything the panel can be
			     pressed for is one square of the same size on one grid of five columns. A phone
			     is a screen with room for one thing, so it is given one thing, at the size a
			     thing that has to be hit wants to be — where laying all three fighters out at
			     once meant nine buttons over the width of a phone, each a third of a third of it.
			     The fighter itself is not drawn here. It stood on this plate, idling at the full
			     height of it, with the orders laid over its feet; the board is where the fight is
			     looked at, and a second copy of the same character standing still beside it was
			     one picture of them too many.
			     Nothing about the fight is decided here that is not decided there. The panel
			     carries the very list the board is handed (`orderRows`), presses the very handler
			     a tap on the canvas presses, and a fighter with nothing left to be asked shows
			     with no buttons under it exactly as its strip on the board is cleared. So the
			     board is still the fight; this is a second way of reaching the same three orders,
			     and both are live at once — an order given on either is drawn on both.
			     It is turned by the one thing that happens on it: giving an order turns it to the
			     next fighter still waiting for one, because planning a turn is answering for each
			     of the three once and the panel's job is to put the next unanswered one in front
			     of the player. Answer the last and there is nowhere to go: the turn commits
			     itself and the panel closes to input — drawn exactly as it was, since the plan is
			     the thing being played out and changing the plate at that moment is exactly wrong.
			     There is no way round the line by hand any more — a back arrow and a forward one
			     stood on a row of their own above the orders (see the markup, where what they
			     were and why they went is written out). The consequence is that an order given
			     stands for the turn it was given in.
			     Standing up it is **as tall as what is in it** and nothing more. The canvas is
			     `min(100vw, 100dvh × aspect)` and on a phone the width is what runs out, so a
			     board that shape leaves a good part of the view over — and this used to be the
			     flex item that grew into all of it, which meant a plate a third of a phone tall
			     carrying an account and three lines of text with its own emptiness under them.
			     The room goes to the sky above the board instead (`justify-end` on the sheet), so
			     what is spare is drawn as the thing it is rather than as an oversized plate, and
			     the fight and the panel that answers for it stay together at the end of the view
			     the thumb is at. `min-h-0` so that on a view with nothing to spare the panel
			     yields rather than pushing the board off the bottom. Lying down none of that
			     applies: the panel is out of the flow and the height it is drawn at is the view's,
			     which is what `landscape:flex-1` hands on to the card inside it.
			     Which fighter it is turned to is said on the board rather than here — that
			     fighter, and no other, walks on the spot on its own cell while it is waiting to be
			     told something, with its own three orders standing in its lane (see `syncPacing`). So the
			     panel is turned to one of the three and the board is what points at the same one,
			     which is the whole reason this plate need not name them again — and, now that
			     nothing here steps the line, the only thing that says which fighter the buttons
			     are about.
			     The orders are laid along the foot of the plate: they are what has to be reached,
			     so they take the end of the screen the thumb is at.
			     On its own fill: it is the foot of the sheet, where the page is graded down to
			     nine tenths and the town is faintly through it, so the orders read off their own
			     ground rather than off whatever is under there.
			     Drawn whether there is a fighter in it yet or not: it is the foot of a column
			     spread end to end (above), so a block that arrived with the fight would have let
			     the board settle at the bottom of the view first and then jump up as the orders
			     came in. An empty one holds the place they are coming to. -->
			<!-- Standing up it starts **on** the foot of the canvas: no padding along that edge
			     (`pt-0`), so the fighter's plate begins exactly where the picture stops. The
			     padding is what a plate wants against the edges of a screen, and the board is not
			     one of those — a strip of ground between the last row of the fight and the panel
			     read as the panel having come loose from it. Lying down the panel is beside the
			     board and its top edge is the top of the view, which is an edge of the screen and
			     takes the padding back (`landscape:pt-3`). -->
			<div
				class="relative flex min-h-0 w-full flex-col gap-3 p-3 pt-0 landscape:absolute landscape:inset-y-0 landscape:right-0 landscape:left-[calc(8*min(100vw/8,100dvh/11))] landscape:w-auto landscape:flex-1 landscape:pt-3"
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
				<!-- The head of the fight, lying down: the town, whoever holds it and how far it has
				     been taken, at the top of this column and across the whole of it. It is where
				     the head goes once the board is against the left edge of the view and this
				     panel has all the width past it — the room beside a fight is where a reading of
				     the fight belongs, and laying it over the board there would be taking room off
				     the board while a screen's worth of it stood empty over here.
				     Above the fighter and never over it: what the fight is about is read first and
				     what there is to do about it is under that, which is the same order the head
				     and the board are in standing up. `shrink-0` because it is the block that says
				     what it says at the size it says it — a short panel takes it out of the
				     fighter's picture below, which is the thing here with room to give. -->
				{#if lyingDown}
					<CombatHead {location} classes="relative shrink-0" />
					<!-- And under it, whose side this is, exactly as it stands under the head standing
					     up: one arrangement of the two accounts whichever way the screen is — half the
					     width, centred under a row whose two ends are the town and its holder, and on
					     that row's own surface, so the two read as one block of chrome rather than as
					     a bar with something loose under it. -->
					<CombatPlayerBadge
						classes="relative mx-auto w-1/2 shrink-0 bg-base-100/50"
						canConcede={!!state && !state.outcome && state.phase === 'planning'}
						over={!!state?.outcome}
						on:concede={() => controller?.concede()}
					/>
				{/if}
				{#if shownRow}
					<!-- The card is a **column of what it holds**, standing up: the account's row and,
					     under it, the three lines saying what an order does. Both stood out of the flow
					     while the card was stretched down the view by `flex-1` — there was room to pin
					     things to the corners and the middle of — and a card whose every child is
					     absolute has no content to be the height of, which is the whole of why they
					     are in the flow now. Lying down it still takes the height of the panel
					     (`landscape:flex-1`), the panel there being the full side of the view.
					     `gap-2` is the whole of the spacing between the two, which is what makes the
					     card the sum of its own parts and nothing else. -->
					<!-- It is **not faded** while a turn is being carried out. It was, and what the
					     fade was for is gone with the buttons: a plate of orders greyed out says they
					     cannot be given, where an account and three lines of text are as true mid-turn
					     as they are between turns, and dimming the very card the narration is read off
					     dims the fight's own voice with it. It still takes no pointer then — there is
					     nothing on it to answer with — but it is drawn exactly as it is the rest of the
					     time, so nothing about the panel changes at the reveal. -->
					<div
						class={classNames(
							'relative flex flex-col gap-2 rounded-box bg-base-100/80 p-2 shadow-xl landscape:min-h-0 landscape:flex-1',
							{
								'pointer-events-none': panelLocked
							}
						)}
					>
						<!-- How many fights have finished everywhere else while this one has been going
						     on, and the sheet that reads them out (see CombatFeedButton, which draws
						     nothing until one has). It is the one thing left on this row: the account
						     that stood across from it has a row of its own now, under the head of the
						     fight, where what is said about the player is said (see CombatPlayerBadge).
						     Held against the far edge of the card, so it is the corner of the panel and
						     not a mark somewhere along its top. It stood at the end of the score banner
						     in the head until that banner came off. -->
						<div class="relative z-10 flex shrink-0 justify-end">
							<CombatFeedButton buttonClasses="btn btn-outline btn-square btn-sm" />
						</div>
						<!-- What each of the three orders does, across the middle of the panel, all three
						     at once and a line each (see CombatOrderGuide, which is the whole block).
						     The three buttons stood here — the orders themselves, pressed to answer for
						     the fighter the panel was turned to. They are given on the board now: the
						     same three, off the same list, standing in that fighter's own lane where the
						     question is being asked (see `onBoardReady`). Two plates carrying one set of
						     buttons was the reader looking at the answer in one place and the fight in
						     another, and the copy that had to go was the one furthest from the board.
						     What the panel is for now is the one thing neither column of glyphs can say —
						     what pressing one of them does — which is exactly what a player who has just
						     arrived is short of.
						     **It is what the card is the height of.** The three lines stand in the flow
						     under the account's row and *are* the card's height standing up, the card
						     being the sum of what it holds. `my-auto` is what centres them in the room
						     left over lying down, where the card is stretched down the whole side of the
						     view and there is a great deal of it; standing up there is none left over and
						     the same class does nothing. It was pinned across the middle of a stretched
						     plate until the plate stopped being stretched.
						     **Hidden while a turn plays out rather than taken down.** It explains a choice
						     and there is no choice on the panel while the turn is being carried out — but
						     unmounting it would take its height with it, and the panel is what the board
						     is stood on top of, so the fight would shift down the view at every reveal and
						     back up at every commit. `invisible` keeps the room and takes the ink, which
						     is what the narration is then drawn over. -->
						<CombatOrderGuide
							classes={classNames('my-auto', { invisible: panelLocked })}
						/>
					</div>
				{/if}
				<!-- What the fight is saying about the encounter being played out, laid across the
				     middle of this panel (see CombatNarration, which is the whole block). The board
				     prints no word over any fighter, so this is where the fight is put into words:
				     over the one plate the player is already reading, **one sentence per row of the
				     board**, each standing for as long as that row is being played and replaced by
				     the next row's.
				     A sibling of the orders' card rather than something inside it: it is laid over
				     the card and takes nothing from it — no room and no pointer — so the card is the
				     height of what it holds and this is drawn across it whatever that turns out to
				     be. Written after it, so it stands on it.
				     The middle of the panel is where both of the things this plate ever says are
				     said, one turn apart: the guide while a turn is being planned and this while it
				     is being carried out, never at once, and the account keeps the top corner
				     whichever of them is up. So a line here covers nothing that is read or pressed.
				     It is gone between turns, since the cue is (see the controller's `finishTurn`).
				     The way on from each encounter is drawn there too, and pressed back into the
				     controller: a turn is walked through a row at a time now rather than played
				     on a timer, so the block that says what a row was is also the block that
				     carries the reader off it. `playing` is what puts the button up and
				     `awaiting` is what makes it pressable — the first is the turn being carried
				     out at all, the second is this one row having finished being shown.
				     It carries no plate of its own — the card it is laid over is one — so it is
				     held to that card's *content*: the panel's own padding and the card's
				     together (`inset-x-5`), where a block that brought its own fill stood on the
				     card's outer edge and kept the words off it itself. The sentence takes the
				     whole of that width, so it is said as large as the panel can say it. -->
				<CombatNarration
					cue={state?.cue ?? null}
					playing={state?.phase === 'resolving'}
					awaiting={state?.awaiting ?? false}
					on:next={() => controller?.next()}
					classes="absolute inset-x-5 top-1/2 -translate-y-1/2"
				/>
			</div>
		</div>
	{/if}
</div>
