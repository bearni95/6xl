<script lang="ts">
	/**
	 * The head of the fight: what it is over, who it is with, and how it stands.
	 *
	 * One block of chrome and not three things that happen to be near each other — the account
	 * holding the town and the town's own plate side by side, each set against the middle they
	 * meet on, and the score banner across the foot of both, every row the width of the block. It is a reading and nothing but: what a town is
	 * called and whose it is are the map's, the score is the controller's, nothing here is
	 * worked out, and there is nothing on it to press. The way out of the fight stood on the
	 * seam between the two cells for a while and is asked for on the player's own card at the
	 * corner of the orders panel now (see CombatArena) — a control belongs with the side it
	 * acts for, not in the middle of a reading of the other one.
	 *
	 * It is drawn in two entirely different places and that is why it is its own file. Standing
	 * up, it is laid over the board's top edge (or at the head of the column on a phone), where
	 * the board has the whole of the view and anything the head took would come off the fight.
	 * Lying down, the board is against the left edge of the view and the orders have all the
	 * width past it, so the head goes into that panel instead — a block across the top of the
	 * sidebar, above the fighter, at the full width of it, standing in room the fight is not
	 * being drawn in rather than over room it is. Which of the two is mounted is `CombatArena`'s
	 * call, and it is a real conditional there rather than a `hidden` class: a head laid over
	 * the board and a head in the sidebar are not the same box seen twice, and mounting both
	 * would put two of every plate and avatar on the screen for one fight.
	 *
	 * Where it stands is therefore never settled here. The component is the block; the caller
	 * gives it its place, and `classes` is how (see both call sites).
	 */
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import CombatHost from '$components/core/CombatHost.svelte';
	import TownChallenge from '$components/core/TownChallenge.svelte';
	import TownPlate, { PLATE_FLUSH_CLASSES } from '$components/core/TownPlate.svelte';
	import { TEAM_SIZE } from '$services/team.service';
	import type { TownPlateCard } from '$types/map.type';

	// The town the fight is over, drawn on the very plate its pin carries on the map, and the
	// account sitting on it read off the same card. Handed over already built: it is the map's
	// reading and the arena's re-reading of the two ledgers, never this block's. Null draws no
	// card at all, which is what a match with no town behind it gets.
	export let location: TownPlateCard | null = null;

	// The standing, while there is a fight to have one: how many lanes each side has taken.
	// Null is a fight that has not begun or one already decided — a decided fight reads its
	// score off the panel in the middle of the board, and the same score at both ends of one
	// canvas would be one score too many — and it is what the whole banner hangs on, the siege
	// bar it stands on included.
	export let wins: { info: number; error: number } | null = null;

	export let classes: string = '';

	// The lanes of the fight, 1..n, for the score: one square per lane, filled once that many
	// have been taken. A lane is a fighter of each side and the white cell between them, so
	// there are as many of them as a team has members — the score is drawn from the same count
	// the team is built to, and cannot come to say a fight is longer or shorter than it is.
	const LANES = Array.from({ length: TEAM_SIZE }, (_, index) => index + 1);

	// The rivals' half of the score is read the other way round, so its squares are laid out
	// backwards and its count fills from the right — see the score's own note. The order is the
	// whole of the difference between the two: same squares, same rule.
	const RIVAL_LANES = [...LANES].reverse();
</script>

<!-- The head's own column. It takes the whole width it is given, and what that is is the
     caller's to say: the whole of a phone's screen, whatever the two cells come to over the
     board from `sm:` up, or the whole of the sidebar lying down. -->
<div class={classNames('flex w-full flex-col', classes)}>
	<!-- The two things the fight is about, side by side: the place on the left and whoever is
	     sitting on it on the right. They are of a kind — what is being fought for, and who it is
	     being fought with — so they are read across rather than stacked, and the grid is what
	     makes the two cells the same width whatever either of them holds: a name of any length
	     and a town of any length are laid out by the head, not by each other.
	     Both cells face the middle, and that is a rule about their insides rather than about
	     which of them is which. Each carries a picture — the show's tile and the account's face —
	     and each picture stands on the seam between the two cells, with its own type set against
	     it and growing back out towards the edge of the head: the tile at the right end of the
	     left cell with the place's lines ranged right against it, the face at the left end of the
	     right cell with the name ranged left against it. The two marks are then a pair, read
	     together, and neither line of type is left hanging away from the thing it names.
	     Every picture was at the outer end before, which is what a block assembled out of two
	     things that each start with a picture does if nothing is said about it: two marks in the
	     far corners of the head, and the middle — the one part of it the eye crosses — empty.
	     The cells did not move to fix it and must not: the town is the left-hand thing in this
	     game wherever the two are named together, the board included. What moved is what is
	     inside them, and each cell says so itself (`mirrored` on the plate, and CombatHost's own
	     single arrangement).
	     Two cells whoever is sitting on the town. Where nobody is — a town still on its seeded
	     house team — the second is the same plate with nothing printed on it. It stood as a
	     single wide column for a while, on the reading that an empty plate says there is a
	     player and we have lost them; what it actually says is that there is nobody over there
	     to name, which is the truth about a seeded town. A row of two whoever holds the place
	     is also a row that does not change shape as the place changes hands, which is the whole
	     of what a head laid over a board should be doing. -->
	<div class="grid grid-cols-2 items-stretch">
		<!-- The town, on the very plate its pin carries on the map: the same mark, drawn the same
		     way, showing what was pressed to get here. Only the challenge button is missing, and
		     the caller is what leaves it out — a fight already under way has nothing left to
		     start.
		     Mirrored, which is the one thing about it that is not the map's: the head row is read
		     the other way round — the two lines take the width and are ranged right, the tile after
		     them — so the glyph ends up at the right edge of this cell, which is the middle of the
		     head. A pin has one end to start from and this cell has the other, and the plate is
		     told which rather than left to be turned round from outside.
		     Flush: laid into a cell it takes the cell's width and squares its corners, where a
		     pin's plate settles its own width and rounds them.
		     Without its holder row, which is the one thing a pin's plate says that this head now
		     says better: the row is a face and a name squeezed under the place, which is all a pin
		     has room for, and the cell beside this is the whole account. Said twice, side by side,
		     the second saying reads as a second player. The plate keeps the row everywhere else —
		     this is the caller leaving it out, exactly as it leaves out the challenge button. -->
		{#if location}
			<TownPlate {...location} holder={null} challenge={null} flush mirrored />
		{/if}
		<!-- Whose town it is — the account behind the line-up on the other side of the board, said
		     the way this game says a player wherever it says one: the face they wear, the name they
		     chose and the level they have reached. Written second, so it takes the right-hand cell,
		     where its own arrangement — the face first, the reading set left against it — puts the
		     portrait on the middle of the head and runs the name outwards from there. -->
		{#if location?.holder}
			<CombatHost
				name={location.holder.name}
				characterId={location.holder.characterId}
				color={location.holder.color}
				level={location.holder.level}
				hint={$_('map.holder.title')}
			/>
		{:else}
			<!-- Nobody holds the town, so nobody is named — and the cell stays, on the very surface
			     the cell beside it is printed on. What it says is that the line-up on the other side
			     of the board is the town's own and not a player's, and an empty plate is how a head
			     with two halves says it. -->
			<div class={PLATE_FLUSH_CLASSES}></div>
		{/if}
	</div>
	<!-- The standing used to be a third cell across the foot of this grid. It is on the banner
	     below now, in the middle of the score, which is where the fight is counted: what this one
	     fight is one of belongs with how this one fight is going, not with the two things it is
	     about. -->
	{#if wins}
		<!-- The score, at the head of the fight it is a score of, under the town being fought
		     over.
		     The fight is three duels, each played for one cell of the white column down the middle
		     of the board, so the score is drawn as that ground: three squares a side, one per lane,
		     filled white as that side takes it. A number said how many; these say which of a known
		     three, and they are cells of a board rather than a length being filled, which is what
		     the thing being counted is. Each side's three sit over the half of the board that side
		     holds — the rivals' to the left, the player's to the right. Between them plain room,
		     and *under* both of them — the plate's whole width and
		     its whole depth — how far the town itself has been taken: the count this one fight is
		     one of, which is why it is read with the score rather than up with the two things the
		     fight is about. The banner is one row deep for that: the bar is the ground the counts
		     stand on, not a second band under them.
		     Both counts grow outwards from that middle, so the rivals' three are laid out backwards
		     and fill from the right: it is the same count read either way round, and the two then
		     mirror each other across the middle rather than both running left to right. Both are
		     drawn white — the ground down the middle they are played for is white, and a count of
		     it says so at a glance. -->
		<!-- On the same plate the map's breadcrumb bar stands on: the base colour at four fifths so
		     what is behind reads through it, white type and a shadow to lift it off what it covers.
		     The score and the path are the same kind of thing — a line of state laid over a picture
		     that fills the view — so they are drawn as one thing and not two.
		     It runs the full width of the head, which is the width of the two cells above it: the
		     head is one block of chrome and every row of it is the same width, so a phone gets a
		     band across the top of the view rather than a label floating in the middle of one. It
		     had a triangular wing at either end for a while, which made the row a banner narrower
		     than the rows above it — a shape, and shapes do not butt against anything.
		     The counts keep their own width at the two ends and the room between them is what gives
		     (`flex-1`), so a wider head is a wider bar, never two counts drifting apart from the
		     halves of the board they are about. -->
		<div
			class="pointer-events-auto relative flex h-7 w-full items-stretch gap-2 bg-base-100/80 text-white shadow-xl"
		>
			<!-- How far the town itself has been taken, and the whole plate is what it is drawn on:
			     the bar is laid *under* the counts rather than beside them or below them —
			     `absolute inset-0`, so it is the plate's own width and the plate's own depth, every
			     pixel of the row. It had a row to itself for a moment, which doubled the depth of the
			     banner to carry one bar: a band laid over the board is the last thing that should be
			     growing, and a quantity does not need a line of its own when what stands on it is
			     three discs and three discs. So the counts stand on it, and the fill is the ground
			     they are counted on — which is what the standing is: this fight is one of the wins
			     that bar is measuring.
			     Squared and stretched to the plate by the variants below, which reach past the bar's
			     own `h-6` — a height meant for the plate of a pin, where this one is the banner
			     itself. It takes no pointer, and neither does anything else in this head: the way out
			     of the fight stood in the middle of this very row once and hid these figures whenever
			     the pointer came near, then moved up to the seam above, and is off the head
			     altogether now — it is asked for on the player's own card in the orders panel. So the
			     figures stand in the middle of the plate and stay there. -->
			{#if location?.challenge}
				<TownChallenge
					siege={location.challenge.siege}
					button={location.challenge.button}
					unlocksAt={location.challenge.unlocksAt}
					onUnlock={location.challenge.onUnlock}
					classes="pointer-events-none absolute inset-0 [&>div]:h-full [&_progress]:h-full [&_progress]:rounded-none"
				/>
			{/if}
			<!-- Each side's count is three cells in a row, laid out as cells of the board because
			     that is what is being counted: three equal columns over `w-24`, which is three of the
			     plate's own former depth — the two blocks are the same width as each other and read
			     together whatever the plate comes to.
			     `relative`, and that is not decoration: the bar behind them is positioned, and a
			     positioned box paints over the in-flow content of the same stack. Giving each block a
			     position of its own is what puts the discs back on top of the ground they are counted
			     on.
			     Nothing is ruled between them. The cells were divided by a line down each of their
			     sides, and what the lines were dividing is three discs in a row with a plate's own
			     width of air around them — a thing already read as three from across the room, since
			     a count of three is what a disc apart from another disc says. So the rules were
			     drawing a grid over a figure that did not need one, and the busiest mark on the
			     banner was the one carrying the least. The grid still sets the spacing; it simply is
			     not drawn any more.
			     A lane taken is a disc in its cell rather than the cell painted in: the ground a lane
			     is played for is one white cell of the middle column, and a mark set in a cell reads
			     as something standing on that ground where a filled cell reads as the ground itself
			     having changed. The disc is always drawn and simply carries no colour until the lane
			     is won, so the three cells hold their spacing whatever the score is. -->
			<div
				class="relative grid h-full w-24 grid-cols-3 py-1"
				role="progressbar"
				aria-label={$_('combat.rivalWins')}
				aria-valuemin={0}
				aria-valuemax={TEAM_SIZE}
				aria-valuenow={wins.error}
			>
				{#each RIVAL_LANES as lane}
					<span class="flex items-center justify-center">
						<span
							class={classNames('size-4 rounded-full', lane <= wins.error && 'bg-white')}
						></span>
					</span>
				{/each}
			</div>
			<!-- The room between the two counts, and it is deliberately empty. Two things have stood
			     here and neither belonged: the turn number, a figure nothing on the screen was
			     waiting for, and after it the way out of the fight, out of sight until the pointer
			     was on the plate. The way out has left the head entirely — it is asked for on the
			     player's own card in the orders panel, which is the side it acts for — so what is
			     left here is the room itself, which is what the middle of a score is.
			     It is what gives as the head gets wider (`flex-1`), the counts keeping the width they
			     are drawn at: a count is three cells of the board and means nothing stretched, where
			     the space between two counts is only ever space. -->
			<div class="flex-1"></div>
			<div
				class="relative grid h-full w-24 grid-cols-3 py-1"
				role="progressbar"
				aria-label={$_('combat.yourWins')}
				aria-valuemin={0}
				aria-valuemax={TEAM_SIZE}
				aria-valuenow={wins.info}
			>
				{#each LANES as lane}
					<span class="flex items-center justify-center">
						<span class={classNames('size-4 rounded-full', lane <= wins.info && 'bg-white')}></span>
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
