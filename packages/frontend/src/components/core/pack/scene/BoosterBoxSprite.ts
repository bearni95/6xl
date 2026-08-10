/**
 * BoosterBoxSprite
 *
 * One unopened booster box, drawn on a canvas: the same object BoosterBox.svelte draws in
 * the document, surface for surface. A lid seen from above with its four corners cut off,
 * and under it the front of the box — four fifths of the width, the width the cut leaves the
 * lid's front edge — with the two bevel faces those cuts opened running down its sides. On
 * the front, the show's poster edge to edge, the place the box belongs to laid over the head
 * of it and the show's wordmark over the foot.
 *
 * It is a recreation and not an approximation: every figure below is the figure the
 * component's CSS is written with, and where the document leans on the browser (a
 * perspective, a skew, an `object-cover`, a gradient) the same thing is worked out here in
 * the small. What the two cannot share is the *form* — a canvas takes no classes and Tailwind
 * emits no arbitrary value it cannot see spelled out — so the tones are kept in one file
 * written in both languages (see box-stock.ts) and the geometry is stated here beside the
 * derivation the component states beside its own.
 *
 * A box is built at a width and keeps it. Everything it draws is a share of that width, so a
 * host that wants it bigger or smaller scales the container rather than asking for another
 * one; only a change of a size or so is worth rebuilding for, which is the grid's call and
 * not this class's.
 */

import {
	Application,
	BlurFilter,
	Container,
	FillGradient,
	Graphics,
	Matrix,
	PerspectiveMesh,
	Sprite,
	Text,
	Texture
} from 'pixi.js';
import { SpawnBox } from '$types/character-spawn.type';
import { textureCache } from '$utils/card/texture-cache';
import restoreCatalanArticle from '$utils/string/restore-catalan-article';
import { spawnYearLabel } from '$utils/spawn/year';
import { PACK_STOCK_TONES, type PackStockTones } from '../box-stock';
import { showGlyphTexture } from './show-glyph-texture';
import { BoxCrumble, CRUMBLE_SWEEP_MS, makeCellTextures, type CellTextures } from './BoxCrumble';

// --- The box, in shares of its own width ------------------------------------------
// The front is 3:4, the very box a CharacterStatue is drawn in. The lid is a sixth of the
// width deep and sits on top of it, which with a front four fifths as wide as the lid makes
// the whole thing 30:37 — 16/15 of a width for the front and another 1/6 above it.

const BOX_ASPECT = 37 / 30;
const LID_DEPTH = 1 / 6;
const FRONT_WIDTH = 0.8;
const FRONT_INSET = (1 - FRONT_WIDTH) / 2;
const FRONT_HEIGHT = BOX_ASPECT - LID_DEPTH;

// The lid: the square top of the box, laid flat and seen in perspective rather than a
// trapezoid drawn to look like one, turned about the square's front edge — which is the top
// edge of the front. Turning a square of side S about its front edge by θ, seen from a
// distance d, puts its back edge at r = d/(d + S·sin θ) of the front's width and draws it
// S·cos θ·r deep; wanting a back edge 66% of the front's and a depth of S/6 gives
// θ = 75.373° and d = 1.8783·S. The distance is in widths, the square being the box's own
// width square.
const LID_TILT = (75.373 * Math.PI) / 180;
const LID_DISTANCE = 1.87826;

// The lid's four corners are cut off — an octagon rather than a square: a tenth off each end
// of the front and back edges, and 23% off each end of the two sides. A tenth along the front
// because the front below is four fifths of the width centred under it, so the flat run along
// the lid's front edge is exactly the front's own width and the two line up down both sides.
// The 23% is what the diagonal's angle is made of: it stands the cut at 47.83°, within a fifth
// of a degree of the bevel CharacterStatue's floor is cut at. Given in the square *before* the
// tilt, as the clip-path is — the projection maps whatever shape is left, so the four diagonals
// are laid down with the lid and read as bevelled edges of it.
const LID_CUT: ReadonlyArray<readonly [number, number]> = [
	[0.1, 0],
	[0.9, 0],
	[1, 0.23],
	[1, 0.77],
	[0.9, 1],
	[0.1, 1],
	[0, 0.77],
	[0, 0.23]
];

// The show's mark is stamped on the lid at four fifths of the square, centred — so it keeps a
// margin off the corners the cut takes, and it is laid down *with* the lid rather than
// standing up on it.
const GLYPH_SIZE = 0.8;

// What a cut corner leaves is a face, and these are the two front ones. Their geometry is read
// off the cut rather than chosen: the cut's inner end is the tenth mark along the front edge,
// its outer end is on the lid's side 23% of the way back, where the perspective has drawn the
// side in to 0.05301 of the width and lifted it 0.05193 above the front edge. So a face is
// 0.04703 of the width wide and the edge across its top rises 0.05193 over that width — 47.83°,
// applied as a skew about the inner edge, which leaves nothing vertical to measure: the strip
// is simply as tall as the front it stands beside.
const BEVEL_WIDTH = 0.04703;
const BEVEL_SKEW = Math.tan((47.83 * Math.PI) / 180);

// The cover again on each bevel face: the same picture, turned over left to right, a third of
// its width, and the third that shows is the one against the front. It is given the front's own
// box to cover, so the crop is exactly what the front is showing whatever proportions the
// poster has; the strip is then made out of that by transform — a third of the front's width
// squashed into the face's 0.04703 is a scale of 0.17636, negative because the picture is
// turned over. Squashing sideways leaves every row where it was, so the column at the joint is
// the front's own edge column row for row. Each face carries the shift that lands it: the left
// wants the cover's left edge at its right-hand side, the right wants the cover's right edge at
// its left-hand side, which the turn puts three face widths in.
const FACE_COVER_SCALE = -0.17636;
const FACE_COVER_SHIFT_LEFT = 0.04703;
const FACE_COVER_SHIFT_RIGHT = 0.14109;

// What is written over the picture, sized off the whole box rather than off the front, so
// neither the type nor either fade changed size when the front drew in to four fifths. The head
// band is as tall as its padding plus the type in it; the fade wants more room than the type
// does, which is the bottom padding. There is no padding across it: the place is set to the
// front's whole width, edge to edge with the picture under it. The foot band is the same the other
// way up, with the mark at 90% of the picture taking whatever height its own proportions give it.
//
// The type size is therefore where a name *starts* and not where it ends up — what it decides is
// how many lines a long name breaks into on the way (see {@link BoosterBoxSprite.placeType}), the
// row being taken to a share of the front's width after that whatever size it was laid out at.
// That share is what sets how big the type reads: a whole one would run edge to edge with the
// picture, and the head is set at half of it.
const TYPE_SIZE = 0.054;
const TYPE_ROW_WIDTH = 0.5; // of the front's width
const TYPE_LEADING = 1.375; // leading-snug
const HEAD_PAD_TOP = 0.02;
const HEAD_PAD_BOTTOM = 0.09;
const FOOT_PAD_TOP = 0.09;
const FOOT_PAD_BOTTOM = 0.02;
const LOGO_WIDTH = 0.9; // of the front's width

// The shadow the box casts (drop-shadow-md: 0 3px 3px black at 12%). Cast by what is actually
// drawn and not by the box's rectangle — the lid has no corners and the front is four fifths of
// the width — so it is the silhouette that is blurred, octagon, wings and all. Absolute pixels,
// as the utility's are: a shadow is a fact about the page's light, not about how big this box
// happens to be drawn.
const SHADOW_ALPHA = 0.12;
const SHADOW_OFFSET_Y = 3;
const SHADOW_BLUR = 3;

// The type is the page's own, which is the browser's UI face: a canvas cannot inherit it, so it
// is named. Bold, as the document's is.
const FONT_FAMILY = 'system-ui, sans-serif';

// How big a square is when the box comes apart, as a share of its own width — the tenth a
// statue's veil takes of the card it covers, so a box breaks into the same grain its cards
// arrive behind. A share of the whole box and not of the surface it lands on: one card was
// folded into these four planes, so one grain runs across all four, and a face a twentieth of
// the width wide gets the single column of that grain it has room for.
const CRUMBLE_CELL = 0.1;
// How long the shell holds once it has crazed. A beat and not a wait — what it is waiting for is
// whatever is under it (see {@link BoosterBoxSprite.uncover}); this only keeps the crazing and
// the dissolving from running into each other.
const SHELL_HOLD = 300;

export interface BoosterBoxSpriteOptions {
	/** Show poster used as the cover, or null for a plain front. */
	coverUrl: string | null;
	/** The show's wordmark, footing the front, or null to leave the foot alone entirely. */
	logoUrl: string | null;
	/** TMDB id of the show inside, which the lid's glyph is looked up by. */
	showId: number | null;
	/** Full name of the place the box belongs to, said at the head of the front. */
	locationName: string | null;
	/**
	 * Said across the head of the front *instead of* the place and the year — one arbitrary
	 * string, taken as given, for a box printed for something other than a town's festa (see
	 * {@link BoosterBoxSprite.placeLabel}, and the identical prop on BoosterBox.svelte).
	 * Null leaves the head as the town and the year.
	 */
	caption?: string | null;
	/** Printed on white card instead of black — the stock turns over and the ink with it. */
	light: boolean;
	/** How wide the box is drawn. Its height follows (30:37). */
	width: number;
	/** The host's Pixi app: the renderer that bakes, and the ticker the crumble runs on. */
	app: Application;
}

/** What a box says while it is being opened. Two moments and not one because they are two
 * different things to a caller: the first is when whatever is behind the box may be seen — it has
 * a second of dissolving squares to come up through, which is what keeps the crumble from
 * uncovering an empty space — and the second is when the box is out of the way for good. */
export interface BoosterBoxOpenHooks {
	onUncovering?: () => void;
	onOpened?: () => void;
}

/** One plane of the box: the surface it is drawn on, and the print that comes off it the moment
 * the squares are all the way in. */
interface BoxPlane {
	/** The container the plane's squares are laid in, so they take its tilt, shear or square
	 * stance and its crop. */
	surface: Container;
	/** Everything printed on that plane — the tone, the picture, the type, the mark. */
	print: Container;
	/** The plane's own step off the stock, which its squares are painted. */
	tone: string;
	columns: number;
	rows: number;
	/** Where a square lands, for a plane the eye does not see square-on. */
	place?: (column: number, row: number) => Matrix;
}

export class BoosterBoxSprite extends Container {
	readonly boxWidth: number;
	readonly boxHeight: number;

	private options: BoosterBoxSpriteOptions;
	private stock: PackStockTones;
	// The three grades this box is painted with: the front's, and the two grounds over the
	// picture. Held rather than made where they are used because each bakes a texture of its own
	// and the grounds are drawn three times over (the front and both faces) — one grade serves
	// all three, since where a grade lands is worked out per shape it fills and not per grade.
	// They are also the one thing here a destroyed container does not take with it.
	private grades: { front: FillGradient; head: FillGradient; foot: FillGradient };

	// The four planes, once the box is built: what a crumble is laid in, and what comes off it
	// when the crumble is in.
	private planes: BoxPlane[] = [];
	private shadow: Container | null = null;
	// The place set across the head of the front, held because it is the one thing on this box
	// that is a bitmap rather than geometry: it has to be baked again whenever the box is drawn at
	// another size (see {@link drawnAt}).
	private type: Text | null = null;

	// Coming apart, which is the one thing this box does rather than merely shows. Four states, in
	// the order they happen: whole, crazing into squares, crazed and waiting on there being
	// something under it to show, and the squares gone.
	private shell: 'whole' | 'crazing' | 'crazed' | 'dissolving' | 'gone' = 'whole';
	private crumbles: BoxCrumble[] = [];
	private cellTextures: CellTextures | null = null;
	private holdTimer: ReturnType<typeof setTimeout> | null = null;
	// Whether what is under the box is there to be uncovered. The crazed shell waits on it, so a
	// box never comes apart onto an empty space.
	private uncoverable = false;
	private hooks: BoosterBoxOpenHooks = {};

	constructor(options: BoosterBoxSpriteOptions) {
		super();
		this.options = options;
		this.boxWidth = options.width;
		this.boxHeight = options.width * BOX_ASPECT;
		this.stock = PACK_STOCK_TONES[options.light ? SpawnBox.White : SpawnBox.Black];
		// The front's own step off the stock, graded down the scale beneath the picture from the
		// step the left face takes at its head to the pure stock at its foot, and the two grounds
		// drawn from the same two tones — each starting in the tone the front actually is where it
		// sits and ending in that same tone at nothing, so neither ends on a colour the front is
		// not.
		this.grades = {
			front: verticalGradient([
				{ offset: 0, color: this.stock.head },
				{ offset: 1, color: this.stock.foot }
			]),
			head: verticalGradient([
				{ offset: 0, color: this.stock.head },
				{ offset: 1, color: transparent(this.stock.head) }
			]),
			foot: verticalGradient([
				{ offset: 0, color: transparent(this.stock.foot) },
				{ offset: 1, color: this.stock.foot }
			])
		};
	}

	/** The height a box of the given width is drawn at. Asked by a grid, which has to know a
	 * row's pitch before there is a box in it. */
	static heightFor(width: number): number {
		return width * BOX_ASPECT;
	}

	/**
	 * Fetch the picture, the wordmark and the lid's mark, then build the box. Nothing is drawn
	 * before all three have answered: a box that arrived bare and filled itself in afterwards
	 * would be three boxes in a row, and the grid it lands in is one look.
	 */
	async load(): Promise<void> {
		const [cover, logo, glyph] = await Promise.all([
			textureCache.poster(this.options.coverUrl),
			textureCache.icon(this.options.logoUrl),
			showGlyphTexture(this.options.showId, this.stock.ink)
		]);
		if (this.destroyed) return;
		this.build(cover, logo, glyph);
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		if (this.holdTimer) clearTimeout(this.holdTimer);
		this.holdTimer = null;
		// A gradient and a baked square both hold a texture of their own and neither is a child of
		// anything, so they are what has to be given back by hand.
		for (const grade of Object.values(this.grades)) grade.destroy();
		this.cellTextures?.destroy();
		this.cellTextures = null;
		super.destroy(options);
	}

	// --- Coming apart -----------------------------------------------------------------

	/**
	 * Open the box: every plane of it breaks into a grid of squares of its own tone, all four
	 * together and each out of the middle of its own plane. The tap is what opens it, so the
	 * crazing starts here and not on whatever answers — the whole point of the beat is that a roll
	 * still out is a box standing there crazed.
	 *
	 * It does not finish on its own. Once the squares are in, the box holds itself together until
	 * {@link uncover} says there is something under it worth showing (see the hooks for the two
	 * moments it reports back at).
	 */
	open(hooks: BoosterBoxOpenHooks = {}): void {
		if (this.shell !== 'whole' || this.planes.length === 0) return;
		this.hooks = hooks;
		this.shell = 'crazing';

		const { app } = this.options;
		const cell = CRUMBLE_CELL * this.boxWidth;
		// Baked at the size the box is actually being drawn at, not the size it was built at: a box
		// stood up fills the canvas, and a square baked for its cell in the grid would be blown up
		// three times over. The world transform is where that factor is — by the time a box is
		// opened it is already standing wherever it stands.
		const drawn = Math.abs(this.worldTransform.a) || 1;
		this.cellTextures = makeCellTextures(app, cell, app.renderer.resolution * drawn);

		this.crumbles = this.planes.map((plane) => {
			const crumble = new BoxCrumble({
				app,
				textures: this.cellTextures!,
				columns: plane.columns,
				rows: plane.rows,
				tone: plane.tone,
				place: plane.place
			});
			plane.surface.addChild(crumble);
			return crumble;
		});

		void Promise.all(this.crumbles.map((crumble) => crumble.whenShown())).then(() => {
			if (this.destroyed || this.shell !== 'crazing') return;
			// The print goes the moment the grids are all the way in — invisibly, the squares being
			// opaque and each painted its own surface's tone — so what the sweep uncovers is the
			// inside of the box and not the shell it has just broken up.
			for (const plane of this.planes) plane.print.visible = false;
			this.holdTimer = setTimeout(() => {
				this.holdTimer = null;
				if (this.destroyed || this.shell !== 'crazing') return;
				this.shell = 'crazed';
				if (this.uncoverable) this.dissolve();
			}, SHELL_HOLD);
		});
	}

	/** There is something under the box now: whatever it gave is standing behind it with its
	 * pictures up. A crazed shell goes as soon as it hears this, which may be the moment it
	 * finished crazing or long after — a roll still out, or cards whose art is still coming, is a
	 * box that holds itself together and waits. */
	uncover(): void {
		this.uncoverable = true;
		if (this.shell === 'crazed') this.dissolve();
	}

	/** Whether the box has been tapped open. A second tap must not fire a second claim. */
	get opening(): boolean {
		return this.shell !== 'whole';
	}

	/** Whole again, for a roll that never answered: a box that opened onto nothing at all never
	 * opened. */
	close(): void {
		if (this.shell === 'whole' || this.shell === 'gone') return;
		if (this.holdTimer) clearTimeout(this.holdTimer);
		this.holdTimer = null;
		for (const crumble of this.crumbles) crumble.destroy({ children: true });
		this.crumbles = [];
		this.cellTextures?.destroy();
		this.cellTextures = null;
		for (const plane of this.planes) plane.print.visible = true;
		if (this.shadow) this.shadow.alpha = 1;
		this.uncoverable = false;
		this.shell = 'whole';
	}

	/** Away, and gone once the sweep is over. Said at the start as well as at the end: the sweep is
	 * a second long and what is behind the box comes up through it, so a caller told only at the
	 * end would have a second of dissolving squares over nothing. */
	private dissolve(): void {
		this.shell = 'dissolving';
		for (const crumble of this.crumbles) crumble.fade();
		// The shadow goes with the box that casts it, over the same second: a shadow is what a
		// solid does to the light, and there is less and less of a solid here.
		this.fadeShadow();
		this.hooks.onUncovering?.();
		void Promise.all(this.crumbles.map((crumble) => crumble.whenGone())).then(() => {
			if (this.destroyed) return;
			this.shell = 'gone';
			this.visible = false;
			this.hooks.onOpened?.();
		});
	}

	private fadeShadow(): void {
		const shadow = this.shadow;
		if (!shadow) return;
		const start = performance.now();
		const step = (): void => {
			if (this.destroyed || shadow.destroyed) return;
			const t = Math.min(1, (performance.now() - start) / CRUMBLE_SWEEP_MS);
			shadow.alpha = 1 - t;
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	private build(cover: Texture | null, logo: Texture | null, glyph: Texture | null): void {
		const w = this.boxWidth;
		const frontX = FRONT_INSET * w;
		const frontY = LID_DEPTH * w;
		const frontW = FRONT_WIDTH * w;
		const frontH = FRONT_HEIGHT * w;

		const lid = this.lidOutline();
		this.shadow = this.makeShadow(lid, frontX, frontY, frontW, frontH);
		this.addChild(this.shadow);
		this.addChild(this.makeLid(lid, glyph));

		// The place is set before anything is placed, because the head band is as tall as the
		// type in it and both faces draw that band too — so the one Text the front prints is
		// also what says how deep the fade round the whole box is.
		const place = this.placeLabel();
		const type = place ? this.placeType(place) : null;
		this.type = type;
		const bands = this.bandHeights(type, logo);

		// The two faces are hung off the front's sides, so they are as tall as it is whatever
		// height the box is drawn at, and each takes its own step off the stock — the left
		// further than the right, so the two sides of the same cut are not one flat band round
		// the picture but two faces turned different ways.
		this.addChild(this.makeFace('left', cover, frontX, frontY, frontW, frontH, bands));
		this.addChild(this.makeFace('right', cover, frontX, frontY, frontW, frontH, bands));

		const front = this.makeFront(cover, logo, type, frontW, frontH, bands);
		front.position.set(frontX, frontY);
		this.addChild(front);
	}

	// --- The lid ---------------------------------------------------------------------

	/** This box's own lid, projected: `u` across the square and `v` down it (see
	 * {@link projectLid}). */
	private projectLid(u: number, v: number): { x: number; y: number } {
		return projectLid(u, v, this.boxWidth);
	}

	/** The lid as it is drawn: its octagon, projected, as a flat point list. A projection maps
	 * straight lines to straight lines, so the cut's eight vertices are the whole shape. */
	private lidOutline(): number[] {
		return LID_CUT.flatMap(([u, v]) => {
			const point = this.projectLid(u, v);
			return [point.x, point.y];
		});
	}

	private makeLid(outline: number[], glyph: Texture | null): Container {
		const group = new Container();
		const print = new Container();
		group.addChild(print);

		// The top takes the step furthest off the stock, which is what puts an edge between it
		// and the front: a top and a front in one colour are one shape, and a box with no edge
		// between them is not a box.
		const top = new Graphics();
		top.poly(outline);
		top.fill(this.stock.top);
		print.addChild(top);

		if (glyph) {
			// The mark is a print on a plane seen in perspective, so it is seen in the same
			// perspective: its four corners are projected and the picture is mapped between
			// them. Four fifths of both sides and not of the width alone — a mark squashed one
			// way is a different mark — and it is already painted in the lid's own ink, which is
			// the ink the front's type is set in.
			const inset = (1 - GLYPH_SIZE) / 2;
			const far = 1 - inset;
			const topLeft = this.projectLid(inset, inset);
			const topRight = this.projectLid(far, inset);
			const bottomRight = this.projectLid(far, far);
			const bottomLeft = this.projectLid(inset, far);
			print.addChild(
				new PerspectiveMesh({
					texture: glyph,
					verticesX: 12,
					verticesY: 12,
					x0: topLeft.x,
					y0: topLeft.y,
					x1: topRight.x,
					y1: topRight.y,
					x2: bottomRight.x,
					y2: bottomRight.y,
					x3: bottomLeft.x,
					y3: bottomLeft.y
				})
			);
		}

		// The cut, as a crop rather than as the shape of the fill alone: the mark stamped on the
		// lid is clipped by it, and so are the squares the top breaks into — what comes apart is
		// the plane and not a rectangle drawn over it.
		const crop = new Graphics();
		crop.poly(outline);
		crop.fill(0xffffff);
		group.addChild(crop);
		group.mask = crop;

		// The lid's grain is laid down with the lid: each square's own square is mapped through the
		// same projection the plane is, so the rows flatten as they recede. A projection is not an
		// affine map, but a tenth of a lid is small enough that its own corner-to-corner one is —
		// which is what a matrix per square is, taken from the corners this one actually lands on.
		const w = this.boxWidth;
		const cell = CRUMBLE_CELL * w;
		const side = Math.ceil(1 / CRUMBLE_CELL);
		this.planes.push({
			surface: group,
			print,
			tone: this.stock.top,
			columns: side,
			rows: side,
			place: (column, row) => {
				const origin = this.projectLid((column * cell) / w, (row * cell) / w);
				const across = this.projectLid(((column + 1) * cell) / w, (row * cell) / w);
				const down = this.projectLid((column * cell) / w, ((row + 1) * cell) / w);
				return new Matrix(
					(across.x - origin.x) / cell,
					(across.y - origin.y) / cell,
					(down.x - origin.x) / cell,
					(down.y - origin.y) / cell,
					origin.x,
					origin.y
				);
			}
		});

		return group;
	}

	// --- The two bevel faces ----------------------------------------------------------

	/**
	 * One face of the bevel the corner cut opened, filling the notch it takes out of the lid and
	 * carrying on down the front's side. The skew is applied to the whole strip at once, about
	 * the edge it shares with the front, so nothing inside it has to be lined up by hand: the
	 * picture and the two grounds are laid out against the front's own box and shear with the
	 * face, and what is not the face is cropped away.
	 */
	private makeFace(
		side: 'left' | 'right',
		cover: Texture | null,
		frontX: number,
		frontY: number,
		frontW: number,
		frontH: number,
		bands: { head: number; foot: number }
	): Container {
		const w = this.boxWidth;
		const faceW = BEVEL_WIDTH * w;
		const face = new Container();

		// A skew about a vertical axis leaves x alone and lifts y by tan·(x − x₀). For the left
		// face that axis is its right-hand edge, so its outer edge rises; for the right face it
		// is its left-hand edge, and the sign turns over. Written as the matrix it is, rather
		// than through Pixi's own skew, which scales x by the cosine as it shears — a different
		// transform from the document's.
		if (side === 'left') {
			face.setFromMatrix(
				new Matrix(1, BEVEL_SKEW, 0, 1, frontX - faceW, frontY - BEVEL_SKEW * faceW)
			);
		} else {
			face.setFromMatrix(new Matrix(1, -BEVEL_SKEW, 0, 1, frontX + frontW, frontY));
		}

		const print = new Container();
		face.addChild(print);

		const tone = side === 'left' ? this.stock.left : this.stock.right;
		const fill = new Graphics();
		fill.rect(0, 0, faceW, frontH);
		fill.fill(tone);
		print.addChild(fill);

		if (cover) {
			// The picture the front is showing, turned over and squashed into the strip. It is
			// the front's crop that is squashed and not the poster itself, so the column at the
			// joint is the front's own edge column and the face reads as that edge folded back.
			const strip = new Container();
			strip.setFromMatrix(
				new Matrix(
					FACE_COVER_SCALE,
					0,
					0,
					1,
					(side === 'left' ? FACE_COVER_SHIFT_LEFT : FACE_COVER_SHIFT_RIGHT) * w,
					0
				)
			);
			strip.addChild(coverCrop(cover, frontW, frontH));
			print.addChild(strip);
		}

		// The print does not stop at the fold: the fades the poster's head and foot dissolve
		// into carry round onto the face the same way the picture under it does. They are laid
		// out in the front's own box — a band is as tall as its padding plus what is written in
		// it, and nothing is written here — and the face's crop takes the strip of them that
		// lands on it. A `to-b` gradient is one colour all the way across, so neither the turn
		// nor the squash the picture needs applies to these.
		print.addChild(this.makeGrounds(frontW, frontH, bands));

		const crop = new Graphics();
		crop.rect(0, 0, faceW, frontH);
		crop.fill(0xffffff);
		face.addChild(crop);
		face.mask = crop;

		// A face's squares are sheared with the face and the front's stand square, so once the
		// print has gone the fold still reads — off the direction of the grain rather than off a
		// difference in colour. The strip is a twentieth of the box wide against a square a tenth of
		// it, so what a face gets is one column of the box's grain, clipped, which is all a plane
		// that narrow can show of any tiling.
		this.planes.push({
			surface: face,
			print,
			tone,
			...this.tiling(faceW, frontH)
		});

		return face;
	}

	/** How many squares a plane standing square to the eye takes, and where each lands: the grain
	 * runs from the plane's bottom edge, so the row that is only partly there is the top one,
	 * furthest from where the box is read. */
	private tiling(
		width: number,
		height: number
	): { columns: number; rows: number; place: (column: number, row: number) => Matrix } {
		const cell = CRUMBLE_CELL * this.boxWidth;
		const columns = Math.max(1, Math.ceil(width / cell));
		const rows = Math.max(1, Math.ceil(height / cell));
		return {
			columns,
			rows,
			place: (column, row) => new Matrix(1, 0, 0, 1, column * cell, height - (rows - row) * cell)
		};
	}

	// --- The front -------------------------------------------------------------------

	/** How tall the two grounds over the picture come out: the head off the type in it, the foot
	 * off the wordmark's own proportions. Worked out once — the front and both faces draw the
	 * same two bands, and a second copy is a band that quietly stops matching the first. */
	private bandHeights(type: Text | null, logo: Texture | null): { head: number; foot: number } {
		const w = this.boxWidth;
		const head = type ? HEAD_PAD_TOP * w + type.height + HEAD_PAD_BOTTOM * w : 0;
		const foot =
			logo && logo.width > 0
				? FOOT_PAD_TOP * w +
					(LOGO_WIDTH * FRONT_WIDTH * w * logo.height) / logo.width +
					FOOT_PAD_BOTTOM * w
				: 0;
		return { head, foot };
	}

	/**
	 * What the head says: the place with the year this copy would be minted in joined to it —
	 * "Barcelona '26". The gazetteer parks the article after a comma to sort by, so it is put
	 * back at the front before the name is said.
	 *
	 * A caption replaces the pair outright rather than joining them: a box that belongs to no
	 * town has no year either, and "Benvinguda '26" would be dating a thing that is not an
	 * edition.
	 */
	private placeLabel(): string {
		const { locationName, caption } = this.options;
		if (caption) return caption;
		return [locationName ? restoreCatalanArticle(locationName) : '', spawnYearLabel(Date.now())]
			.filter(Boolean)
			.join(' ');
	}

	/** The place, set to a share of the front's width: centred, bold, in whichever of the two the
	 * card is not, and the same size on every box whatever name it turned out to be.
	 *
	 * `trim` is what makes that possible, and it is the whole of this. A text's box is normally the
	 * sum of its letters' advances — the room the font says to step on by — and what is painted is
	 * not that: bold letters lean out over the ends of their own boxes, so the ink is the wider of
	 * the two and every fit worked out from the number was short by however much. Trimmed, the box
	 * is read back off the pixels instead, so what the Text reports is what it draws, to the letter.
	 *
	 * Then the fit is one line: take that box to `TYPE_ROW_WIDTH` of the room. Up for a short place,
	 * down for a long one, uniformly — a caption stretched to a width is a different caption — so
	 * the row across the head is the same width on every box and well inside the front's edges,
	 * with nothing left over for its crop to slice off. `TYPE_SIZE` is therefore where a name starts
	 * and not where it ends up; what it still decides is where a long one breaks, wrapping happening
	 * at the room's full width before any of this is measured.
	 *
	 * The band above comes out right without being told: a trimmed, scaled Text reports the ink's
	 * own height, which is what {@link bandHeights} measures, so the fade is as deep as the letters
	 * are and not as deep as a line box they sit loose inside.
	 *
	 * `padding` is what the trim is read inside. A text is painted into a bitmap cut to the width
	 * the advances added up to, so a letter leaning past its own box is sliced off there — inside
	 * the type, before anything on this box gets the chance to crop it, which is why the name was
	 * still coming up short however wide the room round it was made. The padding is the bitmap's
	 * margin and nothing else, and with the trim reading the box back off the ink it costs the
	 * layout exactly nothing, so it is given a whole em: enough that no face reaches the edge, and
	 * free whether or not it is needed.
	 */
	private placeType(label: string): Text {
		const w = this.boxWidth;
		const size = TYPE_SIZE * w;
		const room = FRONT_WIDTH * w;
		const type = new Text({
			text: label,
			resolution: this.options.app.renderer.resolution,
			style: {
				fontFamily: FONT_FAMILY,
				fontSize: size,
				fontWeight: '700',
				lineHeight: size * TYPE_LEADING,
				fill: this.stock.ink,
				align: 'center',
				padding: size,
				trim: true,
				wordWrap: true,
				wordWrapWidth: room
			}
		});
		if (type.width > 0) type.scale.set((TYPE_ROW_WIDTH * room) / type.width);
		return type;
	}

	/**
	 * The box is being drawn at `scale` — bake its type for that size.
	 *
	 * A box is built at the width its cell gives it and everything else about it is geometry, so
	 * scaling the container is free and stays sharp; type is the one thing on it that is not
	 * geometry but a bitmap, and a box stood up fills the canvas, which is three or four times the
	 * cell it was built in. Baked once at the cell's own size it was that much blown up — the same
	 * thing the crumble's squares are baked against the world transform to avoid (see
	 * {@link open}), said here as the scale the caller is about to draw at rather than the one it
	 * is drawing at, so the type is already sharp for the move that takes it there.
	 *
	 * Never below the renderer's own resolution: a box back in the grid is drawn at the size it
	 * was built for, and there is nothing to gain by holding a bitmap for a size it is not.
	 */
	drawnAt(scale: number): void {
		if (!this.type || this.type.destroyed) return;
		const resolution = this.options.app.renderer.resolution * Math.max(1, scale);
		if (Math.abs(this.type.resolution - resolution) < 0.01) return;
		this.type.resolution = resolution;
	}

	private makeFront(
		cover: Texture | null,
		logo: Texture | null,
		type: Text | null,
		frontW: number,
		frontH: number,
		bands: { head: number; foot: number }
	): Container {
		const front = new Container();
		const print = new Container();
		front.addChild(print);

		// The front's own grade, which is what a show with no poster shows.
		const card = new Graphics();
		card.rect(0, 0, frontW, frontH);
		card.fill(this.grades.front);
		print.addChild(card);

		if (cover) {
			// The poster covers the front rather than fitting inside it: it runs to all four
			// edges and takes whatever cropping that costs it.
			print.addChild(coverCrop(cover, frontW, frontH));
		}

		print.addChild(this.makeGrounds(frontW, frontH, bands));

		if (type) {
			// The place is a row and not a word: a container the width of the front, as deep as the
			// type in it, with the name centred across it. The type is set to a share of that width
			// (see {@link placeType}) and the rest is the row's — so what a long name and a short one
			// have in common is the band they are set in, and only the letters differ.
			const row = new Container();
			row.position.set(0, HEAD_PAD_TOP * this.boxWidth);
			// Hung by its middle on both axes, and placed at the row's. A padded text's bitmap is
			// bigger than the ink read out of it by that padding all round, and what pins the two
			// together is the anchor: at a half the extra falls equally either side and cancels, at
			// nought it all falls on one side and the letters sit that much off. Across, this was
			// already so; down, it was not, which is what carried the place up over the top of the
			// front.
			type.anchor.set(0.5, 0.5);
			type.position.set(frontW / 2, type.height / 2);
			row.addChild(type);
			print.addChild(row);
		}

		if (logo && logo.width > 0) {
			// The mark is not turned over with the stock: it is artwork and not ink — the
			// wordmarks the authoring side enables are coloured lettering with a light outline,
			// which reads on either card. It is read at the width it was drawn to be read at,
			// 90% of the picture, and takes whatever height its proportions give it.
			const mark = new Sprite(logo);
			const markW = LOGO_WIDTH * frontW;
			mark.setSize(markW, (markW * logo.height) / logo.width);
			mark.anchor.set(0.5, 1);
			mark.position.set(frontW / 2, frontH - FOOT_PAD_BOTTOM * this.boxWidth);
			print.addChild(mark);
		}

		// The front is the largest plane and the only one standing square to the eye, so it is where
		// the grain is read and where the crumble is actually watched. Its own crop is what keeps
		// the row that overruns the top of it — the front is not a whole number of squares tall —
		// from standing up over the lid.
		const crop = new Graphics();
		crop.rect(0, 0, frontW, frontH);
		crop.fill(0xffffff);
		front.addChild(crop);
		front.mask = crop;

		this.planes.push({
			surface: front,
			print,
			// The tone is the step the front's own grade starts in, the grade itself being no use to
			// a grid: a square carries one colour, and the tone a plane crazes in has to be one the
			// front actually is somewhere.
			tone: this.stock.head,
			...this.tiling(frontW, frontH)
		});

		return front;
	}

	/**
	 * The two grounds over the picture: the head's fade from the front's own head tone down to
	 * nothing, and the foot's from the stock the front reaches at its foot up to nothing. Neither
	 * ends on a colour the front is not, which is what lets the picture's top and bottom edges
	 * dissolve into the frame instead of ending on a line against it. Drawn wherever the print
	 * goes — over the front, and over each bevel face, where they are the same two fades with
	 * nothing written in them.
	 */
	private makeGrounds(
		frontW: number,
		frontH: number,
		bands: { head: number; foot: number }
	): Container {
		const group = new Container();

		if (bands.head > 0) {
			const head = new Graphics();
			head.rect(0, 0, frontW, bands.head);
			head.fill(this.grades.head);
			group.addChild(head);
		}

		if (bands.foot > 0) {
			const foot = new Graphics();
			foot.rect(0, frontH - bands.foot, frontW, bands.foot);
			foot.fill(this.grades.foot);
			group.addChild(foot);
		}

		return group;
	}

	// --- The shadow ------------------------------------------------------------------

	/** The box's own silhouette, blurred and dropped: the lid's octagon, the front, and the two
	 * wings the bevel opens down its sides. One fill for all four — they meet but never overlap,
	 * so nothing doubles up. */
	private makeShadow(
		lid: number[],
		frontX: number,
		frontY: number,
		frontW: number,
		frontH: number
	): Container {
		const w = this.boxWidth;
		const faceW = BEVEL_WIDTH * w;
		const rise = BEVEL_SKEW * faceW;

		const silhouette = new Graphics();
		silhouette.poly(lid);
		silhouette.rect(frontX, frontY, frontW, frontH);
		silhouette.poly([
			frontX,
			frontY,
			frontX,
			frontY + frontH,
			frontX - faceW,
			frontY + frontH - rise,
			frontX - faceW,
			frontY - rise
		]);
		silhouette.poly([
			frontX + frontW,
			frontY,
			frontX + frontW + faceW,
			frontY - rise,
			frontX + frontW + faceW,
			frontY + frontH - rise,
			frontX + frontW,
			frontY + frontH
		]);
		silhouette.fill({ color: 0x000000, alpha: SHADOW_ALPHA });
		silhouette.filters = [new BlurFilter({ strength: SHADOW_BLUR, quality: 2 })];

		// The offset lives on the shape inside a group pinned to the box's own origin, so the
		// group is simply a child at (0, 0) like every other surface.
		const group = new Container();
		group.addChild(silhouette);
		silhouette.position.set(0, SHADOW_OFFSET_Y);
		return group;
	}
}

/**
 * A point of the lid's square as the perspective draws it, in the units a box of `width` is drawn
 * in: `u` across the square and `v` down it, the front edge (v = 1) being the axis the square is
 * turned about and the top edge of the front.
 *
 * In module scope because it is a fact about the shape and not about any one box: it is what
 * lays the lid down, what stamps the mark on it, and what the lid's grain is mapped through.
 */
function projectLid(u: number, v: number, width: number): { x: number; y: number } {
	const above = 1 - v; // how far back from the axis, in widths
	const scale = LID_DISTANCE / (LID_DISTANCE + above * Math.sin(LID_TILT));
	return {
		x: (0.5 + (u - 0.5) * scale) * width,
		y: (LID_DEPTH - above * Math.cos(LID_TILT) * scale) * width
	};
}

/**
 * How wide a box's front is drawn, all told: the face at four fifths of the width plus the bevel
 * face the corner cut opened down each side of it. Read off the same figures the front and its
 * faces are drawn from rather than quoted, so a change to either follows through.
 *
 * It is the picture the box *is* — the poster, the wordmark and the town's name are all on it,
 * and the lid, being the full width of the box, is the one part that stands proud of it either
 * side. So anything standing where the box was is asked to be exactly this wide: what a box
 * opens onto takes the place of its front, and a card the width of the hole in its top would be
 * a card that never lined up with the thing it came out of.
 */
export function frontWidth(boxWidth: number): number {
	return (FRONT_WIDTH + 2 * BEVEL_WIDTH) * boxWidth;
}

/** A picture covering a box: scaled to the larger of the two fits, centred, and cropped to the
 * box — `object-cover`, which is what the front does with a poster that is not its shape. */
function coverCrop(texture: Texture, width: number, height: number): Container {
	const group = new Container();
	const picture = new Sprite(texture);
	const scale = Math.max(width / texture.width, height / texture.height);
	picture.anchor.set(0.5);
	picture.scale.set(scale);
	picture.position.set(width / 2, height / 2);
	group.addChild(picture);

	const crop = new Graphics();
	crop.rect(0, 0, width, height);
	crop.fill(0xffffff);
	group.addChild(crop);
	group.mask = crop;
	return group;
}

/** A top-to-bottom gradient over whatever shape it fills, which is what `bg-gradient-to-b` is. */
function verticalGradient(colorStops: { offset: number; color: string }[]): FillGradient {
	return new FillGradient({
		type: 'linear',
		start: { x: 0, y: 0 },
		end: { x: 0, y: 1 },
		textureSpace: 'local',
		colorStops
	});
}

/** The same colour at nothing: the far end of a ground's fade, which falls through the tone it
 * started in rather than through anything named here. */
function transparent(color: string): string {
	const value = color.replace('#', '');
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, 0)`;
}
