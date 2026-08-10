<script lang="ts">
	/**
	 * The ground to the left and right of the board, drawn in the document.
	 *
	 * The canvas is `min(100vw, 100dvh × aspect)` and on anything wider than a phone the
	 * height is what runs out, so a board nine squares across and eleven deep takes the whole
	 * height and leaves a band of view at each end. This is what those bands stand on: the
	 * board's own rows, carried out past the edges of the picture to the edges of the screen,
	 * so the field runs off the sides of the view rather than stopping at the sides of a
	 * drawing floating in the middle of it.
	 *
	 * It is {@link CombatGround} turned ninety degrees, and for the same reason. That one
	 * carries the ground on *below* the canvas, which is the band a phone is left with; this
	 * one carries it on *beside* it, which is the band everything else is left with. Between
	 * the two, whichever axis the canvas did not fill is the fight's ground and not the page.
	 *
	 * **A row is carried out by the board's own count, not by its end tile repeated.** Which
	 * tile a square takes is a fact about where that square is ({@link groundTileAt}) — the
	 * three grasses taken in turn along both axes — so the squares beside the board are simply
	 * the next columns of the same count, off the left edge into negative ones and off the
	 * right into a tenth, an eleventh and so on. The alternation runs through the edge of the
	 * picture exactly as it runs through a cell border, and one tile stamped along a band would
	 * have put the same flower at the same height every square of it, which is the thing the
	 * three fills exist to avoid. The rows above the field have no tile at all: they are sky,
	 * and they are carried out as the colour they are.
	 *
	 * It is a backdrop and nothing else: laid under everything in the arena, taking no
	 * pointer, saying nothing to a reader.
	 *
	 * **The figures are the picture's, spelled again in CSS.** A Tailwind class is a literal,
	 * so what `ground.ts` and `grid.ts` say in TypeScript this has to say a second time in
	 * `calc()`, exactly as `CombatGround` does: the canvas is nine squares across and eleven
	 * down, so one square is `min(100vw/9, 100dvh/11)` — the same two limits the canvas sizes
	 * itself between, which is what makes a square here exactly a square there.
	 */
	import classNames from 'classnames';
	import { BOARD_HEIGHT, BOARD_WIDTH, FIRST_LANE_ROW, FIRST_ROW } from '$utils/mugen/grid';
	import {
		GROUND_BOTTOM_EDGE_TILE,
		GROUND_BROW_SQUARES,
		GROUND_EARTH_TILES,
		GROUND_FILL_TILES,
		GROUND_TILES_PER_CELL,
		GROUND_TOP_EDGE_TILE,
		groundTileAt,
		type SheetTile
	} from '$utils/mugen/ground';

	/** The board's own width in ground squares, which is the gap left in the middle of every
	 * row here: the canvas stands in it. (It is `9` in the spacer's class below, a class being
	 * a literal.) */
	const COLUMNS = BOARD_WIDTH * GROUND_TILES_PER_CELL;

	/** The square row the field's grass begins on — the top of the first row a lane opens on,
	 * which is where the sky stops — and the row it ends on, which is the apron below the last
	 * cell. Both are counted in squares from the board's own top-left corner, like every other
	 * row here, and both are the rows the sheet's two fringe tiles are laid along. */
	const FIELD_TOP_ROW = (FIRST_LANE_ROW - FIRST_ROW) * GROUND_TILES_PER_CELL;
	const APRON_ROW = BOARD_HEIGHT * GROUND_TILES_PER_CELL;

	/**
	 * How many squares each band is drawn, out from the board's own edge. The band is
	 * `(100vw − 9 squares) / 2` and at eleven squares to the height that is
	 * `(11 × vw/dvh − 9) / 2` squares, so this many covers a view up to `(2 × columns + 9) / 11`
	 * times as wide as it is tall — past 32:9, which is the widest screen sold. The rest is cut
	 * off by the clip, which is what the overflow is for: the rows are allowed to run past the
	 * sides of the view and are never to be scrolled to.
	 */
	const BAND_COLUMNS = 16;

	/**
	 * One square, at the size the picture draws one — and the whole of what a square is where
	 * nothing is laid on it, which is every row above the field.
	 *
	 * `shrink-0` here and on the gap below because a row is deliberately wider than the view it
	 * is drawn in — that is what makes the bands reach the edges — and a flex item that is
	 * allowed to give way would answer an overflowing row by squeezing every square out of true
	 * rather than by running off the screen, which is what the clip is for.
	 */
	const SQUARE = 'size-[min(100vw/9,100dvh/11)] shrink-0';

	/** A tile of the sheet laid over one square: the sheet scaled so that one of its own tiles
	 * covers a square exactly, magnified with its own pixels rather than smeared (`pixelated`)
	 * — the canvas samples the same artwork `nearest` for the same reason. *Which* tile is the
	 * offset beside it ({@link TILE_POSITIONS}). */
	const TILE =
		'[background-image:url(/assets/tiles/grass-16x16.png)] [background-size:calc(16*min(100vw/9,100dvh/11))_calc(16*min(100vw/9,100dvh/11))] [image-rendering:pixelated]';

	/** The gap in the middle of every row: the board's own nine squares, drawn as nothing at
	 * all, so the canvas stands in it and this is only ever what is beside the canvas. */
	const SPACER = 'w-[calc(9*min(100vw/9,100dvh/11))] shrink-0';

	/**
	 * Where each tile the field uses sits on the sheet, as the offset that pulls it into view:
	 * the background is dragged left and up by that tile's column and row. Keyed by the place
	 * on the sheet rather than by what the tile is for, so which tiles are laid where stays
	 * `ground.ts`'s and this only answers how to draw one of them — and every tile that module
	 * lays has to be in here, since a class is a literal and cannot be worked out.
	 */
	const TILE_POSITIONS: Record<string, string> = {
		// The three grasses the field is laid with, straight down the block's left column.
		'0:3': '[background-position:0_calc(-3*min(100vw/9,100dvh/11))]',
		'0:4': '[background-position:0_calc(-4*min(100vw/9,100dvh/11))]',
		'0:5': '[background-position:0_calc(-5*min(100vw/9,100dvh/11))]',
		// The block's two fringes: the lower one along the apron, the upper along the field's
		// first row.
		'2:3': '[background-position:calc(-2*min(100vw/9,100dvh/11))_calc(-3*min(100vw/9,100dvh/11))]',
		'2:5': '[background-position:calc(-2*min(100vw/9,100dvh/11))_calc(-5*min(100vw/9,100dvh/11))]',
		// The earth, along the sheet's own top row, which is what the lower fringe is laid on.
		'6:0': '[background-position:calc(-6*min(100vw/9,100dvh/11))_0]',
		'7:0': '[background-position:calc(-7*min(100vw/9,100dvh/11))_0]',
		'8:0': '[background-position:calc(-8*min(100vw/9,100dvh/11))_0]'
	};

	function tileClass(tile: SheetTile): string {
		return TILE_POSITIONS[`${tile.column}:${tile.row}`] ?? '';
	}

	/** One square of a band: what is behind it, and the tiles laid over that, back to front. */
	interface Square {
		/** The sky shows through this square — either it is a square of sky outright, or it is
		 * the field's top fringe, which is blades with gaps between them. The same blue the
		 * arena paints behind the board (`CombatArena`'s own sky); keep the two in step. */
		sky: boolean;
		layers: string[];
	}

	/**
	 * What the square at [column, row] carries. The column is the board's own, counted on past
	 * both its edges — negative to the left of it, nine and up to the right — so a square out
	 * here is asked the same question in the same terms as one on the board, and the
	 * alternation is the board's carried on rather than a second one started beside it.
	 *
	 * The row decides everything: above the field there is nothing laid at all and the sky is
	 * the whole of it; the field's first row is the upper fringe, laid on that same sky; the
	 * apron is the lower fringe, laid on the earth the grass grew out of; and everything
	 * between is whichever of the three grasses that square's place on the board gives it.
	 * It is the same reading `mugen-board` makes of the same square, off the same rules.
	 */
	function squareAt(column: number, row: number): Square {
		if (row < FIELD_TOP_ROW) return { sky: true, layers: [] };
		if (row === FIELD_TOP_ROW) return { sky: true, layers: [tileClass(GROUND_TOP_EDGE_TILE)] };
		if (row === APRON_ROW) {
			return {
				sky: false,
				layers: [
					tileClass(groundTileAt(GROUND_EARTH_TILES, column, row)),
					tileClass(GROUND_BOTTOM_EDGE_TILE)
				]
			};
		}
		return { sky: false, layers: [tileClass(groundTileAt(GROUND_FILL_TILES, column, row))] };
	}

	/**
	 * The rows of the picture, each as the squares beside the board: the columns to the left of
	 * it, in reading order and so ending at its edge, the board's own nine squares as a gap, and
	 * the columns to the right of it. `null` is the gap.
	 *
	 * Every square is asked for itself, off its own column, which is the whole of what makes the
	 * band a continuation: the last square of the left band is the column before the board's
	 * first and the first square of the right band is the column after its last, so the count
	 * runs unbroken across the whole screen.
	 *
	 * Only the rows the canvas actually shows are drawn — the picture is cut two squares below
	 * the top of the board (the brow), so it begins there and ends on the apron. A row above
	 * the crop would be a row of ground beside a board that has none.
	 */
	const rows = Array.from({ length: APRON_ROW - GROUND_BROW_SQUARES + 1 }, (_, index) => {
		const row = GROUND_BROW_SQUARES + index;
		return [
			...Array.from({ length: BAND_COLUMNS }, (_, at) => squareAt(at - BAND_COLUMNS, row)),
			null,
			...Array.from({ length: BAND_COLUMNS }, (_, at) => squareAt(COLUMNS + at, row))
		];
	});
</script>

<!-- Laid over the whole sheet and clipped to it, with the picture's own eleven rows centred in
     it exactly as the canvas is centred in it: the middle nine squares of every row are the
     gap the canvas stands in, so what is drawn is only ever what is beside the canvas. On a
     phone there is nothing to draw — the width is what runs out there and the board takes the
     whole of it — so this is `sm:` and up, which is where `CombatGround` leaves off.
     Under everything (`-z-10`), and written after the sky so it stands on it: the fringe along
     the top of the field is blades with gaps, and what shows through them out here is the same
     blue that shows through them on the board. -->
<div
	class="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden sm:block"
	aria-hidden="true"
>
	<!-- `w-max` because the rows are wider than the box they are clipped in and an absolutely
	     placed box with no width of its own is otherwise shrunk to whatever room is left beside
	     where it is anchored. The two halves are the same length, so the rows are centred on the
	     board's own middle by being centred as a block. -->
	<div class="absolute top-1/2 left-1/2 w-max -translate-x-1/2 -translate-y-1/2">
		{#each rows as squares, row (row)}
			<div class="flex">
				{#each squares as square, column (column)}
					{#if square}
						<!-- One square: what is behind it, then its first tile on the square itself
						     and any second one nested over that. Two layers is the apron alone — the
						     fringe there is laid on the earth — so nesting is what that one row costs
						     rather than what every square does. -->
						<div
							class={classNames(SQUARE, { 'bg-sky-300': square.sky }, square.layers[0] && [
								TILE,
								square.layers[0]
							])}
						>
							{#if square.layers[1]}
								<div class={classNames('size-full', TILE, square.layers[1])}></div>
							{/if}
						</div>
					{:else}
						<div class={SPACER}></div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>
