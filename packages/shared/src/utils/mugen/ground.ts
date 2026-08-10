/**
 * The ground the fight is fought on: which sheet it is cut from, how that sheet is ruled,
 * and which of its tiles the board lays where.
 *
 * Facts about a picture, and nothing else — no Pixi, no canvas, no board. Which is the
 * whole reason it is here rather than in `mugen-board`, where it was: the board engine is
 * imported dynamically and arrives when a fight does, and one value import out of it is
 * enough to make it a static dependency of whatever asked (see the note at the head of
 * `combat-color.ts`, which moved for exactly this). The ground is drawn twice — on the
 * canvas by the board, and in the document under it by the arena's phone panel, which
 * carries the field on past the foot of the canvas — and the two have to be laying the
 * same tiles off the same sheet or the join shows.
 *
 * What CSS cannot take from here it spells again: a Tailwind class is a literal, so the
 * panel's own rules repeat these figures in `calc()`. Keep the two in step.
 */

import { BOARD_WIDTH, FIRST_LANE_ROW, FIRST_ROW } from './grid';

/** The vendored sheet the ground tiles are cut from. */
export const GROUND_TILE_SHEET = '/assets/tiles/grass-16x16.png';

/** The sheet's pitch: it is ruled into squares this size from its top-left corner. */
export const GROUND_TILE_PX = 16;

/** How many tiles wide and deep that sheet is at that pitch — what a stylesheet has to
 * scale it by to draw one tile at one square. */
export const GROUND_SHEET_TILES = 16;

/**
 * How many tiles a board cell is laid with, across and down — nine to a cell, three each
 * way. It is what decides how large the artwork's own pixels are drawn, the cell being a
 * fixed size, and it is a whole number so that every cell's grass begins on a tile corner
 * and the field reads as one ground rather than as squares of turf laid side by side.
 *
 * It is also the subdivision the ground is *ruled* into: one tile per bordered square, so
 * the two can never say different things about where a tile ends.
 */
export const GROUND_TILES_PER_CELL = 3;

/**
 * The **brow**: how many rows of squares are cut off the top of the board to make the
 * picture, counted from the board's own top-left corner. So the picture starts on this
 * row, which is what the document has to know to lay ground beside it — the row a band's
 * first square is level with is the row the canvas's first square is.
 *
 * What those rows are, what cutting them costs the tallest fighters and what it buys the
 * rest is on `mugen-board`'s `BROW_DEPTH`, which is this in cell widths. Here it is one
 * more fact about the shape of the picture, like the tiles it is laid with.
 */
export const GROUND_BROW_SQUARES = 2;

/**
 * The row of squares the field's grass begins on — the row its upper fringe is laid along —
 * counted from the board's own top-left corner. Everything above it is sky: nothing is drawn
 * on those squares at all, and what shows through them is the page the canvas stands on
 * (`CombatArena`'s own blue), which is also what shows through the gaps in the fringe itself.
 *
 * It is the top of the first row a lane opens on, **plus one square**. The row above the
 * lanes was already sky, and the top third of the first lane row is sky now too, so the
 * grass starts a square lower and the blue reaches a square further down the picture.
 * Nothing about the fight moves for it: that row is walked and fought over like any other,
 * and the line standing on it stands on its floor, three quarters of a cell below this.
 *
 * Read from here by both the canvas and the ground the document lays beside it
 * (`CombatFlanks`), since a fringe drawn on two different rows either side of the edge of
 * the picture is a join.
 */
export const GROUND_FIELD_TOP_SQUARE_ROW =
	(FIRST_LANE_ROW - FIRST_ROW) * GROUND_TILES_PER_CELL + 1;

/**
 * The **cut**: the one square-column the board is drawn without, counted in squares from
 * the board's own top-left corner. It is the left-hand third of the middle cell — the white
 * column both halves can enter — and the field closes up over it: everything to its right is
 * drawn a square further left, and the board is one square narrower for it.
 *
 * So the two halves keep their three squares apiece and the ground between them is two, which
 * is a field still symmetric about its own middle — the line a duel is fought across
 * (`mugen-board`'s `meleeApproach`) — with a third of a cell less of it between the lines.
 * Nothing about the *rules* moves: the middle column is one cell like any other, walked to and
 * fought over in cells ({@link file://./grid.ts}); it is drawn in two thirds of the room its
 * neighbours get, and a fighter standing on it stands in the middle of the ground it has.
 *
 * A fact about the shape of the picture, like {@link GROUND_BROW_SQUARES} — which is the same
 * cut taken in rows off the top — and kept here for the same reason: the canvas closes it up
 * in its projection, the document lays its bands beside a board this many squares across, and
 * the two have to be counting the same field.
 */
export const GROUND_CUT_COLUMN = 3;

/**
 * How many squares across the board is drawn: every cell's own {@link GROUND_TILES_PER_CELL}
 * over every column, less the cut one. It is what the numbering of the squares wraps on, what
 * the canvas's aspect is taken from, and the count the document spells again as a literal —
 * `min(100vw/8, 100dvh/11)` in `CombatGround`, `CombatFlanks` and the arena's own sky.
 */
export const GROUND_FIELD_COLUMNS = BOARD_WIDTH * GROUND_TILES_PER_CELL - 1;

/** A tile's place on the sheet, counted in tiles of {@link GROUND_TILE_PX} from its
 * top-left corner — which is how the sheet itself is read, and the only way any of these
 * are named. */
export interface SheetTile {
	column: number;
	row: number;
}

// The sheet is **blocks of three rows**, one green per block, each block the same tiles in
// the same places: its fills down the left-hand column, and beside them a ring of edges and
// corners drawn to meet whatever the grass borders on. The board takes one block whole —
// the vivid green, the second down — and every tile it uses comes out of that block, which
// is what keeps the field one grass rather than a set of tiles that happen to be near each
// other. The rest of the page is other greens, sand, and tufts this board has nothing to
// stand on.

/**
 * The tiles the field is laid with, alternated over it in this order: the block's three
 * fills, straight down its left-hand column — bare, bladed, flowering. The row under them
 * is the next block and a different green, which is where this block ends.
 *
 * Alternated rather than one of them everywhere: they are the same green, so a board of
 * them is grass that goes on rather than a stamp repeated.
 */
export const GROUND_FILL_TILES: SheetTile[] = [
	{ column: 0, row: 3 },
	{ column: 0, row: 4 },
	{ column: 0, row: 5 }
];

/**
 * The tiles the field's first and last rows of squares are drawn with instead: the same
 * block's two grass edges, the upper one blades along the top with nothing above them and
 * the lower one its mirror, blades hanging off the bottom. They are the middle of the
 * block's last and first rows — the bottom and the top of the ring drawn round its hole —
 * so they are the same green as the fills between them, which is the whole reason for
 * taking a block rather than a tile.
 *
 * They are boundary tiles — drawn to be laid where grass stops — so the field begins and
 * ends in a fringe rather than at a straight line nothing put there. Being boundaries, half
 * of each is not grass at all, and what shows through that half is not the same in both
 * places: the upper one is laid on sky, the sky row being directly over it, and the lower
 * one on {@link GROUND_EARTH_TILES}.
 */
export const GROUND_TOP_EDGE_TILE: SheetTile = { column: 2, row: 5 };
export const GROUND_BOTTOM_EDGE_TILE: SheetTile = { column: 2, row: 3 };

/**
 * The earth: the three fills standing together along the sheet's top row — the flat one,
 * one with a few specks in it and one with pebbles.
 *
 * It is what is behind the field's bottom fringe, and what the ground is made of past the
 * foot of the canvas. The fringe is blades with gaps, and the gaps have to be something:
 * above the field they are sky, because the sky row is right there; below it they are this,
 * so the grass is seen to stop and the bare ground it grew out of to carry on.
 *
 * All three, alternated the way the grasses are, because it is laid in strips a square deep
 * running the whole width of the board: one earth tile repeated along one would put the
 * same pebble at the same height every third of a cell, and the three taken in turn is
 * ground.
 */
export const GROUND_EARTH_TILES: SheetTile[] = [
	{ column: 6, row: 0 },
	{ column: 7, row: 0 },
	{ column: 8, row: 0 }
];

/**
 * Which of a set of tiles the square at [column, row] takes — counted in squares from the
 * board's own top-left corner, over the whole field rather than within any one cell.
 *
 * The set is taken in turn along both axes, so no square is ever the tile east or north of
 * it, and with three the pattern runs on the diagonal. It is a fact about where a square is
 * and nothing else: no throw, nothing stored, so the same board is the same field every
 * time it is drawn — and the ground drawn in the document below and beside the canvas
 * carries the canvas's own pattern on, being the same rule counted from the same corner.
 *
 * **A square may be off the board on either side.** The document lays ground out to the
 * edges of the view, which past the board's left-hand column is column −1, −2 and on, so
 * the remainder is taken the positive way round rather than by the language's `%` — which
 * keeps the sign of what it is given and would index off the front of the list. The
 * alternation is the same one either side of the corner it is counted from.
 */
export function groundTileAt<T>(tiles: T[], column: number, row: number): T {
	const at = (column + row) % tiles.length;
	return tiles[at < 0 ? at + tiles.length : at];
}
