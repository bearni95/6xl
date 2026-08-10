<script lang="ts">
	/**
	 * The ground below the board, drawn in the document.
	 *
	 * The canvas is `min(100vw, 100dvh × aspect)` and on a phone the width is what runs out,
	 * so a board that shape leaves a band of view under it — the band the orders panel is
	 * given. This is what that band stands on: the same earth tiles the canvas lays behind
	 * the fringe its field ends in, in the same squares, carrying the pattern on past the
	 * last row the canvas could draw. So the field stops at the foot of the picture and the
	 * ground it grew out of does not.
	 *
	 * It is the panel's background and nothing else: absolutely placed over the whole of it,
	 * taking no pointer, saying nothing to a reader — the panel's own plate is drawn over it
	 * and the orders are read off that.
	 *
	 * **The figures are the picture's, spelled again in CSS.** A Tailwind class is a literal,
	 * so what `ground.ts` and `grid.ts` say in TypeScript this has to say a second time in
	 * `calc()`: the canvas is nine squares across and eleven down — the board's thirteen (four
	 * rows of cells at three squares a cell, plus the apron), less the two the brow takes off
	 * the top — so one square is `min(100vw/9, 100dvh/11)`, the same two limits the canvas
	 * sizes itself between. That is what makes a square here exactly a square there. The
	 * sheet is sixteen
	 * tiles across, so drawing one tile at one square is a background sixteen squares wide
	 * with the wanted tile's column scrolled into view.
	 */
	import classNames from 'classnames';
	import { BOARD_HEIGHT, BOARD_WIDTH } from '$utils/mugen/grid';
	import { GROUND_EARTH_TILES, GROUND_TILES_PER_CELL, groundTileAt } from '$utils/mugen/ground';

	/** The board's own width in ground squares — and so this grid's, which is why it is laid
	 * centred: it is the ground under the board, and it is as wide as the board is. (The
	 * count is `grid-cols-9` below, a class being a literal.) */
	const COLUMNS = BOARD_WIDTH * GROUND_TILES_PER_CELL;

	/**
	 * The square row this grid starts on, counted from the top of the board like every other
	 * square: the one after the apron, which is the last row the canvas draws. Counting from
	 * the board's own corner is the whole point — the alternation is a function of where a
	 * square is ({@link groundTileAt}), so starting the count here is what continues the
	 * canvas's pattern rather than beginning a new one under it.
	 */
	const FIRST_ROW = BOARD_HEIGHT * GROUND_TILES_PER_CELL + 1;

	/**
	 * How many rows to draw. The band under the board is `100dvh − 11 squares`, which at nine
	 * squares to the width is `9 × dvh/vw − 11` rows, so this many covers a view up to
	 * `(rows + 11) / 9` times as tall as it is wide — near three, which is past the narrowest
	 * folding phone, and it ignores the head of the fight taking room off the top, so the
	 * real bound is further out again. Every row the board loses off its top is a row more
	 * band down here, which is why this is not the ten it was.
	 *
	 * The rest is cut off by the clip, which is what the overflow is for — the grid is
	 * allowed to run past the foot of the view, and never to be scrolled to.
	 */
	const ROWS = 14;

	/** Everything every square is: one tile of the sheet, drawn at one square, magnified with
	 * its own pixels rather than smeared (`pixelated`) — the canvas samples the same artwork
	 * `nearest` for the same reason. */
	const SQUARE =
		'size-[min(100vw/9,100dvh/11)] [background-image:url(/assets/tiles/grass-16x16.png)] [background-size:calc(16*min(100vw/9,100dvh/11))_calc(16*min(100vw/9,100dvh/11))] [image-rendering:pixelated]';

	/**
	 * Which tile of the sheet a square shows, by that tile's column on it: the background is
	 * pulled left by that many squares. Keyed by column rather than listed in order, so the
	 * set and the order they are laid in stay `ground.ts`'s ({@link GROUND_EARTH_TILES}) and
	 * this only answers how to draw one of them. All three are on the sheet's top row, so
	 * none of them is pulled up.
	 */
	const EARTH_COLUMN_CLASSES: Record<number, string> = {
		6: '[background-position:calc(-6*min(100vw/9,100dvh/11))_0]',
		7: '[background-position:calc(-7*min(100vw/9,100dvh/11))_0]',
		8: '[background-position:calc(-8*min(100vw/9,100dvh/11))_0]'
	};

	// The whole grid, filled a row at a time, each square asking the shared rule which earth
	// it is — the same question the canvas asks about the squares above these.
	const squares = Array.from({ length: ROWS * COLUMNS }, (_, index) => {
		const column = index % COLUMNS;
		const row = FIRST_ROW + Math.floor(index / COLUMNS);
		return EARTH_COLUMN_CLASSES[groundTileAt(GROUND_EARTH_TILES, column, row).column];
	});
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	<div class="mx-auto grid w-fit grid-cols-9">
		{#each squares as square, index (index)}
			<div class={classNames(SQUARE, square)}></div>
		{/each}
	</div>
</div>
