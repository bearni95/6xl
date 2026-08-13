<script lang="ts">
	/**
	 * The head of the fight: what it is over, who it is with, and how it stands.
	 *
	 * One block of chrome and not three things that happen to be near each other — the account
	 * holding the town and the town's own plate side by side, each set against the middle they
	 * meet on, and how far the town has been taken standing on the seam between them. It is a
	 * reading and nothing but: what a town is called, whose it is and how far it has gone are all
	 * the map's, and nothing here is worked out.
	 *
	 * One row, and nothing on it is pressable. The way out of the fight stood on the seam between
	 * the two cells for a while and is asked for on the player's own card at the corner of the
	 * orders panel now (see CombatArena) — a control belongs with the side it acts for, not in
	 * the middle of a reading of the other one. Under the row stood a score banner: the lanes each
	 * side had taken, drawn as discs, with the way into the feed of finished fights at the end of
	 * it. It is gone — a whole band of chrome between the head and the board, for a count the
	 * fight itself is showing.
	 *
	 * It is drawn in two entirely different places and that is why it is its own file. Standing
	 * up, it is laid over the board's own top edge, on every screen, where the board has the
	 * whole of the view and anything the head took would come off the fight.
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
	 *
	 * **The bar is half a surface**, and it is the only one: the row is printed at `base-100/50`
	 * and every cell in it carries no paint of its own (`surface={false}` on the plate, and the
	 * bare flush list on the account and on the empty cell alike). Which is what
	 * lets the board read through the head laid over it — the fight is what is being looked at,
	 * and a reading of it standing on an opaque band is a strip of the picture taken away. Two
	 * backgrounds could not do it: a plate at eight tenths on a row at five leaves nine tenths,
	 * whatever the row says.
	 */
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import CombatHost from '$components/core/CombatHost.svelte';
	import SiegeBar from '$components/core/SiegeBar.svelte';
	import TownPlate, { PLATE_FLUSH_BARE_CLASSES } from '$components/core/TownPlate.svelte';
	import type { TownPlateCard } from '$types/map.type';

	// The town the fight is over, drawn on the very plate its pin carries on the map, and the
	// account sitting on it read off the same card. Handed over already built: it is the map's
	// reading and the arena's re-reading of the two ledgers, never this block's. Null draws no
	// card at all, which is what a match with no town behind it gets.
	export let location: TownPlateCard | null = null;

	export let classes: string = '';
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
	     of what a head laid over a board should be doing.
	     Three columns and not two, the middle one shrink-to-fit: the standing stands on the seam
	     itself, between the place and whoever is sitting on it, which is where it is about. The
	     two cells are `1fr` apiece and so stay the same width as each other whatever the bar in
	     between comes to — the rule that the head lays the two cells out, not each other, is
	     unchanged. With no standing to draw the middle column is nothing wide and the row is the
	     pair it always was.
	     **Every cell names the column it stands in** (`col-start-*`), and that is not decoration:
	     all three are conditional, and a grid puts what it is given into the next free cell rather
	     than into the cell it was written for. So a town with no standing to draw — a plate taken
	     straight off the map before this page has re-read the ledgers, or a fight with no siege
	     behind it — dropped the account into the *middle* column, shrunk to its own contents, with
	     a whole `1fr` of nothing after it: the row collapsed inwards exactly when the thing that
	     should have held it open was the thing that was missing. Named columns, it cannot: each of
	     the three is drawn where it belongs or not at all, and the row keeps its shape through
	     every state the fight can hand it. -->
	<div class="grid grid-cols-[1fr_auto_1fr] items-stretch bg-base-100/50">
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
		     The plate has no holder row to leave out any more — it carried a face and a name
		     squeezed under the place, which was all a pin had room for, and it came off every
		     plate in the game (see TownPlate). The cell beside this is the whole account, which is
		     the same reading given the room it wants. The challenge is still the caller's to leave
		     out, a fight already under way not being a fight to be started. -->
		{#if location}
			<TownPlate
				{...location}
				challenge={null}
				flush
				mirrored
				surface={false}
				classes="col-start-1"
			/>
		{/if}
		<!-- How far the town itself has been taken, upright on the seam between the two cells: the
		     count this one fight is one of, standing between the place it is about and the account
		     it is against. It lay across the banner below as the ground the lane counts were
		     drawn on, which put a quantity about the *town* in among the score of one fight; here
		     it is between the two things it is a quantity about, and the banner is left to be a
		     score.
		     Sized off the portrait across from it — the same depth as the face in the cell to the
		     right, half as wide — so the seam reads as one mark's worth of upright and not as a
		     third column of chrome. It carries no surface of its own: the row is printed on one,
		     which is what makes the three cells one block of plate rather than two with a gap
		     between them. Padded to the plate's own padding, so the bar is inset exactly as the
		     tile and the face beside it are. -->
		{#if location?.challenge}
			<div class="col-start-2 flex items-center px-1.5">
				<SiegeBar siege={location.challenge.siege} vertical />
			</div>
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
				classes="col-start-3"
			/>
		{:else}
			<!-- Nobody holds the town, so nobody is named — and the cell stays, on the very surface
			     the cell beside it is printed on. What it says is that the line-up on the other side
			     of the board is the town's own and not a player's, and an empty plate is how a head
			     with two halves says it. -->
			<div class={classNames(PLATE_FLUSH_BARE_CLASSES, 'col-start-3')}></div>
		{/if}
	</div>
	<!-- Nothing under the row. The standing has stood in three places — a cell across the foot of
	     that grid, then the ground of a score banner below it — and is on the seam of the row
	     above now, upright between the two things it is about. The banner it was last drawn on is
	     gone with it: a whole band of chrome between the head and the board, for a count the
	     fight itself is showing. -->
</div>
