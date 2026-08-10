/**
 * BoosterBoxGridScene
 *
 * The booster window's boxes on a canvas, laid out exactly as PackGrid lays them out in the
 * document: two grids of the caller's column count, the towns of festa today first (printed on
 * white card) and the rest of the window under them (on black), each grid packed to its own top
 * with the same twelve-pixel gutter between cells and between the two. One scroller holds both,
 * so a window taller than the canvas scrolls as one list.
 *
 * A box is tapped to stand it up: it lifts out of the scrolling grid into screen space, tweens
 * to the middle at the size the canvas allows, and the rest of the window fades away behind it.
 * Tapped again, on itself, it comes apart — the crumble carries straight on from where standing
 * up left off, so the whole of what a box does is one gesture repeated on one object. It was a
 * button in the document under the canvas, on the reasoning that the one irreversible act here
 * should be reached for by name; what that cost is the object. A box stood up in the middle of
 * a canvas with a word underneath it is a picture with a control beside it, and the picture is
 * the thing a player came to touch. Only the box answers, and only where it is drawn: a tap
 * anywhere around it does nothing, so nothing is opened by a miss. Going back to the window is
 * still {@link setSelected}, the pick the host holds. The crumble starts on that tap, so
 * whatever the roll takes is time the crazed box stands there (see BoosterBoxSprite).
 *
 * What the box opens *onto* is not drawn here at all. The cards a pack gives are statues, and a
 * statue is a document thing — so the host stands them up in a layer behind this canvas and says
 * when their pictures are up; this canvas is transparent, and the box dissolving over them is
 * what uncovers them. That is the whole reason the two are stacked rather than one drawing both.
 *
 * A box is built at the column width it lands in and keeps it (see BoosterBoxSprite). A resize
 * scales the layer rather than rebuilding, which is free and stays sharp downwards; only a
 * canvas that has drifted far enough for that scaling to show is worth building again.
 */

import { Application, Container } from 'pixi.js';
import { destroyPixiApp } from '$utils/pixi/release-context';
import { BoosterBoxSprite, frontWidth } from './BoosterBoxSprite';
import type { OpenerPack } from './opener-view.type';

/** Gutter between cells and between the two grids: `gap-3`, the document's own. */
const GAP = 12;
/** How far a pointer may travel and still be a tap rather than a scroll. */
const TAP_SLOP = 6;
/**
 * How far the column width may drift from the width the boxes were built at before they are
 * built again. Below this the layer is simply scaled: a box scaled down stays sharp, and one
 * scaled up a few per cent is not something anybody can see — but a canvas that has doubled is.
 */
const REBUILD_DRIFT = 0.25;
/** How long to wait for a lost GPU context to come back before giving up on it. */
const CONTEXT_RESTORE_GRACE = 1200;
/** How long a box takes to stand up, and to go back down. */
const STAND_MS = 460;
/** What share of the canvas a stood-up box is fitted into, leaving it a margin to stand in. */
const STAND_FIT = 0.94;
/** How far the rest of the window falls back while one box is standing: not away, since what is
 * behind the canvas is a reveal and not a page, but far enough that the box is plainly the one
 * thing being looked at. */
const RESTING_ALPHA = 0;
/**
 * How a box a player has already opened is drawn: the same box, faded. A town deals two boxes a
 * year and neither twice, so the one they took is not withdrawn from the window — it is left
 * standing on its town, plainly spent, which is what says the offer was taken rather than that
 * it was never there. It still stands up when it is tapped (a box is worth looking at), and it
 * does not come apart: {@link openStood} refuses it, as `claim_booster` would.
 */
const SPENT_ALPHA = 0.35;

export interface BoosterBoxGridSceneOptions {
	/** Every box the window offers, in the order the host assembled them. */
	packs: OpenerPack[];
	/** How many boxes a row holds. */
	columns: number;
	/** Which box is standing up, by pack id, or null for the window. The host's as much as this
	 * canvas's: clicking a town's box out on the map picks a pack without this canvas being
	 * touched at all, and the canvas has to be showing that pack and not the window it is in. */
	selected?: string | null;
	/** A box was stood up. */
	onSelect?: (pack: OpenerPack) => void;
	/** The stood-up box went back down, or the reveal it left was dismissed. */
	onBack?: () => void;
	/**
	 * The stood-up box was opened. The host is what rolls the pack and stands up what it
	 * gives — the cards are documents, not sprites — and says so with {@link uncover}; the box
	 * holds itself crazed until it does. A roll that gives nothing at all should say
	 * {@link seal} instead, which puts the box back together.
	 */
	onOpen?: (pack: OpenerPack) => void;
	/**
	 * How wide the stood-up box's front is drawn, in canvas pixels — the face and the bevel face
	 * either side of it (see {@link frontWidth}) — which is what the host lays its reveal out in:
	 * the cards stand where the box's picture was, edge to edge with it. Null when no box is
	 * standing. Said again whenever the box is re-fitted, so a canvas that changes size takes the
	 * reveal with it.
	 */
	onFront?: (width: number | null) => void;
	/** The squares have started to go, so whatever is behind the canvas may now be seen: it has
	 * the whole of the dissolve to come up through. */
	onUncovering?: () => void;
	/** The last square has gone and the box is out of the way, so what it opened onto is all
	 * there is left to look at. Nothing more happens on this canvas after it: the host's view has
	 * said what it was raised to say, and the next click anywhere on it is what closes it. */
	onOpened?: () => void;
	/**
	 * The window is built and on the canvas: the renderer exists, every box's three pictures
	 * have answered and the grids are laid out, so the next frame is the window itself. Until
	 * it fires there is nothing on the canvas to look at, which is what the host holds it back
	 * for — a box's art can take a while to arrive, and an empty canvas standing where a
	 * window was asked for reads as a window with nothing in it.
	 */
	onReady?: () => void;
	/**
	 * Fires when the canvas lost its GPU context and the browser did not hand one back — the
	 * renderer will never draw again, so the host has to rebuild the scene if it wants a canvas.
	 */
	onContextLost?: () => void;
}

/** One box in the layout: which pack it draws, its sprite, and where it sits (in built units). */
interface BoxEntry {
	pack: OpenerPack;
	sprite: BoosterBoxSprite;
	x: number;
	y: number;
}

/**
 * What the canvas is doing: showing the window, standing a box up or back down, holding one
 * stood up, and holding one open — from the word that opens it onwards, which is the whole of the
 * time this canvas is not the thing being looked at. An opened box is where a canvas stops: what
 * puts the reveal away is the view above it closing, not anything here.
 */
type SceneState = 'grid' | 'standing' | 'stood' | 'opening' | 'opened';

export class BoosterBoxGridScene {
	private host: HTMLElement;
	private app: Application;
	private packs: OpenerPack[];
	private columns: number;
	private callbacks: BoosterBoxGridSceneOptions;

	private layer = new Container();
	// The stood-up box lives here, out of the scrolling grid and in screen space, above the rest
	// of the window.
	private focus = new Container();
	private entries: BoxEntry[] = [];
	private stood: BoxEntry | null = null;
	private state: SceneState = 'grid';
	// Which box the host wants standing, which is not always which one is: the pick can arrive
	// before there are boxes to pick from (a modal opened on a town's pack is picked while the
	// window is still baking), so it is kept and applied whenever there is a window to apply it
	// to. Null is the window itself.
	private wanted: string | null = null;

	// The width one column got when the boxes were built, what they are drawn at now, and how
	// tall the whole of both grids is in built units.
	private builtWidth = 0;
	private contentHeight = 0;
	private scale = 1;
	private scroll = 0;

	private canvasWidth = 0;
	private canvasHeight = 0;

	private ready = false;
	private isDestroyed = false;
	private contextLost = false;
	// Bumped on every build, so a build overtaken by a later one drops what it loaded.
	private generation = 0;

	private resizeObserver: ResizeObserver | null = null;
	private dragPointerId: number | null = null;
	private dragStart = 0;
	private scrollStart = 0;
	private dragMoved = false;

	constructor(host: HTMLElement, options: BoosterBoxGridSceneOptions) {
		this.host = host;
		this.packs = options.packs;
		this.columns = Math.max(1, Math.round(options.columns));
		this.wanted = options.selected ?? null;
		this.callbacks = options;
		this.app = new Application();
		void this.init();
	}

	/**
	 * Stand a box up, or stand the standing one back down — the same pick a tap makes, made from
	 * outside. It is how a click on a town's box out on the map lands here: the map picks a pack,
	 * the host holds which one, and both drawings of the window follow it.
	 *
	 * A box that is coming apart is not swapped out from under the player: the pick is remembered
	 * and the crumble is left to finish.
	 */
	setSelected(id: string | null): void {
		if (this.wanted === id) return;
		this.wanted = id;
		if (this.ready) this.applySelection();
	}

	/** Show another window, or the same one at another column count. A box standing open is left
	 * alone: the window it came from can change under it (a claim lands and its box is spent)
	 * and none of that is a reason to take a reveal off the screen. */
	setPacks(packs: OpenerPack[], columns: number): void {
		const cols = Math.max(1, Math.round(columns));
		if (packs === this.packs && cols === this.columns) return;
		this.packs = packs;
		this.columns = cols;
		if (this.ready && this.state === 'grid') void this.build();
	}

	/**
	 * What the stood-up box opened onto is standing behind the canvas with its pictures up, so the
	 * box may come apart. Until this is said the crazed box holds itself together, which is what
	 * keeps a crumble from uncovering an empty space.
	 */
	uncover(): void {
		this.stood?.sprite.uncover();
	}

	/** The roll gave nothing at all, so the box never opened: it is whole again and still standing.
	 * Why is the host's to say, as every other refusal is. */
	seal(): void {
		if (this.state !== 'opening') return;
		this.stood?.sprite.close();
		this.state = 'stood';
	}

	/** Stand the box back down and give the window back — the way out of both a stood-up box and
	 * the reveal it left. */
	standDown(): void {
		if (this.state === 'stood') void this.lower();
		else if (this.state === 'opened' || this.state === 'opening') this.dismiss();
	}

	/** Make what is standing what the host asked for. Called whenever either changes — the pick,
	 * or the window it has to be found in.
	 *
	 * `settled` is for a pick that was already made when the boxes were built: there is no move
	 * to draw, because the window it would move out of has never been on the screen.
	 */
	private applySelection(settled = false): void {
		const id = this.wanted;
		if ((this.stood?.pack.id ?? null) === id) return;
		if (id === null) {
			this.standDown();
			return;
		}
		const entry = this.entries.find((candidate) => candidate.pack.id === id);
		if (!entry) return;
		if (this.state === 'grid') this.raise(entry, settled);
		// One box down and the other up, without a word to the host in between: it asked for this,
		// and a "the box went back down" on the way would only untell it its own pick.
		else if (this.state === 'stood') void this.swap(entry);
	}

	private async swap(entry: BoxEntry): Promise<void> {
		await this.lower(true);
		if (this.isDestroyed || this.state !== 'grid') return;
		this.raise(entry);
	}

	destroy(): void {
		this.isDestroyed = true;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.detachNavigation();
		this.detachContextGuards();
		this.entries = [];
		destroyPixiApp(this.app, { children: true, texture: false });
	}

	private async init(): Promise<void> {
		this.measure();
		await this.app.init({
			width: this.canvasWidth,
			height: this.canvasHeight,
			backgroundAlpha: 0,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true
		});
		if (this.isDestroyed) {
			destroyPixiApp(this.app, { children: true, texture: false });
			return;
		}

		this.host.appendChild(this.app.canvas);
		this.app.canvas.style.touchAction = 'none';
		// The canvas is the top of a stack: what a box opens onto is stood up in the document
		// behind it (see the class note), so it has to sit over that layer rather than beside it —
		// which needs it positioned, z-index having nothing to say about anything else.
		this.app.canvas.style.position = 'relative';
		this.app.canvas.style.zIndex = '1';
		this.app.stage.addChild(this.layer);
		this.app.stage.addChild(this.focus);
		this.attachContextGuards();
		this.attachNavigation();
		this.ready = true;

		await this.build();
		if (this.isDestroyed) return;

		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.host);

		// Said last, after the boxes are on the layer and the selection has been applied: what
		// the host uncovers on hearing it is the window, and a canvas that had still to place a
		// standing box would be uncovered mid-arrangement.
		this.callbacks.onReady?.();
	}

	/**
	 * Build every box at the current column width and lay the two grids out. Boxes are built
	 * together and added together: a grid that filled in a box at a time is a grid that is read
	 * while it is still arriving.
	 */
	private async build(): Promise<void> {
		const generation = ++this.generation;
		const width = this.columnWidth();
		const sprites = await Promise.all(
			this.orderedPacks().map(async (pack) => {
				const sprite = new BoosterBoxSprite({
					coverUrl: pack.coverUrl,
					logoUrl: pack.logoUrl,
					showId: pack.showId,
					locationName: pack.locationName,
					caption: pack.caption ?? null,
					light: pack.light,
					width,
					app: this.app
				});
				await sprite.load();
				return { pack, sprite };
			})
		);
		if (this.isDestroyed || generation !== this.generation) {
			for (const { sprite } of sprites) sprite.destroy({ children: true });
			return;
		}

		for (const layer of [this.layer, this.focus]) {
			layer.removeChildren().forEach((child) => child.destroy({ children: true }));
		}
		this.layer.alpha = 1;
		this.stood = null;
		this.state = 'grid';
		this.builtWidth = width;
		this.entries = sprites.map(({ pack, sprite }) => {
			this.layer.addChild(sprite);
			return { pack, sprite, x: 0, y: 0 };
		});
		this.place();
		// A window with a pack already picked opens on that pack, not on the window: the pick may
		// well have been made before there was a box to stand up (see `wanted`). It is standing the
		// moment the boxes are up, and does not travel there — a pick that predates the boxes has
		// no window to have come out of, and the first frame this canvas ever draws is the one it
		// is meant to be showing.
		this.applySelection(true);
	}

	/**
	 * The window in the order it is drawn: the towns of festa today, then the rest. Each half
	 * keeps the order the host handed them in, which is the calendar's — the split only lifts
	 * today out of the middle of that list. The two are drawn as one run of cells with the second
	 * grid starting on a fresh row, which is what two grids one under the other come to.
	 */
	private orderedPacks(): OpenerPack[] {
		return [
			...this.packs.filter((pack) => pack.today),
			...this.packs.filter((pack) => !pack.today)
		];
	}

	/** The width one column gets on the current canvas. */
	private columnWidth(): number {
		const available = Math.max(1, this.canvasWidth - GAP * (this.columns - 1));
		return Math.max(1, available / this.columns);
	}

	/** Put every box in its cell, in built units, and hand the layer the scale and scroll that
	 * puts those units on this canvas. */
	private place(): void {
		const boxHeight = BoosterBoxSprite.heightFor(this.builtWidth);
		const pitchX = this.builtWidth + GAP;
		const pitchY = boxHeight + GAP;
		const todayCount = this.entries.filter((entry) => entry.pack.today).length;
		// The second grid starts on a row of its own, and the gutter between the two is the same
		// gutter that is between rows — so the row the rest of the window starts on is simply the
		// next one after today's last.
		const todayRows = Math.ceil(todayCount / this.columns);

		let tallest = 0;
		this.entries.forEach((entry, index) => {
			const inSecond = index >= todayCount;
			const cell = inSecond ? index - todayCount : index;
			const column = cell % this.columns;
			const row = Math.floor(cell / this.columns) + (inSecond ? todayRows : 0);
			entry.x = column * pitchX;
			entry.y = row * pitchY;
			entry.sprite.position.set(entry.x, entry.y);
			tallest = Math.max(tallest, entry.y + boxHeight);
		});

		this.contentHeight = tallest;
		this.applyTransform();
	}

	private applyTransform(): void {
		this.scale = this.builtWidth > 0 ? this.columnWidth() / this.builtWidth : 1;
		this.clampScroll();
		this.layer.scale.set(this.scale);
		this.layer.position.set(0, this.scroll);
	}

	private clampScroll(): void {
		const drawn = this.contentHeight * this.scale;
		// Nothing to scroll when the window fits: the boxes stay at the top, as the document's
		// own grid does.
		const min = Math.min(0, this.canvasHeight - drawn);
		this.scroll = Math.min(0, Math.max(min, this.scroll));
	}

	private measure(): void {
		const rect = this.host.getBoundingClientRect();
		this.canvasWidth = Math.max(1, Math.floor(rect.width || 1));
		this.canvasHeight = Math.max(1, Math.floor(rect.height || 1));
	}

	private handleResize(): void {
		if (this.isDestroyed || !this.ready) return;
		const width = this.canvasWidth;
		const height = this.canvasHeight;
		this.measure();
		if (width === this.canvasWidth && height === this.canvasHeight) return;
		this.app.renderer.resize(this.canvasWidth, this.canvasHeight);
		if (this.entries.length === 0) return;

		// A box that is up is re-fitted to the new canvas and nothing else is touched: the window
		// behind it is not being looked at, and building it again would take the box — and whatever
		// it has opened onto — off the screen with it.
		if (this.state !== 'grid') {
			// Mid-tween is the one moment to leave alone: the move already has both its ends, and
			// the frame after this one would put the box back where it was going anyway.
			const sprite = this.state === 'standing' ? null : this.stood?.sprite;
			if (sprite) {
				const to = this.standTransform();
				sprite.position.set(to.x, to.y);
				sprite.scale.set(to.scale);
				sprite.drawnAt(to.scale);
				this.reportFront();
			}
			return;
		}

		const drift = Math.abs(this.columnWidth() - this.builtWidth) / this.builtWidth;
		if (drift > REBUILD_DRIFT) void this.build();
		else this.applyTransform();
	}

	// --- Standing a box up, opening it, putting it back -------------------------------

	/** Where a stood-up box sits: the middle of the canvas, at the size the canvas allows it,
	 * whichever of the two measurements runs out first. */
	private standTransform(): { x: number; y: number; scale: number } {
		const boxHeight = BoosterBoxSprite.heightFor(this.builtWidth);
		const scale = Math.min(
			(this.canvasWidth * STAND_FIT) / this.builtWidth,
			(this.canvasHeight * STAND_FIT) / boxHeight
		);
		return {
			x: (this.canvasWidth - this.builtWidth * scale) / 2,
			y: (this.canvasHeight - boxHeight * scale) / 2,
			scale
		};
	}

	/**
	 * Stand a box up. It is lifted out of the scrolling grid into screen space at the very spot it
	 * was drawn at, so the move to the middle is a clean tween and not a jump followed by one, and
	 * the rest of the window fades away under it.
	 *
	 * `settled` puts it straight in the middle instead, for a box that is standing before anybody
	 * has looked at this canvas: a modal opened on a town's pack is picked while the window is
	 * still baking, so there is no move from the window to draw — the window was never on the
	 * screen. Tweening it anyway is what made the whole grid flash up and slide away under a box
	 * that should simply have been standing there when the boxes arrived.
	 */
	private raise(entry: BoxEntry, settled = false): void {
		this.state = 'standing';
		this.stood = entry;
		this.wanted = entry.pack.id;
		this.callbacks.onSelect?.(entry.pack);

		const fromScale = this.scale;
		const from = { x: entry.x * this.scale, y: entry.y * this.scale + this.scroll };
		this.layer.removeChild(entry.sprite);
		this.focus.addChild(entry.sprite);
		entry.sprite.scale.set(fromScale);
		entry.sprite.position.set(from.x, from.y);

		const to = this.standTransform();
		// Said before the move and not after it: the box is about to be drawn three or four times
		// the size its type was baked at, and the whole of the move is spent at sizes nearer the
		// one it is going to than the one it is leaving.
		entry.sprite.drawnAt(to.scale);
		if (settled) {
			entry.sprite.position.set(to.x, to.y);
			entry.sprite.scale.set(to.scale);
			this.layer.alpha = RESTING_ALPHA;
			this.state = 'stood';
			this.reportFront();
			return;
		}

		const restOf = this.layer.alpha;
		void this.tween(STAND_MS, (t) => {
			entry.sprite.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
			entry.sprite.scale.set(fromScale + (to.scale - fromScale) * t);
			this.layer.alpha = restOf + (RESTING_ALPHA - restOf) * t;
		}).then(() => {
			if (this.state !== 'standing') return;
			this.state = 'stood';
			this.reportFront();
		});
	}

	/** Hand the host the width of the stood box's front, at the size it is standing (see
	 * {@link frontWidth}) — or nothing at all when no box is up. */
	private reportFront(): void {
		const sprite = this.stood?.sprite;
		this.callbacks.onFront?.(sprite ? frontWidth(this.builtWidth * sprite.scale.x) : null);
	}

	/** Whether there is a box for the document's button to open: one that has finished standing
	 * up, on a canvas that is taking picks at all. A box mid-tween is not one, nor is one already
	 * coming apart. */
	/** Back into its cell, and the window back with it. `quiet` is for a box being swapped for
	 * another: the host asked for that, and telling it the first box went down would only untell
	 * it its own pick. */
	private async lower(quiet = false): Promise<void> {
		const entry = this.stood;
		if (!entry) return;
		this.state = 'standing';
		const from = { x: entry.sprite.x, y: entry.sprite.y, scale: entry.sprite.scale.x };
		const to = { x: entry.x * this.scale, y: entry.y * this.scale + this.scroll };
		await this.tween(STAND_MS, (t) => {
			entry.sprite.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
			entry.sprite.scale.set(from.scale + (this.scale - from.scale) * t);
			this.layer.alpha = RESTING_ALPHA + (1 - RESTING_ALPHA) * t;
		});
		if (this.isDestroyed) return;
		this.focus.removeChild(entry.sprite);
		this.layer.addChild(entry.sprite);
		entry.sprite.scale.set(1);
		entry.sprite.position.set(entry.x, entry.y);
		// Back at the size it was built for, so its type is baked for that size again rather than
		// held at a standing box's.
		entry.sprite.drawnAt(1);
		this.layer.alpha = 1;
		this.stood = null;
		this.state = 'grid';
		this.reportFront();
		if (quiet) return;
		this.wanted = null;
		this.callbacks.onBack?.();
	}

	/** Put the reveal away and give the window back. The box that was opened is not stood back
	 * down but built again with the rest: an opened box is a box that has gone, and what the grid
	 * shows is boxes there are to open.
	 *
	 * The state is put back before the host is told, and not after: the host holds the pick, so
	 * hearing this it drops it — which comes straight back here as "stand nothing up", and a scene
	 * still calling itself opened would answer that by dismissing all over again. */
	private dismiss(): void {
		this.state = 'grid';
		this.stood = null;
		this.wanted = null;
		this.reportFront();
		this.callbacks.onBack?.();
		void this.build();
	}

	/** Slice the standing box open. The word is the opening, so the box crazes from here and the
	 * host is left to roll the pack and stand up what it gives (see `onOpen`). */
	private openStood(): void {
		const entry = this.stood;
		if (this.state !== 'stood' || !entry || entry.pack.claimed || entry.sprite.opening) return;
		this.state = 'opening';
		entry.sprite.open({
			onUncovering: () => this.callbacks.onUncovering?.(),
			onOpened: () => {
				if (this.state === 'opening') this.state = 'opened';
				this.callbacks.onOpened?.();
			}
		});
		this.callbacks.onOpen?.(entry.pack);
	}

	/** A tap, wherever it landed. Two things answer one: a box in the window, which stands up,
	 * and the box that is standing, which comes apart. A gutter is nothing, and so is the space
	 * around a standing box.
	 *
	 * A box coming apart is not to be interrupted, and a reveal is not this canvas's to put away:
	 * the pack is open, the cards are standing, and the click that follows closes the whole view
	 * (see `onOpened`, and the sheet the host draws this on). Which is why neither answers a tap
	 * — the click is left to reach the sheet. The way back to the window from a box still whole
	 * is the pick the host holds, and not a tap on the terrain around it: a tap beside the one
	 * thing being looked at is not quietly the way out of looking at it. */
	private onTap(x: number, y: number): void {
		// A box that has finished standing up is opened by a tap on itself, and by one that lands
		// on it: the box is the one object on the canvas and a tap in the space around it is a
		// tap on nothing, which is what the one irreversible act in this view should cost a miss.
		if (this.state === 'stood') {
			if (this.overStood(x, y)) this.openStood();
			return;
		}
		if (this.state !== 'grid') return;
		const entry = this.entryAt(x, y);
		if (entry) this.raise(entry);
	}

	/** Whether a point on the canvas is on the standing box, asked of the sprite's own drawn
	 * bounds — it is in screen space by then (see `focus`), which is the space a pointer lands
	 * in, so no unpicking of the scroll or the grid's scale is needed. */
	private overStood(x: number, y: number): boolean {
		const sprite = this.stood?.sprite;
		if (!sprite || sprite.opening || this.stood?.pack.claimed) return false;
		const bounds = sprite.getBounds();
		return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
	}

	/** The box under a point on the canvas, or null over a gutter. */
	private entryAt(x: number, y: number): BoxEntry | null {
		if (this.builtWidth <= 0) return null;
		const worldX = x / this.scale;
		const worldY = (y - this.scroll) / this.scale;
		const boxHeight = BoosterBoxSprite.heightFor(this.builtWidth);
		return (
			this.entries.find(
				(entry) =>
					worldX >= entry.x &&
					worldX <= entry.x + this.builtWidth &&
					worldY >= entry.y &&
					worldY <= entry.y + boxHeight
			) ?? null
		);
	}

	/** A move from 0 to 1 over `duration`, eased out — the one shape every tween here takes. */
	private tween(duration: number, step: (t: number) => void): Promise<void> {
		return new Promise((resolve) => {
			const start = performance.now();
			const frame = (): void => {
				if (this.isDestroyed) {
					resolve();
					return;
				}
				const elapsed = Math.min(1, (performance.now() - start) / duration);
				step(1 - Math.pow(1 - elapsed, 3));
				if (elapsed < 1) requestAnimationFrame(frame);
				else resolve();
			};
			requestAnimationFrame(frame);
		});
	}

	// --- Scrolling ------------------------------------------------------------------

	private attachNavigation(): void {
		const canvas = this.app.canvas;
		canvas.addEventListener('wheel', this.onWheel, { passive: false });
		canvas.addEventListener('pointerdown', this.onPointerDown);
		canvas.addEventListener('pointermove', this.onPointerMove);
		canvas.addEventListener('pointerup', this.onPointerUp);
		canvas.addEventListener('pointercancel', this.onPointerUp);
		canvas.addEventListener('pointerleave', this.onPointerUp);
	}

	private detachNavigation(): void {
		const canvas = this.app.canvas;
		if (!canvas) return;
		canvas.removeEventListener('wheel', this.onWheel);
		canvas.removeEventListener('pointerdown', this.onPointerDown);
		canvas.removeEventListener('pointermove', this.onPointerMove);
		canvas.removeEventListener('pointerup', this.onPointerUp);
		canvas.removeEventListener('pointercancel', this.onPointerUp);
		canvas.removeEventListener('pointerleave', this.onPointerUp);
	}

	private onWheel = (event: WheelEvent): void => {
		// Only the window scrolls. A box standing up is one object in the middle of the canvas, and
		// there is nothing behind it here to scroll to.
		if (this.state !== 'grid') return;
		if (this.contentHeight * this.scale <= this.canvasHeight) return;
		event.preventDefault();
		this.scroll -= event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
		this.clampScroll();
		this.layer.position.set(0, this.scroll);
	};

	private onPointerDown = (event: PointerEvent): void => {
		if (this.dragPointerId !== null) return;
		this.dragPointerId = event.pointerId;
		this.dragStart = event.clientY;
		this.scrollStart = this.scroll;
		this.dragMoved = false;
		try {
			this.app.canvas.setPointerCapture(event.pointerId);
		} catch {
			// best-effort: a pointer that cannot be captured still scrolls, it just stops at the
			// canvas edge
		}
	};

	private onPointerMove = (event: PointerEvent): void => {
		if (event.pointerId !== this.dragPointerId) {
			this.trackCursor(event);
			return;
		}
		const moved = event.clientY - this.dragStart;
		if (Math.abs(moved) > TAP_SLOP) this.dragMoved = true;
		if (!this.dragMoved || this.state !== 'grid') return;
		this.scroll = this.scrollStart + moved;
		this.clampScroll();
		this.layer.position.set(0, this.scroll);
	};

	private onPointerUp = (event: PointerEvent): void => {
		if (event.pointerId !== this.dragPointerId) return;
		try {
			this.app.canvas.releasePointerCapture(event.pointerId);
		} catch {
			// already released
		}
		this.dragPointerId = null;
		// A clean tap — no meaningful movement — is a pick; anything further was a scroll.
		if (!this.dragMoved && event.type === 'pointerup') {
			const { x, y } = this.localPoint(event);
			this.onTap(x, y);
		}
	};

	/** A point on the canvas, from a pointer event's page coordinates. */
	private localPoint(event: PointerEvent): { x: number; y: number } {
		const rect = this.app.canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	/** The pointer says what a tap would do, which is one of two things: a box in the window to
	 * stand up, or the standing box to open. Neither is a reveal — the click on one belongs to the
	 * whole view rather than to the canvas it lands on. */
	private trackCursor(event: PointerEvent): void {
		const { x, y } = this.localPoint(event);
		const over =
			this.state === 'grid'
				? this.entryAt(x, y) !== null
				: this.state === 'stood' && this.overStood(x, y);
		this.app.canvas.style.cursor = over ? 'pointer' : 'default';
	}

	// --- Surviving a lost GPU context -------------------------------------------------
	// The browser has a hard cap on how many live at once, and this canvas shares a page with
	// the map's other ones. Pixi frees its GPU resources on the loss but its ticker keeps calling
	// render, which then throws on a half-torn-down batcher every frame. Park the ticker while
	// the context is gone and start it again when the browser hands one back — Pixi rebuilds its
	// resources on restore, so the scene simply carries on.

	private attachContextGuards(): void {
		this.app.canvas.addEventListener('webglcontextlost', this.onGlContextLost);
		this.app.canvas.addEventListener('webglcontextrestored', this.onGlContextRestored);
	}

	private detachContextGuards(): void {
		this.app.canvas?.removeEventListener('webglcontextlost', this.onGlContextLost);
		this.app.canvas?.removeEventListener('webglcontextrestored', this.onGlContextRestored);
	}

	private onGlContextLost = (event: Event): void => {
		// Without preventDefault the browser never fires `webglcontextrestored`.
		event.preventDefault();
		this.contextLost = true;
		this.app.ticker?.stop();
		window.setTimeout(() => {
			if (this.isDestroyed || !this.contextLost) return;
			this.callbacks.onContextLost?.();
		}, CONTEXT_RESTORE_GRACE);
	};

	private onGlContextRestored = (): void => {
		if (this.isDestroyed) return;
		this.contextLost = false;
		this.app.ticker?.start();
	};
}
