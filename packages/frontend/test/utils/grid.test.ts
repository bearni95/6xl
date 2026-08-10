import { describe, it, expect } from 'vitest';
import {
	BOARD_COLUMNS,
	BOARD_HEIGHT,
	BOARD_ROWS,
	BOARD_WIDTH,
	boardCells,
	type Cell,
	cellCenter,
	cellCorners,
	cellDistance,
	cellFoot,
	cellSide,
	columnLabel,
	FIRST_COLUMN,
	FIRST_LANE_ROW,
	FIRST_ROW,
	figureFootDrop,
	findMeleeMeeting,
	findPath,
	footToFloor,
	isBoardCell,
	LAST_COLUMN,
	LAST_ROW,
	MIDDLE_ROW,
	neighbors,
	rowLabel
} from '$utils/mugen/grid';

describe('board cells', () => {
	it('is four rows of three, every column running every row', () => {
		// Three lanes and the row of ground above them, which is board like any other.
		expect(BOARD_ROWS).toBe(4);
		expect(FIRST_ROW).toBe(FIRST_LANE_ROW - 1);
		// The middle lane is the middle of what is fought over, not of the board.
		expect(MIDDLE_ROW).toBe(1);
		// One red column, the white one, one blue: a rectangle, and even either side of
		// its middle — which the hex field's odd sixth column could never be. No more than
		// that, because every column of this field is one a lane is fought across.
		expect(BOARD_COLUMNS).toBe(3);
		expect(boardCells()).toHaveLength(BOARD_COLUMNS * BOARD_ROWS);
		for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
			expect(boardCells().filter((cell) => cell.r === r)).toHaveLength(BOARD_COLUMNS);
		}
	});

	it('excludes everything off the field', () => {
		expect(isBoardCell(2, 0)).toBe(false); // no such column — a half is one deep
		expect(isBoardCell(-2, 1)).toBe(false); // nor here — nothing is behind a line
		expect(isBoardCell(0, 3)).toBe(false); // below the bottom row
		expect(isBoardCell(0, FIRST_ROW - 1)).toBe(false); // above the top row
	});

	it('includes representative interior cells', () => {
		expect(isBoardCell(0, 0)).toBe(true);
		expect(isBoardCell(-1, 2)).toBe(true);
		expect(isBoardCell(1, 1)).toBe(true);
		// The corners, which on a rectangle are cells like any other.
		expect(isBoardCell(FIRST_COLUMN, FIRST_ROW)).toBe(true);
		expect(isBoardCell(LAST_COLUMN, LAST_ROW)).toBe(true);
	});

	it('assigns colour side by column sign, evenly either way', () => {
		expect(cellSide(-1)).toBe('red');
		expect(cellSide(0)).toBe('purple');
		expect(cellSide(1)).toBe('blue');
		// Neither half holds ground the other has no answer to.
		const red = boardCells().filter((cell) => cellSide(cell.q) === 'red');
		const blue = boardCells().filter((cell) => cellSide(cell.q) === 'blue');
		expect(red).toHaveLength(blue.length);
	});
});

describe('cell names', () => {
	it('letters the columns from the left edge and numbers the rows from the top', () => {
		// A column's coordinate is signed and centred on the white one; its name is its
		// place across the board, so the left-hand column is `a` whatever q calls it.
		expect(columnLabel(FIRST_COLUMN)).toBe('a');
		expect(columnLabel(0)).toBe('b');
		expect(columnLabel(LAST_COLUMN)).toBe('c');
		// Rows read downward, so the top one is 1 and the numbering follows the rows —
		// the row above the lanes included, which is what makes the first lane row 2.
		expect(rowLabel(FIRST_ROW)).toBe('1');
		expect(rowLabel(FIRST_LANE_ROW)).toBe('2');
		expect(rowLabel(LAST_ROW)).toBe(String(BOARD_ROWS));
	});

	it('names every cell, and no two the same', () => {
		const cells = boardCells();
		const names = cells.map((cell) => `${columnLabel(cell.q)}${rowLabel(cell.r)}`);
		expect(names).toHaveLength(cells.length);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe('adjacency and pathfinding', () => {
	it('neighbours are the four sides, all valid board cells at distance 1', () => {
		// Well inside the board, so all four of its sides land on real cells.
		const from: Cell = { q: 0, r: 1 };
		const around = neighbors(from.q, from.r);
		expect(around).toHaveLength(4);
		for (const nb of around) {
			expect(isBoardCell(nb.q, nb.r)).toBe(true);
			expect(cellDistance(from, nb)).toBe(1);
		}
		expect(new Set(around.map((c) => `${c.q},${c.r}`)).size).toBe(4);
	});

	it('reaches the next row straight down, never across a corner', () => {
		// A square's rows stack, so the cell below is the same column — and the cells it
		// meets at a corner alone are not steps at all, they are two moves around it.
		expect(neighbors(0, 0)).toContainEqual({ q: 0, r: 1 });
		expect(neighbors(0, 0)).not.toContainEqual({ q: -1, r: 1 });
		expect(neighbors(0, 0)).not.toContainEqual({ q: 1, r: 1 });
		expect(cellDistance({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(2);
		// The same both ways, which is what having no stagger means: the row above is
		// reached exactly as the row below is.
		expect(neighbors(0, 1)).toContainEqual({ q: 0, r: 0 });
		expect(neighbors(0, 1)).toContainEqual({ q: 0, r: 2 });
	});

	it('measures the row above the lanes like any other', () => {
		expect(neighbors(0, FIRST_ROW)).toContainEqual({ q: 0, r: FIRST_LANE_ROW });
		for (const nb of neighbors(0, FIRST_ROW)) {
			expect(cellDistance({ q: 0, r: FIRST_ROW }, nb)).toBe(1);
		}
		// It is walkable ground, so it is on the paths that cross it — two rows down from
		// the top row is two steps, exactly as two rows down from anywhere else.
		expect(cellDistance({ q: 0, r: FIRST_ROW }, { q: 0, r: FIRST_LANE_ROW + 1 })).toBe(2);
	});

	it('measures a walk as the columns between plus the rows', () => {
		expect(cellDistance({ q: 0, r: 0 }, { q: -1, r: 2 })).toBe(3);
		// Across a whole row is the columns between, as it always was.
		expect(cellDistance({ q: -1, r: 1 }, { q: 1, r: 1 })).toBe(2);
	});

	it('agrees with the walk: a path is as long as the distance says', () => {
		const pairs: [Cell, Cell][] = [
			[{ q: -1, r: FIRST_ROW }, { q: 1, r: 2 }],
			[{ q: -1, r: 2 }, { q: 1, r: FIRST_ROW }],
			[{ q: 0, r: 0 }, { q: -1, r: 2 }],
			[{ q: -1, r: 1 }, { q: 1, r: 1 }]
		];
		for (const [start, goal] of pairs) {
			const path = findPath(start, goal, (c) => isBoardCell(c.q, c.r)) as Cell[];
			expect(path).not.toBeNull();
			expect(path.length - 1).toBe(cellDistance(start, goal));
		}
	});

	it('findPath returns a contiguous path including both endpoints', () => {
		const start: Cell = { q: -1, r: 2 };
		const goal: Cell = { q: 1, r: FIRST_ROW };
		const path = findPath(start, goal, (c) => isBoardCell(c.q, c.r));
		expect(path).not.toBeNull();
		const cells = path as Cell[];
		expect(cells[0]).toEqual(start);
		expect(cells[cells.length - 1]).toEqual(goal);
		for (let i = 1; i < cells.length; i++) {
			expect(cellDistance(cells[i - 1], cells[i])).toBe(1);
		}
	});
});

describe('the shape of a cell', () => {
	it('is a square: four corners, one wide and one tall', () => {
		const corners = cellCorners(0, 0);
		expect(corners).toHaveLength(4);
		const centre = cellCenter(0, 0);
		// Every corner is half a cell from the centre on both axes, which is the whole of
		// what makes it a square.
		for (const corner of corners) {
			expect(Math.abs(corner.x - centre.x)).toBeCloseTo(0.5);
			expect(Math.abs(corner.y - centre.y)).toBeCloseTo(0.5);
		}
		// Two to a side, so the outline is a rectangle and not a bow tie.
		expect(new Set(corners.map((c) => c.x.toFixed(4))).size).toBe(2);
		expect(new Set(corners.map((c) => c.y.toFixed(4))).size).toBe(2);
	});

	it('meets its neighbours a full cell away, whichever way they are neighbours', () => {
		expect(cellCenter(1, 0).x - cellCenter(0, 0).x).toBeCloseTo(1);
		expect(cellCenter(0, 1).y - cellCenter(0, 0).y).toBeCloseTo(1);
		expect(cellCenter(0, 0).y).toBeCloseTo(cellCenter(2, 0).y);
	});

	it('stacks the rows squarely: no row is offset from any other', () => {
		// What the hex field could not do, and what every lane on this board is level for.
		for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
			expect(cellCenter(0, r).x).toBeCloseTo(cellCenter(0, FIRST_ROW).x);
		}
	});

	it('is exactly as big as the board says it is', () => {
		// Every cell of the board lies inside the extent the renderer sizes its canvas
		// from, and the extent is no bigger than it needs to be.
		const corners = boardCells().flatMap((cell) => cellCorners(cell.q, cell.r));
		expect(Math.min(...corners.map((c) => c.x))).toBeCloseTo(0);
		expect(Math.min(...corners.map((c) => c.y))).toBeCloseTo(0);
		expect(Math.max(...corners.map((c) => c.x))).toBeCloseTo(BOARD_WIDTH);
		expect(Math.max(...corners.map((c) => c.y))).toBeCloseTo(BOARD_HEIGHT);
		// Counted rather than worked out: cells one wide and one tall, in a rectangle.
		expect(BOARD_WIDTH).toBeCloseTo(BOARD_COLUMNS);
		expect(BOARD_HEIGHT).toBeCloseTo(BOARD_ROWS);
	});

	it('is symmetric left to right', () => {
		// Mirroring the field about its own middle lands it back on itself, which is what
		// a rectangle of squares is and what the white column being the middle depends on.
		const middle = BOARD_WIDTH / 2;
		const at = (cells: Cell[]) =>
			new Set(cells.map((c) => `${cellCenter(c.q, c.r).x.toFixed(4)},${c.r}`));
		const board = at(boardCells());
		const mirrored = new Set(
			boardCells().map((c) => `${(2 * middle - cellCenter(c.q, c.r).x).toFixed(4)},${c.r}`)
		);
		expect(mirrored).toEqual(board);
		// And the white column is that middle, which is what the two lines meet across.
		expect(cellCenter(0, FIRST_LANE_ROW).x).toBeCloseTo(middle);
	});

	it('stands a fighter inside its own cell, not on the line under it', () => {
		const centre = cellCenter(0, FIRST_ROW);
		const foot = cellFoot(0, FIRST_ROW);
		expect(foot.x).toBeCloseTo(centre.x);
		// Below the centre, so the fighter reads as inside its cell — but above the
		// bottom edge, which is the line it shares with the row below.
		expect(foot.y).toBeGreaterThan(centre.y);
		expect(foot.y).toBeLessThan(centre.y + 0.5);
	});

	it('drops a fighter taller than its cell onto the cell floor, and nobody else', () => {
		// A figure the cell has room for stands on the foot line, where the width of its own
		// cell is under it. One drawn taller than the cell is over the row behind it whatever
		// line it is on, so the quarter cell left under it only reads as floating: it goes on
		// the floor, feet on the line the cell is ruled by.
		expect(figureFootDrop(0.5)).toBe(0);
		expect(figureFootDrop(1)).toBe(0);
		expect(figureFootDrop(1.3)).toBeCloseTo(footToFloor());

		// And the drop is exactly the distance between those two lines, so a dropped fighter
		// stands on the cell's bottom edge and not past it.
		const foot = cellFoot(0, FIRST_ROW);
		const floor = cellCorners(0, FIRST_ROW)[2].y;
		expect(foot.y + figureFootDrop(1.3)).toBeCloseTo(floor);
		expect(foot.y + figureFootDrop(1)).toBeCloseTo(foot.y);
	});
});

describe('findMeleeMeeting', () => {
	it('lands the two fighters side by side on one row, on colour-legal cells', () => {
		const meeting = findMeleeMeeting({ q: -2, r: 1 }, { q: 2, r: 1 });
		expect(meeting).not.toBeNull();
		const { red, blue } = meeting!;
		// Immediately horizontal: adjacent, and on the same row.
		expect(cellDistance(red.destination, blue.destination)).toBe(1);
		expect(red.destination.r).toBe(blue.destination.r);
		// Red stays on red/white (q <= 0); blue stays strictly on blue (q >= 1).
		expect(red.destination.q).toBeLessThanOrEqual(0);
		expect(blue.destination.q).toBeGreaterThanOrEqual(1);
		// Paths are anchored at each fighter's start and their destination.
		expect(red.path[0]).toEqual({ q: -2, r: 1 });
		expect(red.path[red.path.length - 1]).toEqual(red.destination);
		expect(blue.path[0]).toEqual({ q: 2, r: 1 });
		expect(blue.path[blue.path.length - 1]).toEqual(blue.destination);
	});

	it('keeps red on its colour or white and blue strictly on blue', () => {
		const meeting = findMeleeMeeting({ q: -1, r: 0 }, { q: 1, r: 2 })!;
		for (const cell of meeting.red.path) expect(cell.q).toBeLessThanOrEqual(0);
		for (const cell of meeting.blue.path) expect(cell.q).toBeGreaterThanOrEqual(1);
	});
});
