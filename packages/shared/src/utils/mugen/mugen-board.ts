import {
	Application,
	Assets,
	Container,
	Graphics,
	GraphicsContext,
	ImageSource,
	Sprite,
	Text,
	Texture
} from 'pixi.js';
import { destroyPixiApp } from '../pixi/release-context';
import { combatColorHex, GRID_LINE } from '../color/combat-color';
import type { Manifest } from './mugen-player';
import { CHAR_HEIGHT_RATIO, characterFitScale, REFERENCE_SOURCE_HEIGHT } from '../card/character-fit';
import { characterIdFromFramesPath, readRenderScale } from './character-render-scale';
import { loadDefinition, loadManifest } from './character-assets';
import { crownDrift, crownOffset, type CrownFrame, readCrownAlign } from './character-crown';
import type { CharacterDefinition, CharacterMove } from '../../types/character-definition.type';
import {
	BOARD_HEIGHT,
	BOARD_WIDTH,
	boardCells,
	type Cell,
	cellCenter,
	cellCorners,
	cellFoot,
	cellSide,
	type CellSide,
	FIRST_COLUMN,
	findClosestApproach,
	findMeleeMeeting,
	findPath,
	isBoardCell,
	LAST_COLUMN,
	MIDDLE_ROW
} from './grid';

/** A frame with its loaded texture and pre-computed anchor fractions. */
interface LoadedFrame {
	texture: Texture;
	width: number;
	height: number;
	anchorX: number;
	anchorY: number;
	duration: number;
}

/**
 * Which of a character's animations the board needs loaded, and the three bindings
 * it drives an actor by.
 *
 * Every actor can be walked cell to cell by combat, so all of them take the
 * directional animations bound in the character's JSON definition
 * (move-left/move-right), the hurt flinch, and every move the definition declares, so
 * combat can play whichever move gets picked. Nothing loads a move's projectile:
 * nothing on this board flies any more — an attack is walked over to its target
 * ({@link MugenBoard.closeIn}). Without a definition the directional anims fall back
 * to run.
 *
 * `names` is every one of them and `startName` is the only one the board needs **before
 * it can be shown** — a fighter is stood up in the pose it stands in, and is measured,
 * fitted and crowned off that cycle alone. The rest is the fight's, and the fight has not
 * begun: it is warmed behind the finished board ({@link MugenBoard.whenReady}), which is
 * the difference between waiting on six frames a fighter and waiting on thirty.
 *
 * A function of the definition and nothing else, so the warm-up and the placement read
 * exactly the same list.
 */
function boundAnimations(
	definition: Partial<CharacterDefinition> | null,
	startName: string
): { moveRightAnim: string; moveLeftAnim: string; hurtAnim: string; names: string[] } {
	let moveRightAnim = 'run';
	let moveLeftAnim = 'run';
	let hurtAnim = '';
	const moveSources: string[] = [];
	if (definition) {
		moveRightAnim = definition.directions?.['move-right']?.source || moveRightAnim;
		moveLeftAnim = definition.directions?.['move-left']?.source || moveLeftAnim;
		// The hurt flinch is a movement animation every character defines, not a
		// move — pull it from the animations record.
		hurtAnim = definition.animations?.hurt?.source || '';
		for (const move of definition.moves ?? []) {
			if (move.source) moveSources.push(move.source);
		}
	}
	return {
		moveRightAnim,
		moveLeftAnim,
		hurtAnim,
		names: [
			...new Set([startName, moveRightAnim, moveLeftAnim, hurtAnim, ...moveSources].filter(Boolean))
		]
	};
}

/** Every distinct frame file the named animations of a manifest draw. */
function frameFiles(manifest: Manifest, names: string[]): string[] {
	const files = new Set<string>();
	for (const name of names) {
		const animation = manifest.animations[name];
		if (!animation) continue; // e.g. a character without a run cycle
		for (const frame of animation.frames) files.add(frame.file);
	}
	return [...files];
}

/** A character to place on the board, in the centre of its grid. */
export interface BoardCharacter {
	/** Folder (relative to the static root) holding manifest.json + frame PNGs. */
	basePath: string;
	/** Animation to play in place. Defaults to `idle`. */
	animation?: string;
	/**
	 * Character definition id (matches `public/characters/<id>/definition.json`). When set,
	 * its `directions` bindings drive the move-left/move-right animations used while
	 * combat walks the actor; without it both fall back to `run`.
	 */
	id?: string;
}

/** A character placed on a specific board cell. */
export interface PlacedCharacter extends BoardCharacter {
	/** Column (q) of the cell to stand on. Sign must match the grid's half. */
	q: number;
	/** Row (r) of the cell to stand on, counted down the screen. */
	r: number;
}

/** One half of the board: its border colour and the characters standing on it. */
export interface BoardGrid {
	/** Grid line / fill colour, e.g. 0xff0000 for red. */
	color: number;
	/**
	 * The half's lead character. Give it `q`/`r` to stand it on a specific cell;
	 * without them it takes the half's default lead cell ({@link LEAD_CELLS}).
	 */
	character: BoardCharacter | PlacedCharacter;
	/**
	 * Extra characters standing idle on this half of the board, each pinned to its
	 * own cell. They loop their animation in place until combat walks them.
	 */
	extras?: PlacedCharacter[];
}

export interface MugenBoardOptions {
	grids: [BoardGrid, BoardGrid];
	/** Width of a single grid cell, in pixels — which on a square field is its height too,
	 * and how far apart two neighbours' centres stand. Every cell is this size. */
	cellSize?: number;
	/** Outer padding around the grid, in pixels. */
	padding?: number;
	/** Colour of the central column (q = 0), the shared ground between the halves. */
	centerColor?: number;
}

const DEFAULTS = {
	// A cell's width in canvas px. Six columns of it is the whole board's width, so this is
	// what decides the canvas's resolution: enough that the board — which is sized to the
	// viewport it is drawn in ({@link VIEWPORT_WIDTH}) — is nearly always being scaled
	// *down* rather than up, which is what keeps the pixel art crisp.
	cellSize: 220,
	padding: 40,
	centerColor: 0xffffff // white
};

// --- Board layout (a field of squares) --------------------------------------
// The grid is drawn face-on: no tilt, no vanishing point, no per-row scaling.
// A cell is the same square of `cellSize` px wherever it sits, so a
// character keeps its size wherever it walks, because there is no depth for it to
// walk into. Where a cell *is* comes from the grid module — `cellCenter`,
// `cellFoot` and `cellCorners`, all in cell widths off the grid's top-left corner —
// so the only arithmetic here is the scale by `cellSize` and the translation into
// the canvas ({@link MugenBoard.project}). Cells left of centre are the first
// grid's colour, cells to the right the second's.

// The colour every line of the grid is drawn in ({@link GRID_LINE}) is the same red the
// canvas's callouts, guards and sparks are tinted with, and is read off the one table
// rather than written out again beside it: the lattice is not a side's marking, it is the
// board itself, so it is one colour all the way across and that colour is combat's own red.

// --- The ground the fight is fought on ---------------------------------------------
//
// Every cell of the field is laid with grass instead of being left a bare ruled square:
// one small tile off the sheet vendored in `@3xl/assets` (`public/tiles/`), repeated
// across each of them. It is ground rather than a marking, so it is the same ground on
// both halves and in the column between them — what a cell belongs to is said by the
// lattice ruled over it and by what stands on it, and never by the earth.
//
// What is taken is the sheet's **first row**, which is where its plain grass is: seven
// squares that differ only in where the blades fall, on a page that goes on to flowers,
// sand, water and shrubs. One of the seven is drawn into each square of the ground, picked
// at random, so a field of a hundred and eight of them is grass rather than one stamp
// repeated a hundred and eight times.

/** The vendored sheet the ground tiles are cut from. */
const GROUND_TILE_SHEET = '/assets/tiles/j-treecko252/assorted-ground.png';

/** The sheet's pitch: it is ruled into squares this size from its top-left corner. */
const GROUND_TILE_PX = 16;

/**
 * How many of the first row's tiles are plain grass, counted from the left: the seven the
 * ground may be laid with. The eighth is where the row starts turning into the dithered
 * ground that borders on something else, and is not one square of grass among others.
 */
const GROUND_TILE_CHOICES = 7;

/**
 * How many of those tiles a cell is laid with, across and down — nine to a cell, three
 * each way. It is what decides how large the artwork's own pixels are drawn, the cell
 * being a fixed size, and it is a whole number so that every cell's grass begins on a tile
 * corner and the field reads as one ground rather than as squares of turf laid side by
 * side.
 *
 * It is also the subdivision the ground is *ruled* into ({@link ruleGround}): one tile per
 * bordered subcell, so the two can never say different things about where a tile ends.
 */
const GROUND_TILES_PER_CELL = 3;

/**
 * The yellow the ground's own subdivision is ruled in — read off the same table the
 * lattice's red comes from, so the board is drawn in combat's colours and not in colours
 * of its own. It is the finer of the two rulings and is drawn under the red: a cell is the
 * thing the fight is played on, and its nine tiles are the ground inside it.
 */
const GROUND_LINE = combatColorHex('yellow');

/** Below the ruled lattice (0), and so below everything that stands on the board. */
const GROUND_Z = -1;

/** Between the two: over the grass it rules, under the lattice that rules the cells. */
const GROUND_LINE_Z = -0.5;

/** One of the squares a cell's ground is divided into, in screen px: a tile of grass and
 * the yellow border round it, which are the same rectangle ({@link MugenBoard.groundSquares}). */
interface GroundSquare {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The viewport the canvas is sized against, across and down.
 *
 * The board takes the whole of whichever of the two runs out first and its aspect ratio
 * decides the other, so it is as big as it can be drawn without any of it going off screen:
 * `width: min(100vw, 100dvh × aspect)`, with the height left to follow. There is nothing to
 * leave room for — the board is the whole view, drawn on a sheet that takes the viewport and
 * keeps nothing back, and the score, the way out and whatever the fight has to say are drawn
 * *over* it rather than around it.
 *
 * A pair of maxima with no size asserted is not the same thing and was the bug: a canvas has
 * an intrinsic size, so it shrinks to fit inside two caps but never grows to reach either.
 * A framebuffer smaller than the screen was then drawn at its own pixel size with a band of
 * room all round it, which is board nobody gets. The size is stated instead, and stated only
 * once the crop has settled the framebuffer, since the crop is what the aspect ratio is read
 * off ({@link MugenBoard.sizeToViewport}).
 *
 * `dvh` rather than `vh` so a phone's collapsing address bar moves the measure with it
 * instead of leaving the foot of the board under it.
 */
const VIEWPORT_WIDTH = '100vw';
const VIEWPORT_HEIGHT = '100dvh';

// The whole board is on screen, always, and there is no property left for a host to say
// otherwise. There was one — `--board-bleed`, a multiplier on the width term that let a
// narrow view push a column's width off the sides, half at either edge, and draw the rest a
// fifth larger for it. It was affordable because the board's two outermost columns were the
// only ground no lane was played across, so what went off the screen was the ground that
// counted least. Those columns are gone from the field itself now (`grid.ts`), which is the
// same saving taken properly: every column that is left is one a lane is fought over, and
// half of one hanging off the edge of the view would be half a duel.

// --- The room over the fighters' heads ---------------------------------------
// A character plants its feet on its cell's foot line and stands taller than the cell
// ({@link CHAR_HEIGHT_RATIO}), so a fighter on the topmost lane reaches up out of the row
// it stands on — and the things that reach highest are not even drawn when the canvas is
// sized: a pose is not the height of the cycle it belongs to, an aura envelops the whole
// sprite, and a character's own `renderScale` rides along on the fit.
//
// The board keeps a row above the lanes for exactly that (`grid.ts`'s FIRST_LANE_ROW),
// so the room is board rather than empty canvas: a fighter on the top lane rises into
// ground that is part of the board and is drawn like the rest of it. A strip of blank
// canvas reserved over the grid did the same job invisibly, and cost the same height —
// but the canvas is scaled to fit its box, so that strip was board the fight did not get,
// spent on nothing anybody could see.

// --- The coordinate gutter (a chessboard's letters and numbers) ---------------
// A cell is still named the way a chess square is — its column's letter and its row's
// number, `columnLabel`/`rowLabel` — but the names are not drawn on the board any more.
// They were printed along two edges, a letter under each column and a number beside
// each row, in a gutter a third of a cell wide taken off the left-hand side and out of
// the bottom. Nothing in the game is played by naming a cell: an order is given by
// tapping a fighter, and where it then walks is watched rather than read off a
// coordinate. So the band was a third of a cell of canvas spent on a reading nobody
// takes, and on a board scaled to fit its box that is a third of a cell the fight
// itself does not get. The names live on in `grid.ts`, where the combat log still
// says which cell a fighter moved to.

/** Horizontal speed (canvas px/s) a character runs between cells during combat. */
const MOVE_SPEED = 260;
/** Frames of an aura animation (static/auras/<color>/1..N.png). */
const AURA_FRAMES = 4;
/** How long each aura frame shows (ms). */
const AURA_FRAME_MS = 120;
/** How far the aura flame overhangs the character it envelops, per axis: the
 * flame is stretched to this multiple of the actor's nominal display size. */
const AURA_WIDTH_RATIO = 1.7;
const AURA_HEIGHT_RATIO = 1.25;
/**
 * How long the flame takes to well up from the fighter's feet to its full height.
 *
 * An aura is not a thing that switches on — it is the fighter having loaded, and that
 * is an act, so it is drawn as one: the flame comes up off the ground it is standing
 * on and reaches its height. Short enough to be over inside the beat the orders are
 * read out in ({@link CombatController}'s reveal), because it is what *says* the
 * fighter loaded and cannot still be arriving once the shooting starts.
 */
const AURA_RISE_MS = 320;
/** How much of its width the flame starts with, as it leaves the ground. Not zero:
 * a flame that grew from a point reads as a spark rather than as fire coming up, and
 * one that came up at full width is a flat smear across the feet on its first frames. */
const AURA_RISE_WIDTH = 0.7;

/**
 * Where each half's lead character stands when its grid doesn't say: the middle
 * row of each side's outer column, red facing blue across the board. A grid
 * overrides this by giving its `character` `q`/`r` of its own.
 */
const LEAD_CELLS: [Cell, Cell] = [
	{ q: FIRST_COLUMN, r: MIDDLE_ROW },
	{ q: LAST_COLUMN, r: MIDDLE_ROW }
];

/** The cell a half's lead character stands on: its own `q`/`r`, or `fallback`. */
const leadCell = (grid: BoardGrid, fallback: Cell): Cell =>
	'q' in grid.character ? { q: grid.character.q, r: grid.character.r } : fallback;

/** A cycle's loaded frames as {@link crownCorrection} reads them — the correction is
 * canvas work over pixels, so it knows nothing of Pixi's textures. */
const crownFrames = (frames: LoadedFrame[]): CrownFrame[] =>
	frames.map((frame) => ({
		source: frame.texture.source.resource,
		width: frame.width,
		height: frame.height,
		anchorX: frame.anchorX
	}));

// --- Order buttons (drawn on the board, in the column between the two lines) -----
/**
 * What a button in a column is *sized* by: a cell split this many ways. Not how many a
 * column holds — the column runs as long as the list it is handed — but it is the same
 * three now, a fighter being given the three orders there are (charge, defend, shoot),
 * and the size says so: three buttons and the two gaps between them are one cell tall,
 * less the room left around them ({@link ORDER_PAD_RATIO}), so a column of orders is the
 * cell it stands in and the ruled lines around it are its own edges.
 *
 * It was four — the three orders and, over them, a slot for what the fighter's colour did
 * of its own accord, which left the three at three quarters of a cell and a quarter of it
 * empty at the top once that slot came off (what a colour grants is said in the corner of
 * the order it hands over free, {@link BoardOrder.gift}). Nothing is held there now, so
 * nothing is kept for it.
 */
const ORDER_COLUMN_COUNT = 3;
/** Gap between buttons in a column, as a fraction of a button's height. */
const ORDER_SPACING_RATIO = 0.12;
/**
 * Room left around a whole column of orders, as a fraction of a cell's side — taken off
 * every side of it, so the buttons stand *inside* their cell rather than on its lines.
 *
 * A column drawn flush to the ruled square reads as part of the board, and the two lanes
 * a fighter is not in are a button's width away from the one it is: what a group of three
 * needs to be is plainly one group, told from the grid it stands on and from the group
 * above and below. Taken out of the buttons rather than added around them, since the cell
 * is what there is — so padding a column makes its buttons smaller and never makes it
 * spill into a neighbour's.
 */
const ORDER_PAD_RATIO = 0.07;
/** A button's height as a fraction of a cell's side: the count and the gaps above,
 * solved so that many buttons and the gaps between them span one whole cell, and the
 * padding taken off both ends of that cell first. */
const ORDER_HEIGHT_RATIO =
	(1 - 2 * ORDER_PAD_RATIO) /
	(ORDER_COLUMN_COUNT + (ORDER_COLUMN_COUNT - 1) * ORDER_SPACING_RATIO);
/** The glyph's size inside a button, as a fraction of the button's height. */
const ORDER_ICON_RATIO = 0.62;
/** Corner rounding, as a fraction of a button's height. */
const ORDER_RADIUS_RATIO = 0.22;
/** Fill of a button nobody has chosen, and of one that cannot be chosen. */
const ORDER_IDLE_FILL = 0x1f2937;
const ORDER_DISABLED_FILL = 0x374151;
/** How far the glyph on a disabled button fades toward its background. */
const ORDER_DISABLED_ALPHA = 0.35;
/** Face of a button drawn inside out — white, so the glyph on it can carry the fighter's
 * colour and read against it wherever on the board the fighter walks. A colour drawn
 * straight over a sprite is a smudge; over white it is a colour. */
const ORDER_INVERTED_FILL = 0xffffff;
/** How far an empty slot's outline fades. Enough to hold the place and say a slot is
 * there, not enough to read as a button with nothing in it. */
const ORDER_EMPTY_ALPHA = 0.3;

// --- The gift dot (drawn in the corner of an order a fighter's colour hands it free) ---
/** The dot's radius, as a fraction of a button's height. Small: it is a mark *on* a
 * button, and must never come to read as something the button itself is. */
const GIFT_DOT_RATIO = 0.16;
/** How thick the ring round the dot is drawn, in canvas px. The ring is the whole of what
 * keeps the dot readable on a button filled with the very colour the dot is drawn in. */
const GIFT_DOT_RING = 2;

// --- Icon rasterisation (every glyph any of the above draws) ---
/**
 * The square each icon SVG is rasterised into, in px, before anything draws it.
 *
 * An SVG is resolution-independent right up to the moment something turns it into pixels,
 * and then the size it is turned into is the only resolution it will ever have. Pixi
 * rasterises one at its *intrinsic* size — whatever the file's own `width`/`height` say —
 * so leaving that to the file means leaving the artwork's resolution to an attribute
 * written for some other purpose entirely. The three glyphs the board draws had
 * `width="1em"`, which is 16px in a standalone document: they were being baked into 16×16
 * bitmaps and then drawn at three times that. Hence "fuzzy as fuck" — every one of them
 * was a 16-pixel picture blown up. (Those three have since been put back into the form
 * their 4,180 siblings are in, `viewBox` and a white fill and nothing about size, but the
 * lesson is that the *board* should name the resolution it wants rather than inherit one.)
 *
 * 256 is a generous square for it: the largest anything draws one of these at is about
 * 48px (an order button's glyph, a gift mark's), so there is resolution to spare for a
 * high-dpi screen, and it is a power of two, which is what the mipmap chain that keeps
 * the downscale from shimmering wants. Square, because the artwork is
 * (`viewBox="0 0 512 512"` throughout the set) — and one that is not simply sits centred
 * inside the square, undistorted, since an SVG scaled into a box keeps its aspect ratio.
 */
const ICON_RASTER_PX = 256;

// --- The sparks a blow that got through throws ---
// The same spray a guard throws, with the sign flipped, and that is the whole difference
// between the two: they leave the same struck side of the same fighter, in the same
// attacker's colour, at the same speeds. A guard turned the blow around, so its sparks come
// back off the shield at whoever swung; nothing turned this one, so its sparks carry on the
// way the blow was going — through the fighter that took it and out the far side.
//
// It was two bold strokes crossing at the fighter's middle, an X, which was a mark ABOUT
// the hit rather than the hit happening: a shape that was never on the board a moment
// earlier and reads as annotation, drawn at the one instant the picture had least need of
// being told anything (a fighter is visibly reeling and going down).
/** How many are thrown, in the one burst. A blow landing is a moment and not a state, so
 * where a guard strikes a few every tick for as long as it is up, this is all of them at
 * once — about what a guard throws over the length of a strike. */
const HIT_SPARKS = 90;

/** What a fighter that has been taken down is drawn at as it falls back, and for the rest
 * of the fight. Barely off full: it is out of the game and not off the board, and the mark
 * that says so is the ground it retracts to. */
const DEFEATED_ALPHA = 0.9;

/** How far a cell's callout is lifted clear of the heads of whoever is standing in it,
 * in cells. Small: it is meant to sit just over the pair it is about. */
const CELL_CALLOUT_GAP = 0.08;

// --- The guard ring (drawn around a fighter holding its defend stance) ---
/** The ring's radius, as a fraction of half the character's longer nominal side. A little
 * over one, so the circle stands clear of the sprite instead of cutting across it. */
const GUARD_RING_RATIO = 1.08;
/** How thick the ring is drawn, in canvas px — read against a cell's 220. */
const GUARD_RING_WIDTH = 5;
/**
 * How much of the circle a guard actually is: a third of it, centred on the blow.
 *
 * A guard is held up *at* something. Drawn all the way round, it was a bubble the fighter
 * was inside — which says the same thing about the side nothing is coming from as about
 * the side a blow is arriving on, and a shield held behind your back is not a shield. The
 * third that is drawn is the third the attacker is standing in front of, so the mark says
 * both that the fighter is covering and which way it is covering.
 */
const GUARD_ARC_SHARE = 1 / 3;

// --- The sparks a guard throws off (in the attacker's colour) ---
/** How often a guard that is up strikes sparks, in ms. */
const SPARK_EVERY_MS = 26;
/** How many are struck each time. A shower rather than a handful — a blow coming off a
 * shield throws a spray, and at two or three a strike it read as a few dots leaving. */
const SPARK_PER_STRIKE = 20;
/** How long one lives before it has gone, in ms. Long enough to be watched leaving: a
 * spark that goes out a hand's breadth from the shield never looks like it was thrown. */
const SPARK_LIFE_MS = 850;
/** How fast one leaves the arc, in canvas px per second, and how much of that figure it
 * may be off by either way (0.5 = anywhere from three quarters to five quarters). */
const SPARK_SPEED = 480;
const SPARK_SPEED_SPREAD = 0.5;
/** How far off the surface it left by a spark may fly, in radians either way. A quarter
 * turn would be a spark running along the shield rather than coming off it. */
const SPARK_SPREAD = Math.PI / 5;
/** What pulls one down as it flies, in canvas px per second per second — so a spark
 * arcs over and falls instead of flying off in a straight line for ever. Light against
 * the speed it leaves at: the throw is what is being watched, and a spark that turned
 * and dropped in the first third of its life would never get clear of the shield. */
const SPARK_GRAVITY = 300;
/** How big one is drawn, in canvas px. */
const SPARK_SIZE = 4;

interface Point {
	x: number;
	y: number;
}

/** A one-shot combat animation currently playing (a strike or a flinch). */
interface OneShot {
	/** Total duration (ms) of one full pass of the animation. */
	total: number;
	elapsed: number;
	/** Resolves when the animation finishes and the actor returns to idle. */
	resolve: () => void;
}

/**
 * A combat aura burning behind an actor — the color it throws this round.
 * Frames come from static/auras/<color>/ (scripts/generate-auras.js) and loop
 * for as long as the aura is shown.
 */
interface Aura {
	sprite: Sprite;
	frames: Texture[];
	frameIndex: number;
	frameElapsed: number;
	/** The size the flame settles at, once it is all the way up — what the rise below
	 * is a fraction of, kept here because the sprite's own scale is mid-rise. */
	scaleX: number;
	scaleY: number;
	/** How far into {@link AURA_RISE_MS} the flame is. It only ever counts up, and at
	 * the end of it the aura is simply burning. */
	rise: number;
}

/**
 * The guard drawn round a fighter turning a blow aside: the arc itself, the way it is
 * pointing, and what is needed to go on striking sparks off it.
 *
 * Which way it points is settled once, when the guard goes up, and never re-read: the
 * attacker has already walked up by then and stands there for as long as the blow lasts,
 * and a mark that swung about as two fighters shifted would be a thing being aimed rather
 * than a thing being held.
 */
interface GuardRing {
	graphics: Graphics;
	/** Screen angle from the middle of the fighter to the middle of the attacker, in
	 * radians — the direction the arc is centred on and the sparks come off. */
	facing: number;
	/** The attacker's colour: a spark is struck off the guard by the blow, so it belongs
	 * to whoever threw the blow and not to whoever is holding the shield. */
	sparkColor: number;
	/** ms since the last sparks were struck (see {@link SPARK_EVERY_MS}). */
	sinceSpark: number;
}

/**
 * One spark thrown off a guard. It owns nothing and is owned by nothing: struck from a
 * point on the arc, it flies, falls, fades and is gone — and it outlives the guard it came
 * off, because a spark already in the air is not part of the mark that made it.
 */
interface Spark {
	graphics: Graphics;
	/** Canvas px per second, on each axis; the vertical one is pulled on as it flies. */
	vx: number;
	vy: number;
	elapsed: number;
}

/**
 * One order a fighter can be given, drawn as a button beside it. The board knows
 * nothing about what an order *means* — it draws what it is handed and reports which
 * one was tapped, by the caller's own id.
 */
export interface BoardOrder {
	/** The caller's id for this order, handed back when the button is tapped. */
	id: string;
	/** URL of the glyph drawn inside the button (an SVG under /assets). The artwork
	 * must be white: it is tinted, and tinting only ever darkens. */
	icon: string;
	/** Drawn as the chosen one, filled with {@link color}. */
	selected: boolean;
	/** Drawn greyed, and taps on it are ignored. */
	disabled: boolean;
	/**
	 * Drawn but never reported: no pointer, no cursor, taps pass through it. A column of
	 * these is a reading of a fighter rather than a way of commanding one — which is what
	 * a rival's orders are, since they are shown only once they have been carried out.
	 */
	readonly?: boolean;
	/**
	 * A slot rather than an order: an outline where a button would be, holding a place in
	 * the column for something that may yet go in it. No glyph is loaded and nothing is
	 * filled, so {@link icon} is not read and neither `selected` nor `disabled` says
	 * anything. Never reported, whatever `readonly` says.
	 */
	empty?: boolean;
	/**
	 * The fighter's combat colour, which this button is drawn in: filling it when it is
	 * the chosen one, and carrying its glyph when it is {@link inverted}. Its own, not its
	 * side's — six fighters carry a column, and two colours could only say which half of
	 * the board an order belonged to, which is the one thing the column's own position
	 * already says. A fighter's colour is what the rest of its marks are drawn in, its aura
	 * and its callouts, so every mark on the board saying something about one fighter says
	 * it in one colour.
	 */
	color: string;
	/**
	 * Turn the button inside out: a white face carrying the glyph in {@link color}, rather
	 * than a dark face carrying a white one.
	 *
	 * For a mark that is not an order — something about the fighter that happens to be
	 * drawn in the same shape, and has to read as a different kind of thing from the orders
	 * at a glance and without being read. `selected` still wins, and turning it the right
	 * way up again is what says the mark has come to something.
	 */
	inverted?: boolean;
	/**
	 * Mark this button's corner with a dot in {@link color}: this is an order the fighter's
	 * colour hands it for free, and not one it has to be given.
	 *
	 * It goes *on* the button rather than beside it because a gift is one of these very
	 * three orders — the same picture, had for nothing — so the thing to say it about is
	 * that order itself, in the corner of it, and there is nowhere else on the board a
	 * reader has to look to find out what a colour is worth.
	 */
	gift?: boolean;
}

/** One drawn mark — an order button — kept so its look can be updated without rebuilding
 * it. Everything drawn on this board in this shape is one of these, and goes through one
 * painter. */
interface BoardMark {
	id: string;
	container: Container;
	face: Graphics;
	glyph: Sprite;
	selected: boolean;
	disabled: boolean;
	/** Combat colour name for the chosen fill. */
	color: string;
	/** An outlined place-holder rather than a button. */
	empty: boolean;
	/** Drawn inside out: white face, glyph in the fighter's colour. */
	inverted: boolean;
	/** Carries a dot in its corner: this order is one the fighter's colour gives free. */
	gift: boolean;
}

/** The drawn size of one mark: its face, and the gap to the next one along. */
interface MarkSize {
	width: number;
	height: number;
	gap: number;
}

/** Which of a cell's two ruled sides a column of orders stands flush inside. */
export type OrderSide = 'left' | 'right';

/**
 * Which cell of the board a column of orders stands in — always on its fighter's own row,
 * so a lane's orders are read across the lane, but not necessarily in its fighter's own
 * ground:
 *
 * - `center` — the middle column, the ground neither side holds and both are playing for.
 *   Orders hung there stand still while the fighter they belong to walks off to fight.
 * - `fighter` — the very cell the fighter is standing on, so its orders are *on* it. They
 *   go where it goes, by the cell: a fighter that steps into the middle column to strike
 *   takes them with it and puts them back on the way home.
 */
export type OrderCell = 'center' | 'fighter';

/** Where a fighter's column of orders is put: which cell, and which side of it. */
export interface OrderPlacement {
	cell: OrderCell;
	side: OrderSide;
}

/** The column of order buttons standing for one fighter. */
interface OrderStrip {
	container: Container;
	buttons: BoardMark[];
	placement: OrderPlacement;
}

/** A character standing (and, during combat, running) on the board. */
interface Actor {
	/** Stable id (character id or basePath's first segment), used to command it. */
	id: string;
	/** The frames folder this actor's artwork comes out of — the two sides can field the
	 * same one, which is what makes it the actor's asset identity rather than its own. */
	basePath: string;
	/** The animations this actor was **not** placed with — everything a fight can ask of it
	 * beyond standing there ({@link boundAnimations}) — so the warm running behind the
	 * finished board knows what to hand it. */
	pendingAnimations: string[];
	sprite: Sprite;
	/** Which half the actor belongs to — the grid it was placed from, not the cell it
	 * is standing on: a fighter that has taken the white column still belongs to its
	 * own side, and must never be read as having changed halves. */
	side: CellSide;
	/** The cell the actor started on, so it can walk back after combat. */
	homeColumn: number;
	homeRow: number;
	/** Every loaded animation for this actor, keyed by name (idle, run, …). */
	animations: Record<string, LoadedFrame[]>;
	/**
	 * Screen px to move this fighter by so that its crown — the middle of the highest
	 * painted pixels of the pose it stands in ({@link paintedCrown}) — lands on the
	 * middle of whatever cell it is standing on, rather than its MUGEN axis doing so.
	 * Zero for a character whose head is already over its axis, and for one whose
	 * artwork could not be read.
	 *
	 * Held per actor rather than applied per frame: the axis is what aligns a cycle's
	 * frames to each other, so it goes on doing that, and this moves the whole fighter
	 * by one fixed amount. Already mirrored for the half it stands on, so it is simply
	 * added to a cell's standing mark ({@link MugenBoard.standPoint}).
	 */
	crownShift: number;
	/** Raw manifest anim key of the hurt flinch (movement animation), or `''`. */
	hurtAnim: string;
	currentName: string;
	frameIndex: number;
	frameElapsed: number;
	// Movement. Actors step cell to cell; `column`/`row` are the ones currently
	// occupied. Movement is programmatic (combat) via `pathQueue`.
	/** Row (r) the actor currently occupies. */
	row: number;
	/** Column (q) the actor currently occupies. */
	column: number;
	/** Raw manifest animation played while running right / left (from the JSON). */
	moveRightAnim: string;
	moveLeftAnim: string;
	/** Remaining cells to step through (programmatic movement). */
	pathQueue: Cell[];
	/**
	 * When set, the walk's final step targets this exact screen point instead of
	 * the last cell's standing mark — e.g. a fighter's half of a shared duel cell.
	 */
	finalTarget: Point | null;
	/** Called once the path queue empties. */
	onArrive: (() => void) | null;
	/** While set, a one-shot animation owns playback (movement/idle suspended). */
	oneShot: OneShot | null;
	/**
	 * A raw manifest animation name the actor **stands in** instead of idling — the guard a
	 * fighter braces into on a blow and holds for the rest of the turn. Unlike a
	 * {@link oneShot} it owns nothing: a walk still walks and a pose still plays over it,
	 * and it is what the actor comes back to when either finishes, rather than idle. Null
	 * when the actor simply stands (see {@link MugenBoard.holdMove}).
	 */
	stance: string | null;
	/** The looping combat aura shown behind the actor, or null. */
	aura: Aura | null;
	/**
	 * The ring drawn around the actor while it holds a {@link stance}, or null. It says
	 * the stance is *on* — a pose alone is a frame of animation, and a fighter braced
	 * against a blow looks much like one caught mid-swing.
	 *
	 * It is put up **after** the stance rather than with it ({@link MugenBoard.ringHold}),
	 * because the two say different things: the pose is the fighter's own doing and can
	 * stand from the moment the order was given, while the ring is the guard *catching*
	 * something and belongs to the moment there is a blow for it to catch. They come down
	 * together, though — a stance let out of is a stance nothing can be saying is on
	 * ({@link MugenBoard.clearHold}).
	 *
	 * A third of a circle rather than a circle, facing whoever is swinging (see
	 * {@link GUARD_ARC_SHARE}), and throwing sparks in that fighter's colour for as long as
	 * it is up.
	 */
	ring: GuardRing | null;
	/** Floating callout (what its turn amounted to) above the actor, so a turn every
	 * fighter acts in at once can be read one fighter at a time. Null when clear. */
	label: Text | null;
	/** The column of order buttons drawn beside this fighter, or null when it commands
	 * nothing (every rival, and the player's side once the fight is over). */
	orders: OrderStrip | null;
	/** Nominal on-screen size (px) of the character at its fit scale, measured
	 * from its base animation frames; sizes the aura that envelops it. */
	displayWidth: number;
	displayHeight: number;
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	moving: boolean;
	/** Direction of the in-progress step: -1 left, +1 right, 0 when stationary. */
	stepDir: number;
	/**
	 * Whether this fighter has been taken down ({@link MugenBoard.fadeDefeated}). Once on
	 * it never comes off, and it says two things about how the actor is drawn from then on:
	 * it carries {@link DEFEATED_ALPHA}, and it stands at the outer end of its cell rather
	 * than in the middle of it ({@link MugenBoard.standPoint}).
	 */
	defeated: boolean;
}

/** The grid's own four edges in stage coordinates — the rectangle it occupies, which is
 * the whole of what {@link contentCrop} is given. */
export interface GridSpan {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The canvas the board is drawn on: where to put the stage's origin, and how big to make
 * the framebuffer. **It is the grid and nothing else, on both axes** — the field's own
 * edges, no margin, nothing reserved beside them or over them. The board runs corner to
 * corner of its canvas.
 *
 * The canvas is scaled to fit its box, so every pixel of canvas that is not board is scale
 * the board does not get: a strip kept clear down one side, or a band left empty above the
 * top row, is the whole grid drawn smaller for it. Anything a fighter needs room for is
 * therefore given as *board* — the row above the lanes, which is cells and is drawn —
 * rather than as canvas held back for it.
 *
 * Cutting to what is *drawn* instead would hand that room to whichever fighter happens to
 * be standing furthest out on the frame the crop is taken in, which is both wasteful and
 * arbitrary: the same board would be a different size depending on who was mid-swing when
 * it was measured. The grid's edges are geometry and are the same every frame.
 *
 * What that costs is real and is the trade being made: a sprite wider than its cell on an
 * outer column, and anything reaching above the board's own top row, are clipped at the
 * canvas edge rather than given room outside it. (The columns of orders are not among
 * them any more — they stand inside the central column, which has a half of the board on
 * either side of it.)
 * Every column of the field is an outer one now bar the white middle (`grid.ts`), so that
 * first case is the two lines standing where they open rather than a corner of the board
 * nobody uses — a limb that sweeps most of a cell to one side loses its far end at the
 * edge, which is the same overlap the board is drawn with everywhere else, taken at the
 * one place there is nothing beyond to overlap.
 *
 * One thing is cut here on purpose: a fighter that has been beaten stands half a cell
 * further out than it fought, so this edge takes half of it ({@link MugenBoard.fallenDrift}).
 * That is the whole of what the drift is for, and it is why it is half a cell and not more.
 */
export function contentCrop(span: GridSpan): {
	left: number;
	top: number;
	width: number;
	height: number;
} {
	const left = Math.floor(span.left);
	const top = Math.floor(span.top);
	return {
		left,
		top,
		width: Math.ceil(span.right) - left,
		height: Math.ceil(span.bottom) - top
	};
}

/**
 * Renders the board — a field of squares, drawn face-on — on a PixiJS
 * canvas. Cells left of centre take the first grid colour, cells to the right the
 * second, and the shared central column the centre colour. Two MUGEN characters loop
 * (idle by default) standing upright, one on each half.
 *
 * Nothing is tilted: a cell is the same square wherever it is on the board, so a
 * character's size says something about the character and nothing about where it
 * stands, and walking it forward neither resizes it nor moves it toward a vanishing
 * point. The only thing depth still decides is paint order — a row further down the
 * screen draws over the row above it, which on a field of squares is a fighter standing
 * in front of the one squarely behind it rather than between two of them.
 *
 * Frame decoding happens at build time (scripts/generate-sprites.js); this
 * class only lays out the grid and plays the loaded frames. All rendering
 * state lives here so the Svelte component stays UI-only.
 */
export class MugenBoard {
	private readonly options: Required<MugenBoardOptions>;
	private app: Application | null = null;
	// Set the moment teardown starts, so a boot already in flight can bail out
	// instead of resurrecting a destroyed board.
	private destroyed = false;
	private actors: Actor[] = [];
	/** Every spark in the air — thrown off a guard, or raining over a fighter a blow got
	 * through to — flown and faded each tick until they expire. One heap and not one per
	 * guard or per hit: a spark belongs to nobody once it has been struck (see
	 * {@link Spark}). */
	private sparks: Spark[] = [];
	/** The dot every one of them is drawn from, built on first use (see {@link sparkArt}). */
	private sparkContext: GraphicsContext | null = null;
	/** Callouts pinned to a cell rather than to a fighter (see {@link showCellCallout}).
	 * A fighter's own is held on the actor, which is what takes it down; these have
	 * nobody, so the board keeps them until the turn's callouts are cleared. */
	private cellLabels: Text[] = [];
	/** Colour overlays on claimed cells, keyed by "q,r". */
	private cellPaint = new Map<string, Graphics>();
	/** Loaded aura frame textures, keyed by aura color name. */
	private auraTextures = new Map<string, Texture[]>();
	/** The grass tiles a square of ground may be laid with, cut from the sheet's first row
	 * on the way in ({@link loadGround}) — empty if it could not be had. Held so they can be
	 * freed with the board: they are built here rather than fetched through `Assets`, so
	 * nothing else is keeping them. */
	private groundTextures: Texture[] = [];
	private iconTextures = new Map<string, Texture>();
	/**
	 * A cycle's crown offset in the artwork's own pixels ({@link crownOffset}), keyed by
	 * frames folder and animation.
	 *
	 * Reading it is a canvas read per frame of the cycle, and a mirror match fields the
	 * same character on both halves of the board — which is the same artwork asked the same
	 * question twice, for an answer that is a fact about the character and not about where
	 * it is standing. Kept per board rather than for the page: the textures it is read off
	 * belong to this app, and a board built again is cheap to read again.
	 */
	private crownOffsets = new Map<string, number>();
	/**
	 * Everything a fight will call for that the opening board did not need — the walk
	 * cycles, the flinch, every move — on its way in behind the finished picture. See
	 * {@link whenReady}, which is what holds a turn until it has landed.
	 */
	private warming: Promise<void> = Promise.resolve();
	/** What to call when an order button is tapped; set by {@link onOrder}. */
	private orderHandler: ((actorId: string, orderId: string) => void) | null = null;

	constructor(options: MugenBoardOptions) {
		this.options = { ...DEFAULTS, ...options };
	}

	/**
	 * Total canvas size: the grid's own extent at `cellSize` px to the cell width
	 * ({@link BOARD_WIDTH}, {@link BOARD_HEIGHT}, which on a field of squares is the count
	 * of columns and the count of rows), plus the padding around it.
	 *
	 * This is the size the board is *laid out* at, not the size it is seen at: the canvas
	 * is cropped to the grid once everything is on it ({@link MugenBoard.fitToContent}) and
	 * then scaled to fit its box, so what these figures decide between them is the board's
	 * proportions and its resolution. The padding is room to draw in during the layout, and
	 * the crop takes it back off — nothing is reserved around the finished board.
	 */
	get dimensions(): { width: number; height: number } {
		const { cellSize, padding } = this.options;
		return {
			width: padding * 2 + cellSize * BOARD_WIDTH,
			height: padding * 2 + cellSize * BOARD_HEIGHT
		};
	}

	/** Screen x of the grid's left edge. */
	private get gridLeft(): number {
		return this.options.padding;
	}

	/** Screen y of the grid's top edge. */
	private get gridTop(): number {
		return this.options.padding;
	}

	/** Boot Pixi inside `container`, draw the grids and start the game loop. */
	async start(container: HTMLElement): Promise<void> {
		const { width, height } = this.dimensions;

		// The whole cast, fielded in the order the two lines are drawn in.
		const cast = [
			this.options.grids[0].character,
			this.options.grids[1].character,
			...(this.options.grids[0].extras ?? []),
			...(this.options.grids[1].extras ?? [])
		];

		// Asked for **before** the renderer is booted, and awaited after it. Creating a
		// WebGL context is a tenth of a second the machine spends on its own, and every
		// file below has to come off the network — two waits that have nothing to say to
		// each other, and were being taken one after the other for no reason beyond the
		// order the lines were written in. Nothing here touches the app.
		const standing = this.warmStanding(cast);
		// And the ground with them, for the same reason and on the same terms: a file off
		// the network, asked for before the context is built and taken in hand after it.
		const ground = this.loadGround();

		const app = new Application();
		await app.init({
			width,
			height,
			backgroundAlpha: 0,
			// On, for the drawn shapes: the marks' rounded corners, the guard rings
			// and the sparks are all geometry with a curve or a diagonal in them, and with
			// this off every one of those edges is a staircase — which the scaling this canvas
			// then goes through smears into a soft fringe rather than tidying up. It costs the
			// characters nothing: a sprite is an axis-aligned quad, and how its artwork is
			// sampled is its texture's own business (`nearest`, set per frame sheet), not this.
			antialias: true,
			roundPixels: true
		});
		// The host can unmount while the boot is in flight (combat closed as it opens).
		// Without this the app would be created after destroy() had already run,
		// stranding a WebGL context and a render loop nothing can reach — and browsers
		// only allow a handful of contexts, so enough strays force-lose the oldest live
		// one and blank whatever canvas that was.
		if (this.destroyed) {
			destroyPixiApp(app);
			return;
		}
		this.app = app;
		// Sort stage children by zIndex so characters further down the screen (larger
		// rows, larger screen-y) paint over those standing behind them.
		app.stage.sortableChildren = true;
		// Order buttons live on the board, so the stage has to be hit-tested for taps.
		app.stage.eventMode = 'static';
		// Render as a block so the canvas doesn't reserve inline-baseline descender space
		// below it. Its size is stated once the crop has settled the framebuffer
		// ({@link sizeToViewport}) — until then it is laid out at its own pixel size, and
		// it is hidden throughout anyway.
		app.canvas.style.display = 'block';
		// Held back until the board is assembled — see the reveal at the end of this method.
		app.canvas.style.visibility = 'hidden';
		container.appendChild(app.canvas);

		// The board is ruled once its ground is in hand, the grass being drawn with the
		// cells rather than laid over them afterwards. Nothing is on screen to wait for it:
		// the canvas is hidden until the whole board is standing either way.
		this.groundTextures = await ground;
		if (this.destroyed) return;

		// One rectangular board: cells left of centre take the left leader's colour, right
		// the right leader's, the shared centre column white.
		this.drawBoard(
			this.options.grids[0].color,
			this.options.grids[1].color,
			this.options.centerColor
		);

		// The lead character of each half stands where its grid asks, or on the half's
		// default lead cell: the left one in its own outer column (unflipped), the right
		// one (flipped) in its own. Combat can walk any actor into the central white
		// column.
		const redLead = leadCell(this.options.grids[0], LEAD_CELLS[0]);
		const blueLead = leadCell(this.options.grids[1], LEAD_CELLS[1]);

		// The standing pose of everybody on the board, fetched at once and now in hand. The
		// placements below stay in order — the two lines are drawn top to bottom and the
		// actor list is read by position — and each of them still asks for its own
		// definition, manifest and textures; this is only what makes those asks free.
		await standing;
		if (this.destroyed) return;

		await this.addActor(this.options.grids[0].character, redLead.q, redLead.r, false);
		await this.addActor(this.options.grids[1].character, blueLead.q, blueLead.r, true);

		// Extra characters stand idle on their assigned cells — left half faces
		// right (unflipped), right half faces left (flipped) like the centre pair.
		for (const extra of this.options.grids[0].extras ?? []) {
			await this.addActor(extra, extra.q, extra.r, false);
		}
		for (const extra of this.options.grids[1].extras ?? []) {
			await this.addActor(extra, extra.q, extra.r, true);
		}

		// Every actor above was loaded asynchronously; the board may have been torn
		// down in the meantime, and destroy() has already freed the app.
		if (this.destroyed) return;

		// Crop the view to the grid: the canvas becomes the field's own rectangle, so the
		// board fills it corner to corner and there is no canvas outside the board. Cell
		// positions are absolute px off the grid's origin, so this only translates the stage
		// and resizes the framebuffer; nothing moves.
		this.fitToContent();
		// And now that the framebuffer is the board's own rectangle, the element is sized off
		// it: as big as the viewport can carry, on whichever axis runs out first.
		this.sizeToViewport();

		// And only now is any of it shown. A Pixi application renders every frame from the
		// moment it is created, so a canvas in the document is a live picture of a board
		// being built: the empty grid paints first, then each fighter appears as its sheets
		// arrive one after another, and the crop above lands last — resizing the framebuffer
		// under a canvas whose width is pinned to its container, which restates its height
		// and shifts everything below it. That is the flicker. It is not something to slow
		// down or fade out, because none of it is anything to look at: the board is worth
		// showing when it is a board. So the canvas is hidden from the moment it is
		// appended, drawn once here in its finished state, and revealed with that frame
		// already on it. `visibility` rather than `display`, so the space it will take is
		// held from the start and the layout does not jump when it arrives.
		app.renderer.render(app.stage);
		app.canvas.style.visibility = 'visible';

		app.ticker.add(this.tick);

		// And now the rest of what a fight will ask these fighters for — the walk cycles,
		// the flinch, every move — comes in behind the picture. It is four fifths of the
		// artwork a board loads and not one frame of it is on screen when the arena opens:
		// six fighters stand still until a player has given three orders, which is a good
		// deal longer than this takes. Nothing waits on it except a turn ({@link whenReady}).
		this.warming = this.warmRest(cast);
	}

	/**
	 * Resolves once every animation a fight can call for is loaded.
	 *
	 * The board is shown as soon as it can be *stood up* — the standing pose and nothing
	 * else — and warms the rest behind it. That is safe because a fight cannot ask for any
	 * of it until a turn is committed, and it is only safe as long as something says so:
	 * this is that something, and the controller waits on it before carrying a turn out. So
	 * the ordinary case costs a resolved promise, and the case where a player somehow beats
	 * the load waits for it instead of playing a turn with fighters that cannot move.
	 */
	whenReady(): Promise<void> {
		return this.warming;
	}

	/**
	 * Cut the canvas to the board: the field's own rectangle, corner to corner. The stage
	 * is offset so the grid's top-left lands on the canvas's; the grid's own coordinates are
	 * untouched, so no cell shifts.
	 *
	 * All four edges are geometry rather than a measurement — the outer sides of the first
	 * and last columns, and the top and bottom edges of the first and last rows, at the size
	 * a cell is drawn — so the crop does not depend on the frame it happens to be taken in,
	 * and is the same board however the fighters standing on it are posed. Nothing is read
	 * off what is drawn. What running the board out to every canvas edge costs is on
	 * {@link contentCrop}.
	 */
	private fitToContent(): void {
		if (!this.app) return;
		const topLeft = this.project(0, 0);
		const bottomRight = this.project(BOARD_WIDTH, BOARD_HEIGHT);
		const { left, top, width, height } = contentCrop({
			left: topLeft.x,
			right: bottomRight.x,
			top: topLeft.y,
			bottom: bottomRight.y
		});
		this.app.stage.position.set(-left, -top);
		this.app.renderer.resize(width, height);
	}

	/**
	 * Size the canvas *element* against the viewport: it takes the whole of whichever axis
	 * runs out first, and its own aspect ratio decides the other. So the board is drawn as
	 * large as it can be with none of it off screen, and there is never a band of room
	 * around it — a canvas that does not fill the axis it is limited by is board given away.
	 *
	 * The width is the one figure stated, in CSS rather than in pixels, so it is re-measured
	 * by the browser as the window is resized or a phone is turned: `min(viewport width,
	 * viewport height × the board's aspect)`. The height is left to follow from the canvas's
	 * intrinsic ratio, which keeps the picture square with its framebuffer — the cells are
	 * never stretched, only scaled.
	 *
	 * Two terms and no third: a host has no say in this at all, and the same two figures
	 * answer every screen. The board is three columns by four rows now, so it is taller than
	 * it is wide and a wide screen is limited by its height, a phone by its width — either
	 * way the whole field is on the view, at the largest size that fits, with the axis that
	 * did not run out spending what is left over on the room round the board rather than on
	 * board nobody can see. (The host used to be able to push a column off the sides; see
	 * the note where that property was.)
	 *
	 * Read off the framebuffer as it stands, so it has to be called after the crop
	 * ({@link fitToContent}) and again whenever that changes: the aspect ratio is the crop's,
	 * not the layout's.
	 */
	private sizeToViewport(): void {
		if (!this.app) return;
		const { width, height } = this.app.renderer;
		if (!width || !height) return;
		const aspect = width / height;
		this.app.canvas.style.width = `min(${VIEWPORT_WIDTH}, calc(${VIEWPORT_HEIGHT} * ${aspect}))`;
		this.app.canvas.style.height = 'auto';
	}

	/** Tear everything down. Safe to call more than once. */
	destroy(): void {
		this.destroyed = true;
		if (this.app) {
			destroyPixiApp(this.app);
			this.app = null;
		}
		this.actors = [];
		this.sparks = [];
		// The one dot they were all drawn from goes with them — nothing else holds it, and a
		// board built again builds its own.
		this.sparkContext?.destroy();
		this.sparkContext = null;
		// The grass goes the same way, sources and all: the sprites that drew it went with the
		// stage, and this board cut its tiles for itself out of the sheet.
		for (const tile of this.groundTextures) tile.destroy(true);
		this.groundTextures = [];
		this.cellPaint.clear();
		this.crownOffsets.clear();
	}

	/**
	 * Screen point of a place on the grid, given in **cell widths** off its top-left
	 * corner. One cell width is `cellSize` px on both axes, so this is a scale and a
	 * translation and nothing else — which is the whole of what "not tilted" means here.
	 * The cells' own proportions are already inside the figures handed to it, so
	 * anything measured in cell widths projects through it unchanged: a cell's corners,
	 * its foot line, and the height a character is drawn at alike.
	 */
	private project(col: number, row: number): Point {
		const { cellSize } = this.options;
		return { x: this.gridLeft + col * cellSize, y: this.gridTop + row * cellSize };
	}

	/** Screen-space point at the middle of the cell at [q, r]'s foot line
	 * ({@link cellFoot}), so a fighter reads as inside the cell rather than floating at
	 * its centre or standing on the line it shares with the row below. */
	private cellMark(q: number, r: number): Point {
		const foot = cellFoot(q, r);
		return this.project(foot.x, foot.y);
	}

	/**
	 * Where a *particular* actor is put to stand in the cell at [q, r]: the cell's own
	 * mark, moved by that actor's crown correction ({@link Actor.crownShift}), so what
	 * ends up over the middle of the cell is the fighter's head rather than the axis its
	 * artwork happens to be drawn around.
	 *
	 * Every placement that leaves a fighter *standing* somewhere goes through this — the
	 * opening line-up, each step of a walk, a winner claiming ground, a loser retracting.
	 * The one that does not is the duel split ({@link meleeApproach}), which is not a
	 * fighter standing in the middle of a cell at all: it is two sprites brought edge to
	 * edge against one line, and it measures from their edges for that reason.
	 *
	 * **A fighter that has been taken down stands half a cell further out** — its middle
	 * on the outer edge of whatever cell it holds rather than over the centre of it, so
	 * half of it is beyond that edge ({@link fallenDrift}).
	 */
	private standPoint(actor: Actor, q: number, r: number): Point {
		const mark = this.cellMark(q, r);
		return { x: mark.x + actor.crownShift + this.fallenDrift(actor), y: mark.y };
	}

	/**
	 * How far out of its cell a fighter is drawn for having been beaten: half a cell
	 * towards the outside of the board, or nothing at all while it is still in the fight.
	 *
	 * The fallen do not leave this board and they do not stand aside on it either — the
	 * halves are one column deep, so the cell a fighter lost its lane on is the cell it
	 * stands the rest of the fight on (`grid.ts`, and the controller's `fallenColumn`).
	 * What is left to say it is beaten is where in that cell it stands: pushed out to the
	 * edge, with the half of it past the edge cut off by the crop, since the outer edge of
	 * an outer column *is* the edge of the canvas ({@link contentCrop}). So a fighter still
	 * in the fight has the whole of its cell to itself and is wholly on the board, and one
	 * that is out of it is half off the board and holding half a cell — a reading that
	 * needs nothing drawn under anybody and does not depend on knowing which column is
	 * which. It is deliberately not the whole way off: a fight is played on which fighters
	 * are still standing, and a line whose losses have vanished is a line nobody can count.
	 *
	 * Outward is decided by the actor's **side** and not by the column it is standing on:
	 * the fighter belongs to the half it was fielded in whatever ground it has ended up
	 * holding, and the direction it withdraws in is that half's, away from the white
	 * column between the two.
	 */
	private fallenDrift(actor: Actor): number {
		if (!actor.defeated) return 0;
		return (actor.side === 'blue' ? 1 : -1) * (this.cellWidth() / 2);
	}

	/**
	 * The width of a cell in screen px — one figure for the whole board, since every
	 * cell is the same square. It is the box every character is fitted into, so how big
	 * a fighter is drawn says something about the fighter and nothing about where on the
	 * board it happens to be, and walking a fighter forward never resizes it.
	 */
	private cellWidth(): number {
		return Math.abs(this.project(1, 0).x - this.project(0, 0).x);
	}

	/**
	 * Draw the board: one square per cell, laid out face-on. Cells left
	 * of the central column take `leftColor`, cells to the right `rightColor`, and the
	 * central column (q = 0) — the shared ground both sides can enter — is painted
	 * `centerColor`. Iterates the exact cell list from the shared grid utility, so every
	 * occupiable cell is drawn and nothing else is.
	 *
	 * Only the fills are the halves' own: every line of the grid is drawn in
	 * {@link GRID_LINE}, so the lattice reads as one board rather than as two colours
	 * meeting, and a cell's side is said by the ground inside it alone.
	 *
	 * The colours themselves are drawn in nothing — alpha 0, so a half's colour is carried
	 * by what stands on it rather than by a wash under it — and the lines are drawn: the
	 * cells are ruled across the canvas and the fighters, the claimed cells' overlays, the
	 * guard rings and the orders stand on a field that is there to be seen. The fill's alpha
	 * stays where the line's was, which is how the colour comes back if it is ever wanted.
	 *
	 * What every cell *does* have under it is ground: each is laid with grass
	 * ({@link layGround}) and ruled into that ground's own squares ({@link ruleGround}),
	 * both below the lattice so the cells' red stays on top of them. A board whose tiles
	 * could not be fetched keeps the ruling and loses the grass — the subdivision is the
	 * board's and not the artwork's.
	 *
	 * The yellow is a **second** Graphics rather than more calls on this one, because
	 * adjacent cells share their edges: drawn together, the yellow of a cell laid later
	 * would go over the red of the cell beside it, one border at a time. Two objects at two
	 * depths is every red line over every yellow one, whatever order the cells come in.
	 */
	private drawBoard(leftColor: number, rightColor: number, centerColor: number): void {
		if (!this.app) return;
		const graphics = new Graphics();
		const groundLines = new Graphics();
		for (const { q, r } of boardCells()) {
			// q alone decides the side; the central column (q = 0) is the shared
			// white ground.
			const side = cellSide(q);
			const color = side === 'red' ? leftColor : side === 'blue' ? rightColor : centerColor;

			this.layGround(q, r);
			this.ruleGround(groundLines, q, r);

			graphics.poly(this.cellOutline(q, r));
			graphics.fill({ color, alpha: 0 });
			graphics.stroke({ width: 2, color: GRID_LINE, alpha: 1 });
		}
		groundLines.zIndex = GROUND_LINE_Z;
		this.app.stage.addChild(groundLines);
		this.app.stage.addChild(graphics);
	}

	/**
	 * Rule the cell at [q, r] into its tiles: a yellow border round each of the nine
	 * squares the grass is laid in ({@link GROUND_TILES_PER_CELL}), drawn into the shared
	 * ground-line object the caller hands over.
	 *
	 * Every one of the nine is bordered, the ones against the cell's own edge included — so
	 * the subdivision is a grid of squares and not a cross inside a square. What that costs
	 * is a yellow line under each red one, which is what the depths are for: the red is
	 * drawn over it at twice the width, and the cell's border stays the cell's.
	 *
	 * The finer line is 1px to the lattice's 2 at the size the board is laid out, so the
	 * two rulings stay a ruling and a sub-ruling however far the finished canvas is then
	 * scaled — both are geometry in the same space and go through the same scale.
	 */
	private ruleGround(graphics: Graphics, q: number, r: number): void {
		for (const square of this.groundSquares(q, r)) {
			graphics.rect(square.x, square.y, square.width, square.height);
			graphics.stroke({ width: 1, color: GROUND_LINE, alpha: 1 });
		}
	}

	/**
	 * Lay the grass over the cell at [q, r]: one of the sheet's grass tiles drawn into each
	 * of the cell's nine squares, filling it corner to corner and no further.
	 *
	 * Every cell of the field takes it, whichever half it belongs to: the grass is the
	 * ground the fight is fought on and not a marking, so it stops at the outer edge of the
	 * board and nowhere inside it.
	 *
	 * **One sprite per square, off the same list the ruling is drawn from** ({@link
	 * groundSquares}) — so a square of grass and the yellow border round it are the same
	 * rectangle by construction, and the artwork cannot end anywhere but on the line that
	 * says where it ends. A single tiling sprite over the whole cell drew the same picture
	 * by a different route: it repeated the texture at a pitch of its own and the ruling
	 * measured the thirds again separately, two answers to where a tile ends that agree only
	 * as long as the arithmetic does. Nine sprites is one answer. It costs nine quads a cell
	 * — a hundred and eight on a board — which is nothing beside one MUGEN fighter.
	 *
	 * **Which** of the seven grass tiles a square gets is drawn at random and kept nowhere:
	 * they are seven ways of saying grass, so no square wants a particular one and nothing
	 * later reads back what it was given. A board is built once when the arena opens and
	 * torn down when it closes, so a fight is fought on one field throughout; the next one
	 * is somewhere else in the same meadow.
	 */
	private layGround(q: number, r: number): void {
		if (!this.app || this.groundTextures.length === 0) return;
		for (const square of this.groundSquares(q, r)) {
			const tile = this.groundTextures[Math.floor(Math.random() * this.groundTextures.length)];
			const grass = new Sprite(tile);
			grass.position.set(square.x, square.y);
			// The tile is 16px of artwork stretched over a ninth of a cell — sampled
			// `nearest`, so what that magnifies is the artwork's own pixels.
			grass.width = square.width;
			grass.height = square.height;
			grass.zIndex = GROUND_Z;
			this.app.stage.addChild(grass);
		}
	}

	/**
	 * The nine squares the cell at [q, r] is divided into, in screen space: the cell cut
	 * {@link GROUND_TILES_PER_CELL} ways across and down.
	 *
	 * The one place those squares are worked out. Both the grass and the yellow ruling are
	 * drawn from what this returns, which is what makes them the same nine squares rather
	 * than two divisions of the same cell that happen to come out equal. Each is measured
	 * from its own two corners projected — never a corner plus a width — so neighbouring
	 * squares share an edge exactly and the row of them ends precisely on the cell's own
	 * border, with no gap left by a third of a cell not dividing evenly into pixels.
	 */
	private groundSquares(q: number, r: number): GroundSquare[] {
		const [topLeft] = cellCorners(q, r);
		const step = 1 / GROUND_TILES_PER_CELL;
		const squares: GroundSquare[] = [];
		for (let row = 0; row < GROUND_TILES_PER_CELL; row++) {
			for (let col = 0; col < GROUND_TILES_PER_CELL; col++) {
				const at = this.project(topLeft.x + col * step, topLeft.y + row * step);
				const beyond = this.project(topLeft.x + (col + 1) * step, topLeft.y + (row + 1) * step);
				squares.push({ x: at.x, y: at.y, width: beyond.x - at.x, height: beyond.y - at.y });
			}
		}
		return squares;
	}

	/**
	 * Fetch the ground sheet and cut the grass out of its first row: one texture per tile,
	 * in the order they lie on the sheet, {@link GROUND_TILE_CHOICES} of them.
	 *
	 * One fetch and one blob, cut as many times as there are tiles — the sheet is a single
	 * small file, and asking for it once per tile would be seven requests for seven
	 * rectangles of the same picture.
	 *
	 * `createImageBitmap` takes the crop rectangle itself, so a tile is the whole of the
	 * bitmap that reaches the GPU and no other part of the sheet is uploaded with it.
	 * Pointing at the same 16 pixels *inside* the sheet would draw the right tile most of
	 * the time and its neighbour at the edges: a magnified sample near the boundary of a
	 * frame reaches for the texels beyond it, and on a page of tiles those belong to the
	 * next one. Cut out, there is nothing beyond it to reach. Sampled `nearest`, this being
	 * pixel art drawn at several times its own size — the one place on this board where
	 * linear filtering would turn artwork into a smear — and set to wrap, so that a sample
	 * which does run a hair past the edge comes back on the tile's other side, which is
	 * grass, rather than smearing its last column.
	 *
	 * Built by hand rather than through `Assets`, which is keyed on what it is given and
	 * would hold a cache entry per board for bitmaps no other board can name. Nothing else
	 * holds them, so the board frees them on the way out ({@link destroy}).
	 *
	 * Resolves to an empty list if the sheet cannot be had — a board with no grass on it,
	 * which is a board.
	 */
	private async loadGround(): Promise<Texture[]> {
		try {
			const response = await fetch(GROUND_TILE_SHEET);
			if (!response.ok) return [];
			const sheet = await response.blob();
			const tiles = await Promise.all(
				Array.from({ length: GROUND_TILE_CHOICES }, (_, index) =>
					createImageBitmap(sheet, index * GROUND_TILE_PX, 0, GROUND_TILE_PX, GROUND_TILE_PX)
				)
			);
			return tiles.map(
				(tile) =>
					new Texture({
						source: new ImageSource({
							resource: tile,
							scaleMode: 'nearest',
							addressMode: 'repeat'
						})
					})
			);
		} catch {
			return [];
		}
	}

	/**
	 * The cell at [q, r] as a closed screen-space outline: its six corners projected in
	 * order, flattened to the `[x, y, x, y, …]` list Pixi draws a polygon from. Every
	 * square on this board — the ruled grid, a claimed cell's overlay — is drawn from
	 * this one path, so the paint can never sit a hair off the line under it.
	 */
	private cellOutline(q: number, r: number): number[] {
		return cellCorners(q, r).flatMap((corner) => {
			const at = this.project(corner.x, corner.y);
			return [at.x, at.y];
		});
	}

	/**
	 * Load a character and stand it in the centre of the cell at [q, r], feet on the
	 * cell's lower edge. Every actor loads its directional walk animations so combat
	 * can drive it cell to cell.
	 */
	private async addActor(
		character: BoardCharacter,
		q: number,
		r: number,
		flip: boolean
	): Promise<void> {
		if (!this.app) return;
		const startName = character.animation ?? 'idle';
		// The actor id is the instance identity (unique per placement — the two
		// sides can field the same character, so it must not be the asset id). The
		// character's definition/assets are keyed by the id embedded in basePath
		// (`/assets/<charId>/frames`), which stays shared across those instances —
		// read out by the helper every surface that has only a frames folder uses.
		const characterId = characterIdFromFramesPath(character.basePath) ?? '';
		const id = character.id ?? characterId ?? character.basePath;

		// What this actor plays and what has to be loaded for it: see
		// {@link boundAnimations}. Both asks below are already warm — {@link start} warms
		// the standing pose of the whole board before placing anybody — so this reads as a
		// fetch and costs a microtask.
		const definition = await loadDefinition(characterId);
		const { moveRightAnim, moveLeftAnim, hurtAnim, names } = boundAnimations(
			definition,
			startName
		);
		// The pose it is being stood up in, and only that: the rest of its animations
		// arrive behind the finished board ({@link warmRest}).
		const animations = await this.loadAnimations(character.basePath, [startName]);
		const baseFrames = animations[startName];
		if (!baseFrames || baseFrames.length === 0) return;

		// The character stands centred on its cell's foot line, feet on it.
		const mark = this.cellMark(q, r);

		// How big the character is drawn is the cards' question, asked of the cards' own
		// answer ({@link characterFitScale}): one shared source→screen ratio for every
		// character, capped so neither a tall one nor a wide one spills out of its box.
		// The box is a cell's width — the same anywhere on the board — so the two lines are
		// scaled alike wherever each stands, and a fighter keeps its size as it walks. Both
		// surfaces then agree on every character's size relative to the others.
		// The character's own render scale rides along: the definition is already loaded
		// above for its bindings, and it is the same correction the cards and the statues
		// read, so a set drawn small stands as tall here as it does on a card.
		// The width cap measures the cycle's whole sweep, as it does everywhere else, and
		// not the furthest one reach from the axis doubled — which is the rule this board
		// used to ask for, on the grounds that a fighter is pinned to its cell's mark by
		// that axis (see below) and so ought to keep every limb within half a cell of it.
		// What that bought was a fighter that never crossed into its neighbour's cell; what
		// it cost was the fighter being a different size from its own card. Frieza paid
		// most of it — his idle sweeps a tail most of a body-width to one side, so he was
		// held at half the size his card draws him, his own correction and all — and it
		// was eating the InuYasha cast's correction too, Kagome's 1.4 among them. The
		// crossing is the smaller thing: every fighter here already stands a third taller
		// than its cell and over the row behind it ({@link CHAR_HEIGHT_RATIO}), so a limb
		// reaching past the cell is the overlap this board is drawn with throughout.
		const box = this.cellWidth();
		const fitScale = characterFitScale(
			baseFrames,
			{ width: box, height: box * CHAR_HEIGHT_RATIO },
			readRenderScale(definition)
		);

		// Where the character's head is, relative to the axis it is drawn around — the
		// correction that puts the head over the middle of the cell instead of the axis.
		// Every character gets it but the ones whose own definition opts out, which are
		// the sheets whose highest painted pixel is not a head at all.
		// Read off the artwork once per cycle and kept: it is a fact about the character,
		// where the screen offset below is a fact about this placement, so a mirror match
		// reads the pixels for one of its two copies and multiplies for the other.
		const crownShift = readCrownAlign(definition)
			? crownDrift(this.crownOf(character.basePath, startName, baseFrames), fitScale, flip)
			: 0;
		const stand = { x: mark.x + crownShift, y: mark.y };

		const sprite = new Sprite();
		// A negative x-scale mirrors the sprite around its anchor (in place).
		sprite.scale.set(flip ? -fitScale : fitScale, fitScale);
		sprite.x = stand.x;
		sprite.y = stand.y;
		// Feet-y drives paint order: rows further down the screen sit at larger y and on top.
		sprite.zIndex = stand.y;
		this.app.stage.addChild(sprite);

		const actor: Actor = {
			id,
			basePath: character.basePath,
			pendingAnimations: names.filter((name) => name !== startName),
			sprite,
			// The grid it was placed from: `flip` is what tells the two halves apart.
			side: flip ? 'blue' : 'red',
			homeColumn: q,
			homeRow: r,
			animations,
			hurtAnim,
			currentName: startName,
			frameIndex: 0,
			frameElapsed: 0,
			row: r,
			column: q,
			moveRightAnim,
			moveLeftAnim,
			pathQueue: [],
			finalTarget: null,
			onArrive: null,
			oneShot: null,
			stance: null,
			aura: null,
			ring: null,
			label: null,
			orders: null,
			// Nominal size: the base cycle's widest and tallest frame at fit scale —
			// stable across poses, unlike the live sprite whose size tracks the current
			// frame's texture. Taken over the whole cycle (as the fit is), so an aura or
			// a label sits by the character's full reach rather than by frame one's.
			displayWidth: Math.max(...baseFrames.map((frame) => frame.width)) * fitScale,
			displayHeight: Math.max(...baseFrames.map((frame) => frame.height)) * fitScale,
			crownShift,
			x: stand.x,
			y: stand.y,
			targetX: stand.x,
			targetY: stand.y,
			moving: false,
			stepDir: 0,
			defeated: false
		};
		this.applyFrame(actor);
		this.actors.push(actor);
	}

	/** Fetch a manifest and load the textures for the named animations. Both documents are
	 * shared with every other surface on the page and fetched once between them, so this is
	 * a memo lookup and the frame PNGs (which Pixi caches in turn). */
	private async loadAnimations(
		basePath: string,
		names: string[]
	): Promise<Record<string, LoadedFrame[]>> {
		const manifest = await loadManifest(basePath);
		if (!manifest) return {};
		const textures = await this.loadFrames(basePath, frameFiles(manifest, names));

		const result: Record<string, LoadedFrame[]> = {};
		for (const name of names) {
			const animation = manifest.animations[name];
			if (!animation) continue; // e.g. a character without a run cycle
			result[name] = animation.frames.map((frame) => ({
				texture: textures.get(frame.file) ?? Texture.EMPTY,
				width: frame.width,
				height: frame.height,
				anchorX: frame.anchorX / frame.width,
				anchorY: frame.anchorY / frame.height,
				duration: frame.duration
			}));
		}
		return result;
	}

	/**
	 * Load a frames folder's PNGs — every one of them at once, keyed back by bare
	 * filename. One `Assets.load` over the whole list rather than one per frame, which
	 * is the difference between the browser running its several connections flat out
	 * and it doing one round trip at a time: a full moveset is 30–80 frames per
	 * fighter and a board carries six of them, so serialising the wait was seconds of
	 * a blank arena over files that were mostly in the cache already.
	 */
	private async loadFrames(basePath: string, files: string[]): Promise<Map<string, Texture>> {
		const loaded = new Map<string, Texture>();
		if (files.length === 0) return loaded;

		const urls = files.map((file) => `${basePath}/${file}`);
		const byUrl = await Assets.load<Texture>(urls);
		files.forEach((file, index) => {
			const texture = byUrl[urls[index]];
			if (!texture) return;
			// Keep the pixel art crisp when scaled.
			texture.source.scaleMode = 'nearest';
			loaded.set(file, texture);
		});
		return loaded;
	}

	/**
	 * The frame files one pass of the warm-up wants, gathered per frames folder so a
	 * character fielded on both halves of the board is one list and one load.
	 *
	 * `wanted` picks the animations out of a character's own bindings, which is the whole
	 * of what the two passes differ by: the standing pose, or everything else.
	 *
	 * Best-effort — a character that cannot be read here fails again in `addActor`, which
	 * is where it is handled. Nothing is reported from a warm-up.
	 */
	private async warmFiles(
		characters: BoardCharacter[],
		wanted: (bound: ReturnType<typeof boundAnimations>, startName: string) => string[]
	): Promise<void> {
		const folders = new Map<string, Set<string>>();

		await Promise.all(
			characters.map(async (character) => {
				const startName = character.animation ?? 'idle';
				const [definition, manifest] = await Promise.all([
					loadDefinition(characterIdFromFramesPath(character.basePath)),
					loadManifest(character.basePath)
				]);
				if (!manifest) return;
				const bound = boundAnimations(definition, startName);
				const files = folders.get(character.basePath) ?? new Set<string>();
				for (const file of frameFiles(manifest, wanted(bound, startName))) files.add(file);
				folders.set(character.basePath, files);
			})
		);
		if (this.destroyed) return;

		await Promise.all(
			[...folders].map(([basePath, files]) =>
				this.loadFrames(basePath, [...files]).catch(() => new Map<string, Texture>())
			)
		);
	}

	/**
	 * Warm what it takes to *stand the board up*: every actor's definition, its manifest,
	 * and the frames of the one cycle it will be standing in. Nothing else — the pose a
	 * fighter holds is what it is measured, fitted, crowned and drawn from, and no other
	 * animation is on screen when the arena opens.
	 *
	 * Placement itself stays ordered ({@link start} stands the fighters up one after the
	 * next so the actor list reads top to bottom) and each `addActor` asks for its own
	 * assets exactly as before. What it asks for is by then already loaded — the fetches
	 * are memoised for the page, the textures are in Pixi's own cache — so the ordering
	 * costs a microtask instead of a round trip per frame.
	 */
	private warmStanding(characters: BoardCharacter[]): Promise<void> {
		return this.warmFiles(characters, (_bound, startName) => [startName]);
	}

	/**
	 * Warm everything a fight can call for and the opening board could not show: the walk
	 * cycles, the flinch and every move. Run behind the finished picture; see
	 * {@link whenReady}, which is what a turn waits on.
	 *
	 * Never rejects. It is awaited by the turn that is about to be played out, and a
	 * character whose moveset could not be read is a fighter that swings without a pose —
	 * which is what a board missing an animation has always drawn — and not a reason to
	 * strand the fight that was waiting on it.
	 */
	private async warmRest(characters: BoardCharacter[]): Promise<void> {
		try {
			await this.warmFiles(characters, (bound, startName) =>
				bound.names.filter((name) => name !== startName)
			);
			if (this.destroyed) return;
			// Onto the actors already standing on the board. Their `animations` record holds
			// the one cycle they were placed with; this is the rest of it arriving, and it is
			// the only thing that ever adds to that record after a placement.
			await Promise.all(
				this.actors.map(async (actor) => {
					const animations = await this.loadAnimations(actor.basePath, actor.pendingAnimations);
					if (this.destroyed) return;
					Object.assign(actor.animations, animations);
				})
			);
		} catch {
			// Left as it stands: whatever did arrive is on the actors, and the rest simply
			// has no pose to play.
		}
	}

	/**
	 * How far one cycle's crown sits from its axis, in the artwork's own pixels — read off
	 * the pixels the first time a board is asked, and remembered after that.
	 *
	 * Keyed by the artwork and nothing else, which is what makes it shareable: the reading
	 * is a canvas read per frame of the cycle and the answer does not depend on the scale
	 * the character is drawn at, the half it stands on, or which of the two copies of a
	 * mirror match is being placed.
	 */
	private crownOf(basePath: string, animation: string, frames: LoadedFrame[]): number {
		const key = `${basePath}|${animation}`;
		const known = this.crownOffsets.get(key);
		if (known !== undefined) return known;
		const offset = crownOffset(crownFrames(frames));
		this.crownOffsets.set(key, offset);
		return offset;
	}

	/** Push the actor's current frame texture and anchor to its sprite. */
	private applyFrame(actor: Actor): void {
		const frames = actor.animations[actor.currentName];
		if (!frames || frames.length === 0) return;
		const frame = frames[actor.frameIndex % frames.length];
		actor.sprite.texture = frame.texture;
		// Horizontal: the frame's own MUGEN axis, which is what holds the frames of a
		// cycle to each other — where that axis is *put* is the standing mark plus the
		// actor's one crown correction ({@link Actor.crownShift}), decided once, not
		// here. Vertical: 1, so the sprite's bottom end sits on the cell's foot line.
		actor.sprite.anchor.set(frame.anchorX, 1);
	}

	/** Switch the active animation, restarting playback if it actually changed. */
	private setAnimation(actor: Actor, name: string): void {
		if (actor.currentName === name || !actor.animations[name]) return;
		actor.currentName = name;
		actor.frameIndex = 0;
		actor.frameElapsed = 0;
	}

	private tick = (): void => {
		if (!this.app) return;
		const deltaMs = this.app.ticker.deltaMS;
		for (const actor of this.actors) {
			if (actor.oneShot) {
				// A strike/flinch owns playback; movement and idle are suspended.
				this.advanceOneShot(actor, deltaMs);
			} else {
				// Programmatic paths (combat) drive actor movement; between fights they
				// just settle to idle.
				this.updateStep(actor, deltaMs / 1000);
				this.advanceFrame(actor, deltaMs);
			}
			// Re-sort by feet-y each frame so a moving character passes in front of the
			// cells/characters it draws level with and behind those it moves past.
			actor.sprite.zIndex = actor.y;
			this.applyFrame(actor);
			this.updateAura(actor, deltaMs);
			this.updateRing(actor, deltaMs);
			this.updateOrders(actor);
			this.updateLabel(actor);
		}
		// After the guards, since this is the tick they were struck on: a spark drawn where
		// it was struck and moved on the next frame is one frame of a dot sitting on the arc.
		this.updateSparks(deltaMs);
	};

	/** Loop the actor's aura animation and keep it glued to the actor's feet,
	 * just behind it in depth order — and, for its first moments, bring it up off
	 * those feet to its full height (see {@link AURA_RISE_MS}). */
	private updateAura(actor: Actor, deltaMs: number): void {
		const aura = actor.aura;
		if (!aura) return;
		aura.frameElapsed += deltaMs;
		while (aura.frameElapsed >= AURA_FRAME_MS) {
			aura.frameElapsed -= AURA_FRAME_MS;
			aura.frameIndex = (aura.frameIndex + 1) % aura.frames.length;
		}
		aura.sprite.texture = aura.frames[aura.frameIndex];
		if (aura.rise < AURA_RISE_MS) {
			aura.rise = Math.min(AURA_RISE_MS, aura.rise + deltaMs);
			// Eased out, so the flame leaps off the ground and settles into its height
			// rather than creeping up at one rate. The sprite is anchored at its foot
			// (see showAura), so scaling its height is the flame growing upwards from
			// where it stands and never from its middle.
			const t = 1 - Math.pow(1 - aura.rise / AURA_RISE_MS, 3);
			aura.sprite.scale.set(
				aura.scaleX * (AURA_RISE_WIDTH + (1 - AURA_RISE_WIDTH) * t),
				aura.scaleY * t
			);
		}
		aura.sprite.x = actor.x;
		aura.sprite.y = actor.y;
		aura.sprite.zIndex = actor.y - 0.5;
	}

	/** Keep the actor's callout floating just above its head, always on top. */
	private updateLabel(actor: Actor): void {
		const label = actor.label;
		if (!label) return;
		label.x = actor.x;
		label.y = actor.y - actor.displayHeight - 12;
		label.zIndex = actor.y + 10000;
	}

	/**
	 * Advance an actor along its path queue one cell at a time. When idle it pulls
	 * the next queued cell; on arriving at the last one it fires `onArrive`. The
	 * directional walk animation (`move-left`/`move-right`) is chosen by the step's
	 * screen-space direction, matching the arrow-key behaviour.
	 */
	private updateStep(actor: Actor, dt: number): void {
		if (!actor.moving) {
			const next = actor.pathQueue.shift();
			if (next) {
				actor.column = next.q;
				actor.row = next.r;
				// The final step may be overridden to an exact point (a fighter's half
				// of a shared duel cell) instead of the cell's standing mark.
				const override = actor.pathQueue.length === 0 ? actor.finalTarget : null;
				if (actor.pathQueue.length === 0) actor.finalTarget = null;
				const target = override ?? this.standPoint(actor, next.q, next.r);
				actor.stepDir = Math.sign(target.x - actor.x) || actor.stepDir || 1;
				actor.targetX = target.x;
				actor.targetY = target.y;
				actor.moving = true;
			}
		}

		if (actor.moving) {
			// Advance along the straight line to the target cell. A step crosses one side of
			// the square, so it is a whole cell either along the row or up and down the
			// column, and never both: there are no diagonals to walk on this field.
			const step = MOVE_SPEED * dt;
			const dx = actor.targetX - actor.x;
			const dy = actor.targetY - actor.y;
			const dist = Math.hypot(dx, dy);
			if (dist <= step || dist === 0) {
				actor.x = actor.targetX;
				actor.y = actor.targetY;
				actor.moving = false;
			} else {
				actor.x += (dx / dist) * step;
				actor.y += (dy / dist) * step;
			}
			actor.sprite.x = actor.x;
			actor.sprite.y = actor.y;
			// Play the animation bound to this direction in the JSON definition, as-is.
			const name = actor.stepDir < 0 ? actor.moveLeftAnim : actor.moveRightAnim;
			this.setAnimation(actor, actor.animations[name] ? name : 'idle');
			// Finished the whole queued path — settle and notify.
			if (!actor.moving && actor.pathQueue.length === 0) {
				actor.stepDir = 0;
				const done = actor.onArrive;
				actor.onArrive = null;
				done?.();
			}
		} else {
			actor.stepDir = 0;
			this.setAnimation(actor, this.standing(actor));
		}
	}

	/**
	 * What an actor that is doing nothing stands in: the stance it has been put in, or
	 * idle. A stance whose animation never loaded falls back to idle rather than leaving
	 * the actor frozen in whatever it happened to be showing.
	 */
	private standing(actor: Actor): string {
		return actor.stance && actor.animations[actor.stance] ? actor.stance : 'idle';
	}

	/** Drive a one-shot combat animation to completion, then release to whatever the
	 * actor stands in — its stance if it is holding one, else idle. */
	private advanceOneShot(actor: Actor, deltaMs: number): void {
		const shot = actor.oneShot;
		if (!shot) return;
		shot.elapsed += deltaMs;
		this.advanceFrame(actor, deltaMs);
		if (shot.elapsed >= shot.total) {
			actor.oneShot = null;
			this.setAnimation(actor, this.standing(actor));
			shot.resolve();
		}
	}

	private advanceFrame(actor: Actor, deltaMs: number): void {
		const frames = actor.animations[actor.currentName];
		if (!frames || frames.length < 2) return;
		actor.frameElapsed += deltaMs;
		let guard = frames.length;
		while (actor.frameElapsed >= frames[actor.frameIndex].duration && guard-- > 0) {
			actor.frameElapsed -= frames[actor.frameIndex].duration;
			actor.frameIndex = (actor.frameIndex + 1) % frames.length;
		}
	}

	// --- Combat API -----------------------------------------------------------
	// Programmatic control used by the combat controller. All movement methods
	// resolve once the actor has settled, so the controller can await each beat.

	/** Ids of every actor on the board, in placement order. */
	getActorIds(): string[] {
		return this.actors.map((actor) => actor.id);
	}

	private findActor(id: string): Actor | undefined {
		return this.actors.find((actor) => actor.id === id);
	}

	/** The cell the actor is currently on. */
	private cellOf(actor: Actor): Cell {
		return { q: actor.column, r: actor.row };
	}

	/**
	 * Walk an actor through the given cells (excluding its current one). When
	 * `finalPoint` is given the walk's last step lands on that exact screen point
	 * instead of the last cell's standing mark, so approaches that end off-centre
	 * (a fighter's half of a shared duel cell) stay one continuous motion. With no
	 * cells to walk it still glides straight to `finalPoint` if it isn't there yet.
	 */
	private walkCells(actor: Actor, cells: Cell[], finalPoint?: Point): Promise<void> {
		return new Promise((resolve) => {
			if (cells.length === 0) {
				if (finalPoint && (actor.x !== finalPoint.x || actor.y !== finalPoint.y)) {
					actor.stepDir = Math.sign(finalPoint.x - actor.x) || actor.stepDir || 1;
					actor.targetX = finalPoint.x;
					actor.targetY = finalPoint.y;
					actor.moving = true;
					actor.onArrive = resolve;
					return;
				}
				resolve();
				return;
			}
			actor.finalTarget = finalPoint ?? null;
			actor.pathQueue = [...cells];
			actor.onArrive = resolve;
		});
	}

	/**
	 * Walk two fighters toward each other until they stand face to face on the **board's
	 * own middle**, on the row they are fighting down. When `meetingCell` is given, the
	 * red fighter walks to that exact cell and the blue fighter to its east neighbour;
	 * otherwise the cheapest meeting pair is searched. Resolves once both have settled.
	 * Ids may be given in any order (sides are inferred).
	 *
	 * The line they meet on is the board's, not the meeting cell's. On a field of squares
	 * the two are the same line — every row is level with every other, so the white cell
	 * of every lane is dead centre — and stating it as the board's is what keeps it true
	 * of a lane that meets somewhere other than on the white column. It was load-bearing
	 * on the hex field this replaced, where the middle row was drawn half a cell across
	 * from the other two and its pair therefore clashed half a cell right of theirs.
	 * Both lines open the same distance out from this line (see the controller's opening
	 * cells), so meeting on it is also the two of them walking out the same distance and
	 * arriving together.
	 */
	async meleeApproach(aId: string, bId: string, meetingCell?: Cell): Promise<void> {
		const a = this.findActor(aId);
		const b = this.findActor(bId);
		if (!a || !b) return;
		// Which fighter belongs to the red half (drawn left) vs the blue (right).
		const red = a.side === 'red' ? a : b;
		const blue = red === a ? b : a;
		// Route both fighters around any other character standing in the way (the two
		// duelists themselves are excluded so they don't block each other); if that
		// leaves no legal meeting, fall back to the side-only search.
		const blocked = this.occupied([red, blue]);
		const meeting =
			findMeleeMeeting(this.cellOf(red), this.cellOf(blue), meetingCell, blocked) ??
			findMeleeMeeting(this.cellOf(red), this.cellOf(blue), meetingCell);
		if (!meeting) return;

		// One on each side of that line, without the two sprites overlapping: red walks
		// until its sprite's right edge stops at it, blue until its left edge starts
		// there, so they stand face to face across it. Extents come from each sprite's
		// current frame (anchor fraction × scaled width; blue is mirrored, so its lead
		// edge is the frame's far side). Logical cells are untouched (each still counts
		// as standing on the cell it walked to); only the final step's landing point is
		// offset — and the crown correction is not applied to it either, because two
		// fighters brought edge to edge against a line are placed by their edges.
		// The pair stands on the meeting cell's own foot line, as everybody else does.
		const mid = {
			x: this.project(BOARD_WIDTH / 2, 0).x,
			y: this.cellMark(meeting.red.destination.q, meeting.red.destination.r).y
		};
		const redLead = (1 - red.sprite.anchor.x) * Math.abs(red.sprite.width);
		const blueLead = (1 - blue.sprite.anchor.x) * Math.abs(blue.sprite.width);
		await Promise.all([
			this.walkCells(red, meeting.red.path.slice(1), { x: mid.x - redLead, y: mid.y }),
			this.walkCells(blue, meeting.blue.path.slice(1), { x: mid.x + blueLead, y: mid.y })
		]);
	}

	/**
	 * The cells an actor may occupy: its own half, plus the central white column, which
	 * is neither side's — it is the ground between the two lines, and the only ground
	 * either of them can take off the other. Nobody ever *stands* across it in the far
	 * half: every move that leaves a fighter somewhere is confined to this predicate.
	 * The one thing that is not is the strike run ({@link closeIn}), which crosses and
	 * comes straight back, because a blow is not ground taken.
	 */
	private sideAllowed(actor: Actor): (c: Cell) => boolean {
		const far: CellSide = actor.side === 'blue' ? 'red' : 'blue';
		return (c) => isBoardCell(c.q, c.r) && cellSide(c.q) !== far;
	}

	/**
	 * Predicate: is a cell currently occupied by an actor other than those in
	 * `exclude`? Used to keep a moving fighter from stepping onto (or through) a
	 * cell another character is standing on; the movers themselves are excluded so
	 * their own start cell never counts as blocked.
	 */
	private occupied(exclude: Actor[]): (c: Cell) => boolean {
		const taken = new Set<string>();
		for (const other of this.actors) {
			if (exclude.includes(other)) continue;
			taken.add(`${other.column},${other.row}`);
		}
		return (c) => taken.has(`${c.q},${c.r}`);
	}

	/** The side rule combined with occupancy: `actor` may walk a cell only if it's
	 * on its own side and no other character is standing there. */
	private walkAllowed(actor: Actor): (c: Cell) => boolean {
		const side = this.sideAllowed(actor);
		const blocked = this.occupied([actor]);
		return (c) => side(c) && !blocked(c);
	}

	/**
	 * Settle an actor onto the standing mark of `cell`, claiming the whole cell —
	 * used when a duel's winner takes over the meeting cell once the loser leaves,
	 * moving from its half of the cell to its centre. Purely visual: the actor's
	 * logical cell is untouched, so a later duel on this cell re-splits it into
	 * halves as usual.
	 */
	async claimCell(id: string, cell: Cell): Promise<void> {
		const actor = this.findActor(id);
		if (!actor) return;
		await this.walkCells(actor, [], this.standPoint(actor, cell.q, cell.r));
	}

	/**
	 * Tint a cell in one side's colour while an occupant holds it, or restore the
	 * base board colour with null. The overlay redraws the cell's fill and outline
	 * above the base grid but beneath the characters.
	 */
	paintCell(cell: Cell, side: 'red' | 'blue' | null): void {
		if (!this.app) return;
		const k = `${cell.q},${cell.r}`;
		const existing = this.cellPaint.get(k);
		if (existing) {
			existing.parent?.removeChild(existing);
			existing.destroy();
			this.cellPaint.delete(k);
		}
		if (!side) return;

		const color = side === 'red' ? this.options.grids[0].color : this.options.grids[1].color;
		const graphics = new Graphics();
		graphics.poly(this.cellOutline(cell.q, cell.r));
		// The one cell on the board that is painted at all: the grid under it is drawn in
		// nothing (see drawBoard), so a takeover is the whole of what a cell's ground says.
		graphics.fill({ color, alpha: 0.35 });
		graphics.stroke({ width: 2, color, alpha: 1 });
		graphics.zIndex = 0.5; // above the base grid (0), below the actors
		this.app.stage.addChild(graphics);
		this.cellPaint.set(k, graphics);
	}

	/** Walk an actor back to the cell it started on — the ground it holds, which a
	 * strike run only ever borrows it away from. */
	async returnHome(id: string): Promise<void> {
		const actor = this.findActor(id);
		if (!actor) return;
		const home: Cell = { q: actor.homeColumn, r: actor.homeRow };
		// Its own ground, by a clear route through it, first. But a fighter walking back
		// off a strike run is standing in the far half, which its own side rule would
		// refuse to lead it out of, so the ways home loosen one rule at a time until one
		// of them answers: around the others over any ground, then straight over
		// everything. Coming home settles nothing, so no rule of the fight is spent here.
		const blocked = this.occupied([actor]);
		const anyCell = (c: Cell) => isBoardCell(c.q, c.r);
		const path =
			findPath(this.cellOf(actor), home, this.walkAllowed(actor)) ??
			findPath(this.cellOf(actor), home, this.sideAllowed(actor)) ??
			findPath(this.cellOf(actor), home, (c) => anyCell(c) && !blocked(c)) ??
			findPath(this.cellOf(actor), home, anyCell);
		if (!path) return;
		// Passing the home mark as the walk's end point also covers the fighter
		// whose home *is* the cell it logically occupies but who is standing half a
		// cell off centre after a shared-cell duel — it glides straight back.
		await this.walkCells(actor, path.slice(1), this.standPoint(actor, home.q, home.r));
	}

	/**
	 * Walk an actor to `cell` and **adopt it as its new home**, so this is where it
	 * stands from now on and where {@link returnHome} would bring it back to. Every
	 * lasting move on this board is one of these: the winner of a lane taking the white
	 * column it was played for, and the fighter that lost it retracting to the back of
	 * its own half. The ground either of them was holding is given up for good, not
	 * borrowed.
	 *
	 * Resolves once it has settled; a cell off the actor's own side is refused. An actor
	 * already standing on `cell` still settles onto its mark — which is how the winner of
	 * a duel, stopped flush against the fighter it just felled, glides to the middle of
	 * the cell they were both standing in.
	 */
	async regroup(id: string, cell: Cell): Promise<void> {
		const actor = this.findActor(id);
		if (!actor || !this.sideAllowed(actor)(cell)) return;
		// Route around whoever else is standing about; if occupancy boxes the actor
		// in, fall back to the side-only path so it still gets there.
		const path =
			findPath(this.cellOf(actor), cell, this.walkAllowed(actor)) ??
			findPath(this.cellOf(actor), cell, this.sideAllowed(actor));
		if (!path) return;
		await this.walkCells(actor, path.slice(1), this.standPoint(actor, cell.q, cell.r));
		actor.homeColumn = cell.q;
		actor.homeRow = cell.r;
	}

	/**
	 * Draw a fighter as beaten: its sprite carries {@link DEFEATED_ALPHA} from here on, and
	 * it stands at the outer end of its cell rather than in the middle of it
	 * ({@link fallenDrift}).
	 *
	 * Said of the fighter and not of the walk, so it is put on as the retreat begins and
	 * never taken off — a fighter that has been taken down is out of the fight for the rest
	 * of it, and comes back at the same weight it went off at. Which is why the drift is
	 * hung off the same flag: a fight picked up again marks its fallen with this before a
	 * turn is played, and they come back standing exactly where the fight left them.
	 *
	 * The *walk* out to that edge is the caller's, and is the retreat it was already
	 * making: this only says where the mark it is walking to has moved to, so a fighter
	 * felled mid-fight glides out under its own steam ({@link regroup}), and one placed by
	 * a resumed board is put there outright ({@link settleFallen}).
	 */
	fadeDefeated(id: string): void {
		const actor = this.findActor(id);
		if (!actor) return;
		actor.defeated = true;
		actor.sprite.alpha = DEFEATED_ALPHA;
	}

	/**
	 * Put a fallen fighter on its mark with no walk at all — where {@link regroup} would
	 * have glided it, arrived at.
	 *
	 * For the fight that is picked up rather than started: a resumed board stands every
	 * fighter it holds on the cell it was saved on, including the ones that were already
	 * down, and those were placed in the middle of their cells like everybody else before
	 * anything knew they were beaten. Walking them out from there would be replaying a
	 * retreat that happened turns ago, in front of a player who has just opened the fight.
	 */
	settleFallen(id: string): void {
		const actor = this.findActor(id);
		if (!actor) return;
		const stand = this.standPoint(actor, actor.homeColumn, actor.homeRow);
		actor.x = stand.x;
		actor.y = stand.y;
		actor.targetX = stand.x;
		actor.targetY = stand.y;
		actor.sprite.x = stand.x;
		actor.sprite.y = stand.y;
	}

	/**
	 * Run an attacker up to the fighter it is striking and stand it face to face with
	 * it, close enough for the blow to land. Resolves once it has settled there; the
	 * caller then plays the strike and walks it back ({@link returnHome}).
	 *
	 * It comes at the target's face: the red half leads with its right and the blue
	 * half (mirrored) with its left, so each closes on the cell beside the target on
	 * its own side of it and on the target's own row, which is what makes the pair
	 * read horizontally. Where that cell is taken (or off the board) it settles for
	 * the nearest cell it can reach instead.
	 *
	 * A strike run is the one thing on this board that crosses the white line. The
	 * line is about ground *held* — where a fighter stands between turns, and what a
	 * lane is won and lost over — and a blow is not ground taken: the attacker is back
	 * on its own cell before the turn is over. What it may not do is walk *through*
	 * whoever else is standing about, so the route is still laid around them.
	 */
	async closeIn(attackerId: string, targetId: string): Promise<void> {
		const attacker = this.findActor(attackerId);
		const target = this.findActor(targetId);
		if (!attacker || !target) return;
		const from = this.cellOf(attacker);
		const targetCell = this.cellOf(target);
		const beside: Cell = {
			q: targetCell.q + (attacker.side === 'blue' ? 1 : -1),
			r: targetCell.r
		};
		const blocked = this.occupied([attacker]);
		const open = (c: Cell) => isBoardCell(c.q, c.r) && !blocked(c);
		// Short of that cell it takes the nearest one it can reach that still leaves it
		// in front of the target — coming at a fighter from behind it is not a duel —
		// and only if even that is boxed in does it settle for the nearest cell at all.
		const inFront = (c: Cell) =>
			attacker.side === 'blue' ? c.q > targetCell.q : c.q < targetCell.q;
		const path =
			(open(beside) ? findPath(from, beside, open) : null) ??
			findClosestApproach(from, targetCell, (c) => open(c) && inFront(c))?.path ??
			findClosestApproach(from, targetCell, open)?.path;
		if (!path) return;
		await this.walkCells(attacker, path.slice(1), this.strikeMark(attacker, target));
	}

	/**
	 * Where an attacker stands to strike `target`: level with it, on its foot line,
	 * with the two sprites' leading edges flush — face to face and touching, without
	 * overlapping. The extents are read off each sprite's current frame (anchor
	 * fraction × scaled width); the blue half is mirrored, so for both of them the
	 * leading edge is the frame's far side.
	 */
	private strikeMark(attacker: Actor, target: Actor): Point {
		const lead = (actor: Actor) => (1 - actor.sprite.anchor.x) * Math.abs(actor.sprite.width);
		const gap = lead(attacker) + lead(target);
		return { x: attacker.side === 'blue' ? target.x + gap : target.x - gap, y: target.y };
	}

	/**
	 * Play one of a character's defined moves as a one-shot pose and resolve when
	 * it finishes. If the move binds no animation (or it failed to load), resolves
	 * immediately so combat still flows.
	 */
	playMove(id: string, move: CharacterMove): Promise<void> {
		return this.playAnimationOnce(id, move.source);
	}

	/**
	 * Stand a character *in* one of its moves and leave it there — the guard a fighter
	 * turned a blow aside with stands for as long as the blow does, rather than being a
	 * brace it throws once and drops, and is let out of by whoever put it up when the thing
	 * it was answering is over. The animation loops where every other pose plays out, because
	 * that is the difference between doing a thing and being in a state: a fighter covering
	 * is covering until it is told otherwise ({@link clearHold}).
	 *
	 * It is not a one-shot and owns nothing. Whatever the turn asks of the actor next —
	 * a walk, a strike, a flinch — plays straight over the top, and the actor drops back
	 * into the held move when that finishes instead of into idle. So a fighter can brace,
	 * be walked onto ground it has won, and still be braced when it gets there.
	 *
	 * The pose goes up on its own: what says a held pose is a *state* rather than a frame of
	 * animation is the ring, and the ring is asked for separately ({@link ringHold}) because
	 * it is answering something and the pose is not.
	 *
	 * A move binding no animation (or one that failed to load) clears the hold rather
	 * than freezing the actor: there is no pose to stand in, so it idles as before — and
	 * any ring goes with it, since there would be no stance left for it to be saying.
	 */
	holdMove(id: string, move: CharacterMove): void {
		const actor = this.findActor(id);
		if (!actor) return;
		actor.stance = move.source && actor.animations[move.source] ? move.source : null;
		// Into the pose now, unless something is already playing on the sprite — that
		// releases into the stance when it ends, so the hold lands either way.
		if (!actor.oneShot) this.setAnimation(actor, this.standing(actor));
		if (!actor.stance) this.clearRing(actor);
	}

	/**
	 * Ring the stance a character is holding, in `color` — the fighter's own, because whose
	 * guard it is is half of what the ring says.
	 *
	 * Kept apart from {@link holdMove} because the two happen at different moments. A guard
	 * is stood in from the moment it was ordered, but it only *does* anything when a blow
	 * arrives, so the ring comes up on the blow: the attacker closes in, throws its move, and
	 * the circle appears around what it is thrown at — read as the guard answering it rather
	 * than as a decoration the fighter has been wearing since the reveal.
	 *
	 * Nothing to ring is nothing done: a character standing in no stance is left alone, and
	 * one already ringed keeps the ring it has, so a second blow down the same lane does not
	 * blink it off and on again.
	 */
	ringHold(id: string, color: string, from: { id: string; color: string }): void {
		const actor = this.findActor(id);
		if (!actor || !actor.stance || actor.ring) return;
		this.drawRing(actor, color, from);
	}

	/** Let a character out of the move it was standing in, back to idle — and out of the
	 * ring that was saying it was in one. */
	clearHold(id: string): void {
		const actor = this.findActor(id);
		if (!actor || !actor.stance) return;
		actor.stance = null;
		this.clearRing(actor);
		if (!actor.oneShot) this.setAnimation(actor, 'idle');
	}

	/** Let every character out of whatever it was standing in — the turn holding them
	 * there is over. */
	clearHolds(): void {
		for (const actor of this.actors) this.clearHold(actor.id);
	}

	/**
	 * Draw the ring that says a character is holding a stance: a circle of its own colour
	 * around it, wide enough to enclose the whole character rather than to sit at its feet
	 * — it is a guard being read, not a mark on the floor.
	 *
	 * Sized off the actor's nominal box, which is its full reach over the whole animation
	 * cycle rather than the frame currently showing, so the ring holds still while the
	 * fighter breathes inside it. Over both fighters, for the reason the placing itself
	 * gives (see {@link updateRing}).
	 *
	 * A third of that circle is what is drawn (see {@link GUARD_ARC_SHARE}), swung round to
	 * face `from` — the fighter throwing the blow, which by this moment has walked up and is
	 * standing there.
	 */
	private drawRing(actor: Actor, color: string, from: { id: string; color: string }): void {
		if (!this.app) return;
		const radius = this.ringRadius(actor);
		const facing = this.angleTo(actor, from.id);
		// Half the arc's sweep either side of that: a third of a full turn is 2π/3, so half
		// of it is π/3 — which is what `Math.PI * GUARD_ARC_SHARE` comes to.
		const half = Math.PI * GUARD_ARC_SHARE;
		const ring = new Graphics();
		// Moved to the arc's first corner before it is swept, so the path starts on the arc
		// rather than wherever an empty path is taken to begin.
		ring.moveTo(Math.cos(facing - half) * radius, Math.sin(facing - half) * radius);
		ring.arc(0, 0, radius, facing - half, facing + half);
		// Round ends, which is a question a circle never had to answer: an arc has two of
		// them, and cut square they read as a piece broken off a ring rather than as a
		// shield being held up.
		ring.stroke({
			color: combatColorHex(color),
			width: GUARD_RING_WIDTH,
			alpha: 0.9,
			cap: 'round'
		});
		this.app.stage.addChild(ring);
		actor.ring = {
			graphics: ring,
			facing,
			sparkColor: combatColorHex(from.color),
			// Struck on the first tick rather than a frame-and-a-bit later: the guard is
			// answering a blow that is landing now.
			sinceSpark: SPARK_EVERY_MS
		};
		this.updateRing(actor, 0);
	}

	/**
	 * How far out a fighter's guard stands. One figure off the nominal box, so the arc and
	 * the points the sparks are struck from are measured the same way and a spark can never
	 * leave from a hair off the line it is coming off.
	 */
	private ringRadius(actor: Actor): number {
		return (Math.max(actor.displayWidth, actor.displayHeight) / 2) * GUARD_RING_RATIO;
	}

	/**
	 * The screen angle from the middle of `actor` to the middle of the character called
	 * `otherId` — middles rather than feet, because that is where a guard is centred and a
	 * blow is aimed.
	 *
	 * A fighter that cannot be found leaves the guard facing across the board: a red actor
	 * stands in the left half and a blue one in the right (see {@link drawBoard}), so facing
	 * away from your own half is facing whoever is coming. That is the fallback and not the
	 * rule — with both of them on the board the angle is the real one, which is what lets a
	 * guard read correctly against an attacker a row up or down.
	 */
	private angleTo(actor: Actor, otherId: string): number {
		const other = this.findActor(otherId);
		if (!other) return actor.side === 'red' ? 0 : Math.PI;
		return Math.atan2(
			other.y - other.displayHeight / 2 - (actor.y - actor.displayHeight / 2),
			other.x - actor.x
		);
	}

	/** Keep a stance ring centred on the character it belongs to as it walks, and go on
	 * striking sparks off it for as long as it is up. */
	private updateRing(actor: Actor, deltaMs: number): void {
		const ring = actor.ring;
		if (!ring) return;
		ring.graphics.x = actor.x;
		// Around the middle of the character, not its feet: the actor's own y is the foot
		// line it stands on, and a circle centred there would be a ring around its ankles.
		ring.graphics.y = actor.y - actor.displayHeight / 2;
		// In front of both fighters, which a full circle never had to be. Drawn behind them
		// — a fighter standing *in* its guard rather than behind it — a circle still showed
		// its top, its foot and the side away from the blow, so the mark read; an arc has
		// only the side the blow is on, and that is the side the attacker has just walked up
		// and planted itself on, so the whole of it was under somebody else's sprite. A
		// shield is between the fighter and what is coming at it either way. Just over the
		// order buttons, which stand at 5000 at the highest and in the middle column, where
		// a blow is thrown, so the two do meet: a guard is something happening, a button is
		// furniture, and the two left on the same number would have been settled by
		// whichever was added first.
		ring.graphics.zIndex = actor.y + 6000;
		// Struck at a rate rather than per frame, so a board running at 120Hz throws the same
		// sparks as one running at 60, and a frame the browser sat on throws the ones it owes.
		ring.sinceSpark += deltaMs;
		while (ring.sinceSpark >= SPARK_EVERY_MS) {
			ring.sinceSpark -= SPARK_EVERY_MS;
			this.spraySparks(actor, ring.facing, ring.sparkColor, SPARK_PER_STRIKE, 'off');
		}
	}

	/**
	 * The one piece of artwork every spark is drawn from: a white dot, made on the first
	 * strike of the fight and kept. White because a spark's colour is a tint over it, and a
	 * tint only ever darkens — white artwork is what makes any colour reachable, the same
	 * reason the canvas's glyphs are vendored white.
	 */
	private sparkArt(): GraphicsContext {
		this.sparkContext ??= new GraphicsContext().circle(0, 0, SPARK_SIZE).fill({ color: 0xffffff });
		return this.sparkContext;
	}

	/**
	 * Throw sparks off a fighter: `count` of them, each leaving a point somewhere along the
	 * third of the circle that faces `facing` — the side a blow arrives on — and left to
	 * fly, fall and fade on its own ({@link updateSparks}).
	 *
	 * `sense` is the whole difference between the two things this board throws sparks for.
	 * `off` sends each one back out the way it came, which is what a guard does to a blow:
	 * the shield turned it, so the sparks return to whoever swung. `through` sends them the
	 * way the blow was going instead — out of the far side of a fighter that failed to turn
	 * it. Same points, same colour, same speeds; the sign is the event.
	 *
	 * Everything about one is drawn out of the same two numbers the arc is: where on the
	 * sweep it comes off, and which way it is pointing. So the sparks cannot drift away from
	 * the fighter they belong to however it happens to be standing.
	 */
	private spraySparks(
		actor: Actor,
		facing: number,
		color: number,
		count: number,
		sense: 'off' | 'through'
	): void {
		if (!this.app) return;
		const radius = this.ringRadius(actor);
		const half = Math.PI * GUARD_ARC_SHARE;
		// Where the spray is centred, from the middle of the fighter: the actor's own y is
		// the line it stands on, so the middle of it is half a height up.
		const midX = actor.x;
		const midY = actor.y - actor.displayHeight / 2;
		for (let i = 0; i < count; i++) {
			const at = facing + (Math.random() * 2 - 1) * half;
			const flight = (sense === 'off' ? at : at + Math.PI) + (Math.random() * 2 - 1) * SPARK_SPREAD;
			const speed = SPARK_SPEED * (1 + (Math.random() * 2 - 1) * (SPARK_SPEED_SPREAD / 2));
			// One dot's geometry, drawn once and shared by every spark there will ever be, with
			// the colour put on as a tint (see sparkArt). A shower is hundreds of these in the
			// air at once, and hundreds of Graphics each carrying their own copy of the same
			// circle is hundreds of things for the renderer to keep apart rather than one thing
			// drawn many times.
			const graphics = new Graphics(this.sparkArt());
			graphics.tint = color;
			graphics.x = midX + Math.cos(at) * radius;
			graphics.y = midY + Math.sin(at) * radius;
			// Over the fighters and their guards: a spark is what the blow did, so nothing it
			// came off should be in front of it.
			graphics.zIndex = actor.y + 10000;
			this.app.stage.addChild(graphics);
			this.sparks.push({
				graphics,
				vx: Math.cos(flight) * speed,
				vy: Math.sin(flight) * speed,
				elapsed: 0
			});
		}
	}

	/** Fly every spark on: pulled down as it goes, shrinking and fading over its life, and
	 * taken off the board at the end of it. */
	private updateSparks(deltaMs: number): void {
		if (this.sparks.length === 0) return;
		const seconds = deltaMs / 1000;
		const remaining: Spark[] = [];
		for (const spark of this.sparks) {
			spark.elapsed += deltaMs;
			const t = spark.elapsed / SPARK_LIFE_MS;
			if (t >= 1) {
				spark.graphics.parent?.removeChild(spark.graphics);
				spark.graphics.destroy();
				continue;
			}
			spark.vy += SPARK_GRAVITY * seconds;
			spark.graphics.x += spark.vx * seconds;
			spark.graphics.y += spark.vy * seconds;
			// Bright the whole way and then gone would be a dot switching off; it goes out
			// instead, and gets smaller as it cools.
			spark.graphics.alpha = 1 - t * t;
			spark.graphics.scale.set(1 - t * 0.5);
			remaining.push(spark);
		}
		this.sparks = remaining;
	}

	/** Take a character's stance ring off the board. Whatever sparks it has already struck
	 * are left in the air to fall on their own — they came off it, they are not part of it. */
	private clearRing(actor: Actor): void {
		if (!actor.ring) return;
		actor.ring.graphics.parent?.removeChild(actor.ring.graphics);
		actor.ring.graphics.destroy();
		actor.ring = null;
	}

	/** Play a character's hurt flinch once; resolves when it finishes. */
	playHurt(id: string): Promise<void> {
		const actor = this.findActor(id);
		return this.playAnimationOnce(id, actor?.hurtAnim ?? '');
	}

	/**
	 * Burn a looping aura of `color` behind a character for the round. The frames
	 * come from static/auras/<color>/ (scripts/generate-auras.js); the aura sits
	 * base-down at the actor's feet, scaled to envelop the character, and follows
	 * it as it moves. Replaces any aura the actor already has.
	 *
	 * It arrives rather than appearing: the flame comes up off the fighter's feet to
	 * its full height over {@link AURA_RISE_MS}, which is the whole of what is drawn
	 * about a fighter loading — a charge produces something the moment it is given,
	 * and this is that something happening, so nothing needs to say it in words.
	 */
	async showAura(id: string, color: string): Promise<void> {
		const actor = this.findActor(id);
		if (!actor || !this.app) return;
		const frames = await this.loadAuraFrames(color);
		if (frames.length === 0) return;
		// The board may have been torn down (or the aura replaced) while loading.
		if (!this.app || !this.actors.includes(actor)) return;
		this.clearAura(id);

		const sprite = new Sprite(frames[0]);
		// Base-down behind the character: bottom-centre on the actor's feet. The
		// flame is stretched per axis to envelop the character's nominal size, so
		// wide and tall sprites alike sit inside their aura. The anchor at the foot
		// is also what the rise is measured from — scaling this sprite's height moves
		// its top and leaves its base on the ground.
		sprite.anchor.set(0.5, 1);
		const scaleX = (actor.displayWidth * AURA_WIDTH_RATIO) / frames[0].width;
		const scaleY = (actor.displayHeight * AURA_HEIGHT_RATIO) / frames[0].height;
		// Flat on the ground to begin with: the first tick brings it up (see updateAura).
		sprite.scale.set(scaleX * AURA_RISE_WIDTH, 0);
		sprite.alpha = 0.85;
		sprite.x = actor.x;
		sprite.y = actor.y;
		sprite.zIndex = actor.y - 0.5;
		this.app.stage.addChild(sprite);
		actor.aura = { sprite, frames, frameIndex: 0, frameElapsed: 0, scaleX, scaleY, rise: 0 };
	}

	/** Put out a character's aura, if it has one. */
	clearAura(id: string): void {
		const actor = this.findActor(id);
		if (!actor?.aura) return;
		actor.aura.sprite.parent?.removeChild(actor.aura.sprite);
		actor.aura.sprite.destroy();
		actor.aura = null;
	}

	/** Put out every aura on the board. */
	clearAuras(): void {
		for (const actor of this.actors) this.clearAura(actor.id);
	}

	/**
	 * Float a short callout above a character — what its turn amounted to
	 * (`BLOCK`, `HIT!`) — tinted in `color`, so a turn in which every
	 * fighter acts at once can still be read off the board a fighter at a time.
	 * Replaces any existing callout on that character.
	 */
	showCallout(id: string, text: string, color: string): void {
		const actor = this.findActor(id);
		if (!actor || !this.app) return;
		this.clearCallout(id);
		const label = this.calloutText(text, combatColorHex(color));
		this.app.stage.addChild(label);
		actor.label = label;
		this.updateLabel(actor);
	}

	/**
	 * Float one callout over a **cell** rather than over a fighter, for something that
	 * happened to a piece of ground instead of to somebody: two attacks meeting in the
	 * middle of a lane, which is one event and belongs to neither of the pair that caused
	 * it. Said over each of them it read as two things happening at once, and as each
	 * fighter's own doing, when the whole point of a clash is that it is the one thing and
	 * nobody's.
	 *
	 * White, for the same reason — a clash is not either side's, and the ground it happens
	 * on is the white column. Placed clear above the heads of anybody standing in that cell,
	 * so it sits over the collision rather than in it: a character stands
	 * {@link CHAR_HEIGHT_RATIO} cell widths tall from the cell's own foot line, and the
	 * label's foot goes a little above where that reaches.
	 *
	 * Taken down with every other callout ({@link clearCallouts}) — it belongs to the turn
	 * it was drawn in, like everything else said on this board.
	 */
	showCellCallout(cell: Cell, text: string): void {
		if (!this.app) return;
		const label = this.calloutText(text, 0xffffff);
		const foot = cellFoot(cell.q, cell.r);
		const at = this.project(foot.x, foot.y - CHAR_HEIGHT_RATIO - CELL_CALLOUT_GAP);
		label.x = at.x;
		label.y = at.y;
		// Over everything the lane holds, as a callout is: what has just happened is never
		// covered by whoever it happened to.
		label.zIndex = at.y + 10000;
		this.app.stage.addChild(label);
		this.cellLabels.push(label);
	}

	/** The type every callout on this board is set in, whatever it is anchored to. */
	private calloutText(text: string, fill: number): Text {
		const label = new Text({
			text,
			style: {
				fill,
				fontSize: 28,
				fontWeight: '900',
				fontFamily: 'system-ui, sans-serif',
				stroke: { color: 0x000000, width: 6 },
				align: 'center'
			}
		});
		// The anchor point is the label's foot, so a caller places the line it sits above.
		label.anchor.set(0.5, 1);
		return label;
	}

	/**
	 * Throw sparks off a fighter a blow got through to, in `from`'s colour — the same spray
	 * a guard throws, sent on through instead of back (see {@link HIT_SPARKS}).
	 *
	 * The blow is coming from the same place either way, so the spray is aimed the same way
	 * it is for a guard: off the side of the struck fighter that `from` is standing on. What
	 * differs is where it goes — away from the attacker rather than back at it, because
	 * nothing here turned the blow around. One burst, then each spark is on its own
	 * ({@link updateSparks}), so callers fire and forget exactly as they did with the mark
	 * this replaced.
	 */
	showHit(id: string, from: { id: string; color: string }): void {
		const actor = this.findActor(id);
		if (!actor) return;
		this.spraySparks(
			actor,
			this.angleTo(actor, from.id),
			combatColorHex(from.color),
			HIT_SPARKS,
			'through'
		);
	}

	/**
	 * Throw one burst off a fighter as if it had turned `from`'s blow aside: the guard's own
	 * spray, in `from`'s colour, coming back off the side `from` is standing on — with no
	 * guard up and none asked for.
	 *
	 * What it is for is a blow stopped by another blow. Two fighters that went at each other
	 * at once have both their blows come to nothing, which is the same thing happening to
	 * each of them as happens to a fighter whose blow a shield turned — so it is drawn the
	 * same way, twice, once for each blow (see the controller's exchange). Each fighter ends
	 * up watching its own colour come back at it, which is what a blow stopped by something
	 * looks like from the end that threw it.
	 *
	 * One burst rather than the guard's tick-by-tick spray, because there is no guard to be
	 * up for a stretch of time: two blows meet at a moment and are done.
	 */
	showParry(id: string, from: { id: string; color: string }): void {
		const actor = this.findActor(id);
		if (!actor) return;
		this.spraySparks(
			actor,
			this.angleTo(actor, from.id),
			combatColorHex(from.color),
			HIT_SPARKS,
			'off'
		);
	}

	/** Remove a character's callout, if it has one. */
	clearCallout(id: string): void {
		const actor = this.findActor(id);
		if (!actor?.label) return;
		actor.label.parent?.removeChild(actor.label);
		actor.label.destroy();
		actor.label = null;
	}

	/** Clear every callout on the board. */
	clearCallouts(): void {
		for (const actor of this.actors) this.clearCallout(actor.id);
		// And the ones pinned to ground rather than to anybody, which no actor would take
		// down for us.
		for (const label of this.cellLabels) {
			label.parent?.removeChild(label);
			label.destroy();
		}
		this.cellLabels = [];
	}

	// --- Order buttons --------------------------------------------------------

	/**
	 * Say what happens when an order button is tapped. The board reports the actor it
	 * belongs to and the caller's own id for the order; it never decides anything
	 * about what an order is or whether it was sensible.
	 */
	onOrder(handler: (actorId: string, orderId: string) => void): void {
		this.orderHandler = handler;
	}

	/**
	 * Give a fighter the orders it can be given, drawn as a column of square buttons that
	 * fills one cell of the board ({@link ORDER_COLUMN_COUNT}), on the fighter's own row
	 * and flush inside one of that cell's two ruled sides.
	 *
	 * `placement` says which cell and which side ({@link OrderPlacement}), and is the
	 * caller's to decide because it is about the fight and not about the board: whose
	 * orders these are, whether they belong on the ground being played for or on the
	 * fighter's own, and which border they are read against are all things about the game.
	 *
	 * Called on every change of the fight's state, so it rebuilds only when the *set*
	 * of orders changes and otherwise just repaints the buttons it already has: a
	 * strip torn down and rebuilt each time would drop the pointer state mid-tap and
	 * flicker its glyphs while their textures reloaded. An empty list clears the strip.
	 */
	setOrders(
		actorId: string,
		orders: BoardOrder[],
		placement: OrderPlacement = { cell: 'center', side: 'right' }
	): void {
		const actor = this.findActor(actorId);
		if (!actor || !this.app) return;
		if (orders.length === 0) {
			this.clearOrders(actor);
			return;
		}

		const sameSet =
			actor.orders?.buttons.length === orders.length &&
			actor.orders.buttons.every((button, i) => button.id === orders[i].id);
		if (!sameSet) {
			this.clearOrders(actor);
			actor.orders = this.buildOrders(actor, orders, placement);
		}

		const strip = actor.orders;
		if (!strip) return;
		strip.placement = placement;
		const size = this.orderSize();
		orders.forEach((order, i) => {
			const button = strip.buttons[i];
			if (!button) return;
			const color = order.color;
			const empty = order.empty ?? false;
			const inverted = order.inverted ?? false;
			const gift = order.gift ?? false;
			if (
				button.selected === order.selected &&
				button.disabled === order.disabled &&
				button.color === color &&
				button.empty === empty &&
				button.inverted === inverted &&
				button.gift === gift
			)
				return;
			button.selected = order.selected;
			button.disabled = order.disabled;
			button.color = color;
			button.empty = empty;
			button.inverted = inverted;
			button.gift = gift;
			this.paintMark(button, size);
		});
		this.updateOrders(actor);
	}

	/** Build a fighter's strip: one button per order, glyphs loaded as they arrive. */
	private buildOrders(actor: Actor, orders: BoardOrder[], placement: OrderPlacement): OrderStrip {
		const container = new Container();
		container.sortableChildren = false;
		this.app!.stage.addChild(container);
		const size = this.orderSize();

		const buttons = orders.map((order) => {
			const face = new Graphics();
			const glyph = new Sprite();
			glyph.anchor.set(0.5);
			const button: BoardMark = {
				id: order.id,
				container: new Container(),
				face,
				glyph,
				selected: order.selected,
				disabled: order.disabled,
				color: order.color,
				empty: order.empty ?? false,
				inverted: order.inverted ?? false,
				gift: order.gift ?? false
			};
			button.container.addChild(face, glyph);
			// A reporting button is not an input, and neither is an empty slot: both are left
			// with no event mode at all, so they take no pointer, show no cursor and cannot be
			// hit-tested — rather than taking the tap and dropping it, which is a button that
			// looks pressable and does nothing.
			if (!order.readonly && !order.empty) {
				// The button itself takes the tap, so the hit area is exactly its face.
				button.container.eventMode = 'static';
				button.container.cursor = 'pointer';
				button.container.on('pointertap', () => {
					if (button.disabled) return;
					this.orderHandler?.(actor.id, button.id);
				});
			}
			container.addChild(button.container);

			// An empty slot has no artwork to fetch and no glyph to show it in.
			if (!order.empty) {
				void this.loadIcon(order.icon).then((texture) => {
					// The strip may have been rebuilt (or the board torn down) while loading.
					if (!texture || glyph.destroyed) return;
					glyph.texture = texture;
					this.layOutOrders(actor);
				});
			}
			this.paintMark(button, size);
			return button;
		});

		const strip: OrderStrip = { container, buttons, placement };
		actor.orders = strip;
		this.layOutOrders(actor);
		return strip;
	}

	/**
	 * Repaint one mark for its current state: chosen, plain, out of reach — or an empty
	 * slot, which is none of those and is drawn as the outline of one.
	 *
	 * The one painter for everything on this board drawn in this shape, told the size it is
	 * drawing at. A second painter is two pictures that can drift apart.
	 */
	private paintMark(mark: BoardMark, size: MarkSize): void {
		const { width, height } = size;
		const radius = height * ORDER_RADIUS_RATIO;
		mark.face.clear();

		if (mark.empty) {
			// Nothing filled: an unfilled rounded rect is a place kept rather than a button
			// that has lost its picture, which is what a dark face with no glyph on it would
			// read as beside three that have one.
			mark.face.roundRect(-width / 2, -height / 2, width, height, radius);
			mark.face.stroke({ width: 2, color: 0xffffff, alpha: ORDER_EMPTY_ALPHA });
			mark.glyph.alpha = 0;
			return;
		}

		// The chosen order takes the fighter's own colour, so a fighter's orders read as
		// belonging to it rather than to some palette of the interface's own.
		const chosen = combatColorHex(mark.color);
		// Inside out until it is chosen: a white face carrying a coloured glyph, which is a
		// mark on the fighter rather than an order it can be given, and reads as one without
		// having to be read. Being chosen turns it the right way up — the strongest state a
		// mark has, and the same one a chosen order takes.
		const invert = mark.inverted && !mark.selected;
		const fill = mark.disabled
			? ORDER_DISABLED_FILL
			: invert
				? ORDER_INVERTED_FILL
				: mark.selected
					? chosen
					: ORDER_IDLE_FILL;

		mark.face.roundRect(-width / 2, -height / 2, width, height, radius);
		mark.face.fill({ color: fill });
		mark.face.roundRect(-width / 2, -height / 2, width, height, radius);
		mark.face.stroke({ width: 2, color: 0x000000, alpha: 0.45 });

		// Tint only ever darkens, so the glyph artwork is white and the tint is what
		// gives it its colour. A disabled glyph fades toward its own background rather
		// than vanishing, so an order out of reach still reads as an order.
		mark.glyph.tint = invert ? chosen : 0xffffff;
		mark.glyph.alpha = mark.disabled ? ORDER_DISABLED_ALPHA : 1;

		if (!mark.gift) return;
		// The dot goes in the top-right corner of the face, drawn in the fighter's colour as
		// everything on this board that says something about one fighter is — and ringed in
		// white, because a chosen order fills its whole face with that very colour and a bare
		// dot would disappear into it. Inside the face rather than straddling its corner: a
		// column fills its cell of the board exactly, and a mark that overhung would be the
		// one thing on the button crossing the ruled line the column is drawn up to.
		const dot = height * GIFT_DOT_RATIO;
		const inset = dot + GIFT_DOT_RING;
		mark.face.circle(width / 2 - inset, -height / 2 + inset, dot);
		mark.face.fill({ color: chosen });
		mark.face.circle(width / 2 - inset, -height / 2 + inset, dot);
		mark.face.stroke({ width: GIFT_DOT_RING, color: 0xffffff });
	}

	/**
	 * Size one mark's glyph to its face, once its artwork has arrived. Square raster in,
	 * one scale out ({@link ICON_RASTER_PX}), so the picture lands inside the face on every
	 * side whatever shape the glyph itself is.
	 */
	private fitGlyph(mark: BoardMark, height: number): void {
		const glyph = mark.glyph;
		if (!glyph.texture || glyph.texture.width <= 0) return;
		const target = height * ORDER_ICON_RATIO;
		glyph.scale.set(target / Math.max(glyph.texture.width, glyph.texture.height));
	}

	/**
	 * A button's drawn size: a cell's side less the room left around a column
	 * ({@link ORDER_PAD_RATIO}), split {@link ORDER_COLUMN_COUNT} ways with the gaps taken
	 * out of it, and **square** — a cell is square and the three of them fill one padded
	 * side of it end to end, so a button is as wide as its share of that side is tall. One
	 * size for every fighter, because one size is what a cell is, and one size for the whole
	 * fight, whatever else comes and goes from the column.
	 *
	 * A square this size is close to a quarter of a cell wide, so a column and the padding
	 * that frames it take about a third of the cell it stands in and the rest of that
	 * ground — the middle of the white column, a rival's own standing room — is still
	 * plainly there beside it.
	 */
	private orderSize(): MarkSize {
		const height = this.cellWidth() * ORDER_HEIGHT_RATIO;
		return { width: height, height, gap: height * ORDER_SPACING_RATIO };
	}

	/**
	 * Screen x of the two lines the column `q` is ruled between. A column's x owes nothing
	 * to which row it is taken on, the field being a rectangle, so any row answers for the
	 * whole of it.
	 */
	private columnEdges(q: number): { left: number; right: number } {
		const middle = cellCenter(q, 0).x;
		return { left: this.project(middle - 0.5, 0).x, right: this.project(middle + 0.5, 0).x };
	}

	/**
	 * Stack the buttons in a column and size their glyphs to fit. The column is laid out
	 * upward from its own origin — the floor of the cell it stands in
	 * ({@link updateOrders}) — so the bottom button sits on the line under that cell and
	 * the rest rise from it, while the list still reads top to bottom in the order it was
	 * handed in. Three buttons and their gaps are a cell tall ({@link ORDER_COLUMN_COUNT}),
	 * so the top one finishes on the line over it and the column is the cell.
	 */
	private layOutOrders(actor: Actor): void {
		const strip = actor.orders;
		if (!strip) return;
		const size = this.orderSize();
		const { height, gap } = size;
		const step = height + gap;
		const column = strip.buttons.length * height + (strip.buttons.length - 1) * gap;
		const start = -column + height / 2;
		strip.buttons.forEach((button, i) => {
			button.container.x = 0;
			button.container.y = start + i * step;
			this.paintMark(button, size);
			this.fitGlyph(button, height);
		});
	}

	/** Keep a fighter's column of orders standing in the cell it was placed in
	 * ({@link OrderPlacement}) — the middle column or the fighter's own — on the fighter's
	 * own row, inside that cell's left or right ruled side by {@link ORDER_PAD_RATIO}.
	 *
	 * A column is a whole cell tall ({@link ORDER_COLUMN_COUNT}, that padding included), so
	 * it is stood on the cell's **floor** and not on the foot line its fighter stands on: a
	 * fighter plants itself a quarter of a cell up from that floor ({@link cellFoot}), and a
	 * full cell anchored there would hang the same quarter over the line into the row above.
	 * The drop from the one to the other is measured off the grid itself — a cell's bottom
	 * corner against its own foot line — so nothing here has to know what fraction of a
	 * cell a figure stands at. Taking it off `actor.y` rather than off the row keeps it
	 * with a fighter that is mid-step, whose feet are between two rows.
	 *
	 * The x is the board's, so a strip is on a ruled line rather than wherever its sprite
	 * happens to have got to: for a `center` placement that line never moves, and for a
	 * `fighter` one it is the column the fighter is *recorded* on — which is the cell it is
	 * stepping to from the moment the step starts, so the orders arrive on the new cell and
	 * the fighter walks in under them rather than dragging them behind it. */
	private updateOrders(actor: Actor): void {
		const strip = actor.orders;
		if (!strip) return;
		const { width } = this.orderSize();
		const { cell, side } = strip.placement;
		const edges = this.columnEdges(cell === 'fighter' ? actor.column : 0);
		const pad = this.cellWidth() * ORDER_PAD_RATIO;
		const footToFloor = (cellCorners(0, 0)[2].y - cellFoot(0, 0).y) * this.cellWidth();
		const reach = pad + width / 2;
		strip.container.x = side === 'left' ? edges.left + reach : edges.right - reach;
		strip.container.y = actor.y + footToFloor - pad;
		// Above the board, below the callouts and the sparks — but which side of its own
		// fighter it goes depends on whose cell it is standing in. Orders laid on the middle
		// column are on ground nobody is standing on, so they go over everything on the
		// board; orders standing on the fighter's own cell are *on the fighter*, and there
		// the character is what a reader is looking at and the buttons are what is being
		// said about it, so they pass behind its sprite (which sits at its own `y`) — over
		// the charge aura under it, under the fighter itself. It is a reading either way:
		// nothing behind a sprite is a thing to tap, and a rival's orders are not offered
		// as one.
		strip.container.zIndex = cell === 'fighter' ? actor.y - 0.25 : actor.y + 5000;
	}

	/** Take a fighter's strip off the board. */
	private clearOrders(actor: Actor): void {
		const strip = actor.orders;
		if (!strip) return;
		actor.orders = null;
		strip.container.parent?.removeChild(strip.container);
		strip.container.destroy({ children: true });
	}

	/**
	 * Load (and cache) one icon glyph, rasterised into a known square at a resolution
	 * worth looking at. Resolves to null if it cannot be had, so a missing icon costs the
	 * mark its picture and nothing else.
	 *
	 * The size is given rather than taken from the file, because a file's own `width` is
	 * not a statement about how much resolution the artwork in it deserves — see
	 * {@link ICON_RASTER_PX} for what taking it was costing. Mipmaps are asked for with it:
	 * a 256px glyph drawn at about 48 is a heavy minification, and sampling one straight
	 * off the full-size bitmap picks a sparse scatter of its pixels, which is what makes
	 * fine artwork crawl and sparkle as the thing it is pinned to moves.
	 *
	 * One texture serves every mark that names the same glyph — the order buttons and the
	 * gift marks at a fighter's feet both come through here — so it is rasterised for the
	 * largest of them and each scales the one bitmap down to its own size.
	 */
	private async loadIcon(url: string): Promise<Texture | null> {
		const cached = this.iconTextures.get(url);
		if (cached) return cached;
		try {
			const texture = await Assets.load<Texture>({
				src: url,
				// `width`/`height` are what the SVG parser rasterises into; the rest is passed
				// on to the texture source it builds around that bitmap.
				data: {
					width: ICON_RASTER_PX,
					height: ICON_RASTER_PX,
					autoGenerateMipmaps: true,
					scaleMode: 'linear'
				}
			});
			this.iconTextures.set(url, texture);
			return texture;
		} catch {
			return null;
		}
	}

	/** Load (and cache) the frame textures of one aura color. Resolves to an
	 * empty list for colors with no generated frames, so callers can no-op. */
	private async loadAuraFrames(color: string): Promise<Texture[]> {
		const cached = this.auraTextures.get(color);
		if (cached) return cached;
		try {
			const frames = await Promise.all(
				Array.from({ length: AURA_FRAMES }, (_, i) =>
					Assets.load<Texture>(`/assets/auras/${color}/${i + 1}.png`)
				)
			);
			this.auraTextures.set(color, frames);
			return frames;
		} catch {
			return [];
		}
	}

	/**
	 * Finish whatever one-shot currently owns an actor's sprite, resolving whoever is
	 * awaiting it. A pose is over the moment something takes the sprite off it, and a
	 * caller waiting on the pose it no longer owns would otherwise wait for ever —
	 * which strands the turn playing it out.
	 */
	private settleOneShot(actor: Actor): void {
		const shot = actor.oneShot;
		if (!shot) return;
		actor.oneShot = null;
		shot.resolve();
	}

	/**
	 * Play a loaded raw animation as a one-shot and resolve when it finishes. If
	 * the actor has no such animation, resolves immediately so combat still flows.
	 * Any pose already playing is settled first — it has lost the sprite.
	 */
	private playAnimationOnce(id: string, name: string): Promise<void> {
		const actor = this.findActor(id);
		const frames = actor && name ? actor.animations[name] : undefined;
		if (!actor || !name || !frames || frames.length === 0) return Promise.resolve();
		this.settleOneShot(actor);
		const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
		this.setAnimation(actor, name);
		actor.frameIndex = 0;
		actor.frameElapsed = 0;
		return new Promise((resolve) => {
			actor.oneShot = { total, elapsed: 0, resolve };
		});
	}
}
