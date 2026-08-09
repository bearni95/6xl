/**
 * Pure grid helpers for the board, shared between the renderer
 * ({@link file://./mugen-board.ts}) and combat pathfinding so the two can never
 * disagree about which cells exist.
 *
 * The board is a field of **squares** — each cell as wide as it is tall, meeting its four
 * neighbours squarely on four full sides — addressed by column (`q`, across the width)
 * and row (`r`, down the screen): row 0 is the top row, and rows count downward exactly
 * as they are read, because nothing here is tilted. Every row is level with every other
 * and every column runs the board's whole depth, so the field is a plain rectangle and a
 * cell is simply where its column and its row cross.
 *
 * It was a field of pointy-topped hexagons before this, and what that cost is the whole
 * reason the rest of this file is as short as it is. Hexagonal rows nest — each one
 * shoved half a cell across from the rows either side, so that its cells sit in their
 * slants — which meant a line level in columns was *not* level on screen, and the fights
 * written against it had to answer that half cell: the rival's middle fighter opened a
 * column further back than its castmates so that all three lanes would clash on one line
 * (see the controller's opening cells), and the board carried a sixth column that existed
 * on the staggered rows alone, purely to keep the field's outline symmetric — which left
 * red holding two cells of ground blue had no answer to. A square field asks for none of
 * it. The lanes are level because the rows are, the openings are level because the lanes
 * are, and the field is symmetric because it is a rectangle: two red columns, the white
 * one, two blue.
 *
 * The coordinates are the plain ones — the column a cell is drawn in, and the row it
 * sits on — because that is what the board's rules are written in: a column has a
 * colour and a row is a lane, and both have to survive being counted. On a square field
 * they also survive being *stepped*: a step is one added to one of them, which is why
 * {@link neighbors} and {@link cellDistance} are four deltas and a sum rather than the
 * per-row arithmetic a stagger needs.
 *
 * A step is a full side, and a square has four of them, so the diagonals are not steps:
 * two cells meeting at a corner alone are two moves apart, around the corner. Nothing on
 * this board walks anywhere but along its own row or up and down a column, so that is
 * what a walk is measured in.
 *
 * Cells left of centre are the red half, right the blue half, the shared white one at
 * q = 0. Every column runs the full depth of the board, so a row is a
 * **lane**: the two fighters holding the same row face each other across it, and the
 * ground between them is the white cell they are playing for.
 *
 * **Three of the rows are lanes and one is not.** A side is three fighters, so three rows
 * are a whole line and every one of them is fought over ({@link FIRST_LANE_ROW} down to
 * {@link LAST_ROW}, and the combat controller's opening cells). The row above them
 * ({@link FIRST_ROW}) is board and nothing else: real ground, drawn and walkable and part
 * of every distance measured across the field, but no line opens on it and no lane is
 * played over it.
 */

/** A cell coordinate: column across, row down. */
export interface Cell {
	q: number;
	r: number;
}

/** Which half of the board a column belongs to. */
export type CellSide = 'red' | 'purple' | 'blue';

/**
 * The board's outermost columns: two red, the white one at zero, two blue. Even either
 * side of the middle, which is what a rectangle of squares can be and the hex field this
 * replaced could not — its sixth column was there to square the *outline* and left red a
 * column deeper than blue (see the module note).
 */
export const FIRST_COLUMN = -2;
export const LAST_COLUMN = 2;
/**
 * The board's rows, counted downward from the top of the screen. The top one is ground
 * above the fight (see the module note); the lanes run from {@link FIRST_LANE_ROW} to
 * {@link LAST_ROW}, a lane apiece.
 */
export const FIRST_ROW = -1;
export const LAST_ROW = 2;

/**
 * The first row a fight is played on. The rows above it are board — walked over, measured
 * across, drawn like any other — but no line opens on them.
 *
 * A row added above the lanes leaves the lanes exactly as they were, which on a square
 * field is true of itself: every row is level with every other, so where a lane lands on
 * screen relative to its neighbours is the row count and nothing else. It was not true of
 * the hex field this replaced — rows there alternated, so the stagger had to be counted
 * from this row rather than from the board's top edge, or adding one above would have
 * flipped every lane's.
 */
export const FIRST_LANE_ROW = 0;

/** The board's extent in cells, which is what sizes the drawn grid: its columns and its
 * rows. Every column holds a cell on every row, the field being a rectangle. */
export const BOARD_COLUMNS = LAST_COLUMN - FIRST_COLUMN + 1;
export const BOARD_ROWS = LAST_ROW - FIRST_ROW + 1;

/** The middle lane: the one halfway down the rows that are fought over, which is not the
 * middle of the board — the board has a row above them. */
export const MIDDLE_ROW = Math.floor((FIRST_LANE_ROW + LAST_ROW) / 2);

/**
 * What a column is called, the way a chess file is: a letter, counted from `a` at the
 * board's left edge. A column's own coordinate is signed and centred on the white one
 * (`q = 0`), which is the right way to write the board's rules and the wrong way to
 * point at a cell out loud — so the name is the column's position across the board
 * rather than its distance from the middle.
 */
export const columnLabel = (q: number): string => String.fromCharCode(97 + (q - FIRST_COLUMN));

/**
 * What a row is called: a number, counted from 1 at the top row. Chess numbers its
 * ranks up from the bottom because the bottom is white's own end; here the two sides
 * are the left and right halves and no row belongs to either, so the numbering follows
 * the board's own rows instead and runs the way they are read — counted off whichever row
 * is topmost, so the name says how far down the board a cell is and not which lane it is
 * on, and the letter/number pair never disagrees with the coordinate behind it.
 */
export const rowLabel = (r: number): string => String(r - FIRST_ROW + 1);

/**
 * The four neighbours of a square: the two alongside it on its own row, and the one
 * directly above and the one directly below. The same four wherever the cell is, since
 * no row is offset from any other — which is the whole of what a square field buys the
 * two functions that walk it.
 *
 * Four and not eight: a step is a full side, and the cells a square meets at a corner
 * alone are not ones it has a side with. They stay two moves away, around that corner.
 */
const NEIGHBOR_DELTAS: Cell[] = [
	{ q: 1, r: 0 },
	{ q: -1, r: 0 },
	{ q: 0, r: -1 },
	{ q: 0, r: 1 }
];

/**
 * Whether [q, r] is a real, occupiable board cell — every column of every row of the
 * board, the row above the lanes included. The field is a rectangle, so this is its two
 * ends on each axis and nothing else.
 */
export function isBoardCell(q: number, r: number): boolean {
	if (r < FIRST_ROW || r > LAST_ROW) return false;
	return q >= FIRST_COLUMN && q <= LAST_COLUMN;
}

/** Every valid board cell, in a stable order (by column, then row). */
export function boardCells(): Cell[] {
	const cells: Cell[] = [];
	for (let q = FIRST_COLUMN; q <= LAST_COLUMN; q++) {
		for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
			if (isBoardCell(q, r)) cells.push({ q, r });
		}
	}
	return cells;
}

/** Colour side of a column: negative q is red, positive blue, zero white. */
export function cellSide(q: number): CellSide {
	if (q < 0) return 'red';
	if (q > 0) return 'blue';
	return 'purple';
}

/** The (up to four) valid board neighbours of a cell. */
export function neighbors(q: number, r: number): Cell[] {
	return NEIGHBOR_DELTAS.map((d) => ({ q: q + d.q, r: r + d.r })).filter((c) =>
		isBoardCell(c.q, c.r)
	);
}

/**
 * Step distance between two cells: how many sides a fighter crosses walking from one to
 * the other, which on a square field with no diagonals is the columns between them plus
 * the rows. There is nothing to undo first — the same difference in `q` is the same walk
 * wherever on the board it is measured, which was exactly what the hex field's stagger
 * cost and why this went by way of cube coordinates before.
 */
export function cellDistance(a: Cell, b: Cell): number {
	return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}

const key = (q: number, r: number): string => `${q},${r}`;

// --- The shape of a cell, and where it sits ---------------------------------
// Everything below is measured in **cell widths**: one unit is the width of a cell, which
// on a square field is also its height and also the distance between two neighbours'
// centres, whichever way they are neighbours. That unit is the renderer's `cellSize`, so a
// board is drawn by scaling these figures by it and nothing else — and the shape of the
// board stays here, next to the rules written on it, rather than being re-derived by
// whatever happens to be drawing.
//
// Which makes the board's own extent the plainest thing in the file: rows stack, so four
// rows are four cells tall, and columns sit side by side, so five columns are five wide.
// The hex field this replaced was neither — its rows interlocked at three quarters of a
// height, so its extent had to be worked out rather than counted (that arithmetic now
// lives with the one surface still laid on hexagons, `hex-lattice.ts`).

/** A point on the board, in cell widths off the grid's top-left corner. */
export interface GridPoint {
	x: number;
	y: number;
}

/**
 * How far below a cell's centre a figure standing in it plants its feet, in cell widths.
 *
 * Three quarters of the way down the cell, not on its bottom edge. That edge is shared
 * with the cell below and is where the ruled line is drawn, so a figure stood on it reads
 * as standing between the two rows rather than in either; a quarter of a cell up from it,
 * the whole width of its own cell is under it and it is plainly inside. It is also where
 * the hex field stood its fighters — the foot of a pointy-topped hexagon's vertical
 * sides is three quarters down it too — which is what keeps a fighter on the same line of
 * the board as before.
 */
const FOOT_DROP = 0.25;

/**
 * The board's own extent in cell widths: its columns across and its rows down, since the
 * field is a rectangle of cells one wide and one tall with nothing hanging off any edge.
 */
export const BOARD_WIDTH = BOARD_COLUMNS;
export const BOARD_HEIGHT = BOARD_ROWS;

/**
 * Centre of the cell at [q, r], measured from the board's own top-left corner: half a
 * cell into its own column and half a cell down its own row.
 */
export function cellCenter(q: number, r: number): GridPoint {
	return { x: q - FIRST_COLUMN + 0.5, y: r - FIRST_ROW + 0.5 };
}

/** The line a fighter standing in the cell at [q, r] plants its feet on — see
 * {@link FOOT_DROP} for why it is not the cell's bottom edge. */
export function cellFoot(q: number, r: number): GridPoint {
	const centre = cellCenter(q, r);
	return { x: centre.x, y: centre.y + FOOT_DROP };
}

/** The four corners of the cell at [q, r], from the top left clockwise. */
export function cellCorners(q: number, r: number): GridPoint[] {
	const { x, y } = cellCenter(q, r);
	return [
		{ x: x - 0.5, y: y - 0.5 },
		{ x: x + 0.5, y: y - 0.5 },
		{ x: x + 0.5, y: y + 0.5 },
		{ x: x - 0.5, y: y + 0.5 }
	];
}

/**
 * Breadth-first search from `start` to `goal` across cells for which
 * `isAllowed` returns true. Returns the cell path **including** both endpoints,
 * or null if unreachable. `start` and `goal` are assumed allowed by the caller.
 */
export function findPath(start: Cell, goal: Cell, isAllowed: (c: Cell) => boolean): Cell[] | null {
	if (start.q === goal.q && start.r === goal.r) return [start];
	const cameFrom = new Map<string, Cell | null>();
	cameFrom.set(key(start.q, start.r), null);
	const queue: Cell[] = [start];
	while (queue.length > 0) {
		const current = queue.shift() as Cell;
		if (current.q === goal.q && current.r === goal.r) {
			const path: Cell[] = [];
			let node: Cell | null = current;
			while (node) {
				path.unshift(node);
				node = cameFrom.get(key(node.q, node.r)) ?? null;
			}
			return path;
		}
		for (const next of neighbors(current.q, current.r)) {
			if (!isAllowed(next)) continue;
			const k = key(next.q, next.r);
			if (cameFrom.has(k)) continue;
			cameFrom.set(k, current);
			queue.push(next);
		}
	}
	return null;
}

/** BFS distance map from `start` across allowed cells. */
function distanceMap(start: Cell, isAllowed: (c: Cell) => boolean): Map<string, number> {
	const dist = new Map<string, number>();
	dist.set(key(start.q, start.r), 0);
	const queue: Cell[] = [start];
	while (queue.length > 0) {
		const current = queue.shift() as Cell;
		const base = dist.get(key(current.q, current.r)) as number;
		for (const next of neighbors(current.q, current.r)) {
			if (!isAllowed(next)) continue;
			const k = key(next.q, next.r);
			if (dist.has(k)) continue;
			dist.set(k, base + 1);
			queue.push(next);
		}
	}
	return dist;
}

/** A fighter's computed approach: destination cell and the path to reach it. */
export interface Approach {
	destination: Cell;
	path: Cell[];
}

/**
 * Work out where a red (left-half) fighter and a blue (right-half) fighter
 * should meet for melee: the pair of **immediately horizontal** cells — the two
 * cells either side of one vertical grid line, one legal for red (q ≤ 0), one legal
 * for blue (q ≥ 1) — that minimises the two fighters' combined walking distance
 * from their starts. Meeting side by side on one row is what makes the duel read
 * horizontally on screen, and every row of this field is level all the way across —
 * every cell of it at the same height, meeting the cells either side of it on a full
 * vertical edge.
 * Red may stand on its own colour or the shared white column; blue stays strictly
 * on blue. When `redCell` is given the meeting spot is fixed instead of searched:
 * red walks to that exact cell and blue to its east neighbour on the same row.
 * Returns each fighter's destination + path, or null if they can't meet.
 */
export function findMeleeMeeting(
	startRed: Cell,
	startBlue: Cell,
	redCell?: Cell,
	blocked?: (c: Cell) => boolean
): { red: Approach; blue: Approach } | null {
	// A cell is walkable for a side if it obeys the side rule and isn't occupied by
	// another (non-dueling) character; the two fighters' own cells are never blocked
	// because the caller excludes them from `blocked`.
	const free = (c: Cell) => !blocked?.(c);
	const redAllowed = (c: Cell) => cellSide(c.q) !== 'blue' && free(c); // red or white (q ≤ 0)
	const blueAllowed = (c: Cell) => cellSide(c.q) === 'blue' && free(c); // blue only (q ≥ 1)

	if (redCell) {
		// Fixed meeting spot: red on the given cell, blue facing it from the east
		// neighbour, mirroring the side-by-side rule of the search below.
		const blueCell: Cell = { q: redCell.q + 1, r: redCell.r };
		if (!isBoardCell(redCell.q, redCell.r) || !redAllowed(redCell)) return null;
		if (!isBoardCell(blueCell.q, blueCell.r) || !blueAllowed(blueCell)) return null;
		const redPath = findPath(startRed, redCell, redAllowed);
		const bluePath = findPath(startBlue, blueCell, blueAllowed);
		if (!redPath || !bluePath) return null;
		return {
			red: { destination: redCell, path: redPath },
			blue: { destination: blueCell, path: bluePath }
		};
	}

	const redDist = distanceMap(startRed, redAllowed);
	const blueDist = distanceMap(startBlue, blueAllowed);

	let best: {
		redCell: Cell;
		blueCell: Cell;
		cost: number;
		central: number;
	} | null = null;
	for (const cell of boardCells()) {
		if (!redAllowed(cell)) continue;
		const rd = redDist.get(key(cell.q, cell.r));
		if (rd === undefined) continue;
		for (const nb of neighbors(cell.q, cell.r)) {
			// Only the east/west neighbour (same row) counts: the fighters must
			// face each other from immediately horizontal cells.
			if (nb.r !== cell.r) continue;
			if (!blueAllowed(nb)) continue;
			const bd = blueDist.get(key(nb.q, nb.r));
			if (bd === undefined) continue;
			const cost = rd + bd;
			// Tie-break toward the centre so duels happen near the middle white column.
			const central = Math.abs(cell.q) + Math.abs(nb.q);
			if (!best || cost < best.cost || (cost === best.cost && central < best.central)) {
				best = { redCell: cell, blueCell: nb, cost, central };
			}
		}
	}

	if (!best) return null;
	const redPath = findPath(startRed, best.redCell, redAllowed);
	const bluePath = findPath(startBlue, best.blueCell, blueAllowed);
	if (!redPath || !bluePath) return null;
	return {
		red: { destination: best.redCell, path: redPath },
		blue: { destination: best.blueCell, path: bluePath }
	};
}

/**
 * How close a fighter can legally get to `target`: the allowed cell that minimises
 * step distance to `target`, breaking ties first toward the target's row (so the
 * melee strike lines up horizontally on screen, matching how fighters meet in
 * {@link findMeleeMeeting}) and then toward the shortest walk from `start`. Used
 * when a melee fighter closes on a foe whose own cell it cannot have — `isAllowed`
 * is what keeps it out of the cells it may not stand in, so it stops beside them
 * rather than walking through. Returns the destination + path, or null if it can't
 * move.
 */
export function findClosestApproach(
	start: Cell,
	target: Cell,
	isAllowed: (c: Cell) => boolean
): Approach | null {
	const dist = distanceMap(start, isAllowed);
	let best: {
		cell: Cell;
		toTarget: number;
		offRow: number;
		walk: number;
	} | null = null;
	for (const cell of boardCells()) {
		if (!isAllowed(cell)) continue;
		const walk = dist.get(key(cell.q, cell.r));
		if (walk === undefined) continue;
		const toTarget = cellDistance(cell, target);
		const offRow = Math.abs(cell.r - target.r);
		if (
			!best ||
			toTarget < best.toTarget ||
			(toTarget === best.toTarget &&
				(offRow < best.offRow || (offRow === best.offRow && walk < best.walk)))
		) {
			best = { cell, toTarget, offRow, walk };
		}
	}
	if (!best) return null;
	const path = findPath(start, best.cell, isAllowed);
	if (!path) return null;
	return { destination: best.cell, path };
}
