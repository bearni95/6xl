/**
 * CardSprite
 *
 * A single character trading card, drawn as a Pixi `Container` and reusable in
 * any canvas (the pack opener's reveal, a collection grid, …). It mirrors
 * RosterCard: the character's colour is the portrait backdrop, a dark header strip
 * at the top carries the rarity badge (left) and the character name (centred), and
 * the character's looping idle animation plays in the colour field filling the rest
 * of the card, with the show name overlaid transparently across the top of that
 * field and a free-text location label overlaid across its bottom. The bottom corners
 * carry the orders the card's colour bends — one glyph for a primary, two for a
 * compound. The idle frames
 * (and the fallback face) are lazy-loaded via the shared cache; the host scene
 * drives all positioning and tweens.
 */

import { type Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { spawnYearLabel } from '../spawn/year';
import { traitIcons } from '../color/traits';
import { SpawnColor } from '../../types/character-spawn.type';
import {
	DEFAULT_RENDER_SCALE,
	DEFAULT_WIDTH_CAP,
	type CombatColor
} from '../../types/character-definition.type';
import { loadRenderScale, loadWidthCap } from '../mugen/character-render-scale';
import type { CardModel } from './card-model.type';
import { textureCache, type IdleFrame } from './texture-cache';
import { characterFitScale, IDLE_SCALE_BOOST } from './character-fit';

// Re-exported from their own module (see `character-fit`): how big a character is
// drawn is asked by surfaces that have nothing to do with a card sprite, and one of
// them draws in the document rather than on a canvas.
export { characterFitScale, REFERENCE_SOURCE_HEIGHT, IDLE_SCALE_BOOST } from './character-fit';
export type { FitFrame } from './character-fit';

export interface CardSpriteOptions {
	card: CardModel;
	width: number;
	height: number;
	/** The host's Pixi app — its ticker drives the looping idle animation. */
	app: Application;
	/**
	 * Horizontally mirror the idle art (and its shadow), so the character faces the
	 * opposite way. Defaults to `true` — the flipped view is the card's normal look
	 * everywhere (roster, packs, the player's board cards). Pass `false` for the
	 * original, unmirrored variant, which the board's rival cards use so the two sides
	 * face each other.
	 */
	flipped?: boolean;
}

// Offset (as a fraction of card width) of the silhouette behind the art: a touch
// to the left and down, so the black copy reads as the character's shadow.
const SHADOW_OFFSET_X_RATIO = -0.05;
const SHADOW_OFFSET_Y_RATIO = 0.045;
/** Opacity of the black silhouette drop-shadow. */
const SHADOW_ALPHA = 0.45;

/** Side of a colour-trait glyph, as a fraction of the card's width. */
const TRAIT_ICON_RATIO = 0.16;
/** How far a trait glyph is inset from the card's bottom corner, as a fraction of
 * the card's width. */
const TRAIT_ICON_MARGIN_RATIO = 0.04;

/**
 * The width of the MTG-style frame drawn around a card of the given content width.
 * The frame is *outset* — it extends this far beyond each edge — so a layout placing
 * several cards must reserve this much space around each one to avoid overlap.
 */
export function cardBorderWidth(cardWidth: number): number {
	return Math.max(6, Math.round(cardWidth * 0.05));
}

// Canonical WoW quality colours, indexed by rarity tier — so the rarity label
// reads in its quality colour (Common grey → Legendary orange → …).
const RARITY_COLOR: Record<number, number> = {
	0: 0xf2f2f2, // Common
	1: 0x1eff00, // Uncommon
	2: 0x0070dd, // Rare
	3: 0xa335ee, // Epic
	4: 0xff8000, // Legendary
	5: 0xe6cc80, // Artifact
	6: 0x00ccff // Heirloom
};

// Hex twins of the Tailwind swatches RosterCard uses for each spawn colour.
const COLOR_HEX: Record<SpawnColor, number> = {
	[SpawnColor.Red]: 0xef4444,
	[SpawnColor.Yellow]: 0xfacc15,
	[SpawnColor.Blue]: 0x3b82f6,
	[SpawnColor.Orange]: 0xf97316,
	[SpawnColor.Green]: 0x22c55e,
	[SpawnColor.Purple]: 0xa855f7
};

export class CardSprite extends Container {
	readonly card: CardModel;
	readonly cardWidth: number;
	readonly cardHeight: number;
	private app: Application;
	private artSprite: Sprite;
	private shadowSprite: Sprite;
	private artArea: { x: number; y: number; w: number; h: number };
	// Horizontally mirror the art + shadow (default true; see CardSpriteOptions).
	private flipped: boolean;

	// Resolves once the card's idle animation (or face fallback) has been applied,
	// so a host scene can wait for the card to actually render before revealing it.
	private readonly artReady: Promise<void>;

	// Idle-animation playback state (null until the frames load).
	private idleFrames: IdleFrame[] | null = null;
	// The character's authored render scale, loaded with its frames (see
	// loadRenderScale). 1 until then, which is what a character with no correction
	// authored keeps.
	private renderScale = DEFAULT_RENDER_SCALE;
	// Whether this character's width may size it, read off the same definition (see
	// loadWidthCap). Capped until then, which is what a character that waives nothing
	// keeps.
	private widthCap = DEFAULT_WIDTH_CAP;
	private idleFitScale = 1;
	private idleFeetY = 0;
	private idleCenterX = 0;
	private frameIndex = 0;
	private frameElapsed = 0;
	private tickerAdded = false;

	constructor(opts: CardSpriteOptions) {
		super();
		this.card = opts.card;
		this.cardWidth = opts.width;
		this.cardHeight = opts.height;
		this.app = opts.app;
		this.flipped = opts.flipped ?? true;

		const radius = Math.max(6, this.cardWidth * 0.05);
		// Top→bottom: a name header, then the art. Only the name header takes a band of
		// its own — it keeps the height it had when a stats footer shared the chrome with
		// it (name .14 of the .29 the two bands split between them) — and the coloured art
		// field fills everything below it, all the way to the card's bottom edge. The
		// rarity/show and location rows have no band — they are overlaid, transparently,
		// on the top and bottom of the colour field (see makeShowRow / makeMeta).
		const artSide = this.cardWidth;
		const chrome = this.cardHeight - artSide; // vertical space the header is sized from
		const headerH = Math.round(chrome * (0.14 / 0.29));
		const artY = headerH;
		this.artArea = { x: 0, y: artY, w: artSide, h: this.cardHeight - artY };
		// The rarity/show and location rows are drawn (with no background) over the top
		// and bottom of the colour field respectively.
		const showRowH = Math.round(this.cardHeight * 0.1);
		const metaH = Math.round(this.cardHeight * 0.1);

		// Colored portrait backdrop (the character's colour). The header/footer bands are
		// a 50% black overlay on top of this, so they darken the character colour rather
		// than reading as solid black. No stroke — the rarity-coloured frame sits directly
		// against the card edge.
		const backdrop = new Graphics();
		backdrop.roundRect(0, 0, this.cardWidth, this.cardHeight, radius);
		backdrop.fill(COLOR_HEX[this.card.color] ?? 0x1f2937);
		this.addChild(backdrop);

		// Header strip at the top, carrying the character name — black at 70% opacity.
		// The rarity/show row is not part of it — it floats transparently over the
		// colour field below.
		const header = new Graphics();
		header.rect(0, 0, this.cardWidth, headerH);
		header.fill({ color: 0x000000, alpha: 0.7 });
		this.addChild(header);

		// A black silhouette copy of the art, sitting behind the full-colour sprite
		// (added first, so lower z-index) and offset to the bottom-left — the
		// character's animated shadow. A black tint multiplies every visible pixel's
		// RGB to zero (brightness → 0) while the texture's alpha keeps the shape, so
		// the copy is a pure black silhouette that tracks the animation frame for
		// frame. Added before the art sprite so it always renders underneath it.
		this.shadowSprite = new Sprite(Texture.EMPTY);
		this.shadowSprite.tint = 0x000000;
		this.shadowSprite.alpha = SHADOW_ALPHA;
		this.addChild(this.shadowSprite);

		// The art starts as a transparent 1×1 sprite; its real texture and size are
		// applied once the idle frames (or the fallback face) load.
		this.artSprite = new Sprite(Texture.EMPTY);
		this.addChild(this.artSprite);

		this.addChild(this.makeHeader(headerH));
		this.addChild(this.makeShowRow(artY, showRowH));
		this.addChild(this.makeMeta(this.cardHeight - metaH, metaH));
		this.addChild(this.makeTraitIcons());
		this.addChild(this.makeCopiesBadge());

		// Thick MTG-style frame around the whole card, in the rarity's quality colour
		// (the same colour as the rarity badge text). Outset beyond the card bounds so it
		// expands the card outward rather than eating into the content: its inner edge
		// sits on the card edge (corner radius matched) and the stroke extends outward.
		const borderColor =
			this.card.rarity != null ? (RARITY_COLOR[this.card.rarity] ?? 0xf2f2f2) : 0xf2f2f2;
		const borderWidth = cardBorderWidth(this.cardWidth);
		const border = new Graphics();
		border.roundRect(
			-borderWidth / 2,
			-borderWidth / 2,
			this.cardWidth + borderWidth,
			this.cardHeight + borderWidth,
			radius + borderWidth / 2
		);
		border.stroke({ width: borderWidth, color: borderColor, alpha: 1 });
		this.addChild(border);

		// A black overlay stroked over the frame only (same geometry and rounded corners),
		// at 30% opacity, to darken the rarity colour a touch.
		const borderOverlay = new Graphics();
		borderOverlay.roundRect(
			-borderWidth / 2,
			-borderWidth / 2,
			this.cardWidth + borderWidth,
			this.cardHeight + borderWidth,
			radius + borderWidth / 2
		);
		borderOverlay.stroke({ width: borderWidth, color: 0x000000, alpha: 0.3 });
		this.addChild(borderOverlay);

		this.artReady = this.loadArt();
	}

	/**
	 * Resolves once the card's idle animation (or static face fallback) has loaded
	 * and been applied — i.e. the card has something to render. Lets a host scene
	 * hold an animation (e.g. sliding the pack open) until the card is on screen.
	 */
	whenReady(): Promise<void> {
		return this.artReady;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		// When the whole scene is torn down, `app.destroy()` nulls the ticker before
		// it recursively destroys children, so guard against it already being gone.
		if (this.tickerAdded && this.app.ticker) {
			this.app.ticker.remove(this.tick);
		}
		this.tickerAdded = false;
		super.destroy(options);
	}

	/**
	 * Prefer the looping idle animation; fall back to the static face portrait when
	 * the character ships no idle clip (or its manifest can't be loaded).
	 */
	private async loadArt(): Promise<void> {
		// The clip and how big this character's sheet is drawn come together: both are
		// read off the character's own data, and the size is no use a frame later than
		// the frames it sizes.
		const [frames, renderScale, widthCap] = await Promise.all([
			textureCache.idleFrames(this.card.basePath),
			loadRenderScale(this.card.basePath),
			loadWidthCap(this.card.basePath)
		]);
		if (this.destroyed) return;
		this.renderScale = renderScale;
		this.widthCap = widthCap;
		if (frames && frames.length > 0) {
			this.applyIdle(frames);
			return;
		}

		// Fallback: the static face portrait, contained within the art area.
		const cached = textureCache.cached(this.card.faceUrl);
		if (cached) {
			this.applyFace(cached);
		} else if (this.card.faceUrl) {
			const tex = await textureCache.face(this.card.faceUrl).catch(() => null);
			if (this.destroyed || !tex) return;
			this.applyFace(tex);
		}
	}

	/**
	 * Fit the idle animation inside the art area and start looping it on the app
	 * ticker. How big the character comes out is {@link characterFitScale}'s to say —
	 * the same question the hex board asks of the same function, so a character is the
	 * same size relative to the others on both surfaces. Frames are anchored at their
	 * body axis on a common baseline (so the character breathes in place without
	 * drifting), and that baseline is placed to centre the animation vertically within
	 * the art area.
	 */
	private applyIdle(frames: IdleFrame[]): void {
		this.idleFrames = frames;
		const pad = this.cardWidth * 0.08;
		const boxW = this.artArea.w - pad * 2;
		// The colour field now runs from the header to the card's bottom edge, but the
		// character keeps the size it had when the field was a shorter box: scale it
		// against that original art height (0.75·cardWidth) rather than the taller field,
		// so growing the field never resizes the idle — it only centres it below.
		const boxH = this.cardWidth * 0.75 - pad * 2;

		const maxHeight = Math.max(...frames.map((f) => f.height));
		// Draw the idle (and its shadow, which shares this scale) 30% larger than the
		// fitted size. Applied after the fit so every character grows by the same factor.
		this.idleFitScale =
			characterFitScale(frames, { width: boxW, height: boxH }, this.renderScale, this.widthCap) *
			IDLE_SCALE_BOOST;

		// Horizontally centre the character's *visible* extent in the art box. The body
		// axis can sit off-centre in the frame (and the flip mirrors each frame about it),
		// so simply pinning the axis to the box centre would leave an asymmetric sprite
		// leaning to one side. Instead measure the on-screen reach to the left and right of
		// the axis (max across the whole cycle, flip-aware) and offset the axis by half
		// their difference, so the sprite's bounding box is genuinely centred.
		const screenExtLeft =
			Math.max(...frames.map((f) => (this.flipped ? 1 - f.anchorX : f.anchorX) * f.width)) *
			this.idleFitScale;
		const screenExtRight =
			Math.max(...frames.map((f) => (this.flipped ? f.anchorX : 1 - f.anchorX) * f.width)) *
			this.idleFitScale;
		this.idleCenterX =
			this.artArea.x + this.artArea.w / 2 + (screenExtLeft - screenExtRight) / 2;
		const renderedHeight = maxHeight * this.idleFitScale;
		this.idleFeetY = this.artArea.y + this.artArea.h / 2 + renderedHeight / 2;

		this.frameIndex = 0;
		this.frameElapsed = 0;
		this.applyIdleFrame();

		if (!this.tickerAdded) {
			this.app.ticker.add(this.tick);
			this.tickerAdded = true;
		}
	}

	/** Push the current idle frame's texture, anchor, scale and position to both
	 * the full-colour art sprite and the black silhouette shadow behind it. */
	private applyIdleFrame(): void {
		const frames = this.idleFrames;
		if (!frames || frames.length === 0) return;
		const frame = frames[this.frameIndex % frames.length];

		// Body axis horizontally (stable pivot across frames), feet at the bottom. A
		// negative x-scale mirrors the frame around that axis, so the character faces the
		// other way without drifting off its centre.
		const scaleX = this.flipped ? -this.idleFitScale : this.idleFitScale;
		this.artSprite.texture = frame.texture;
		this.artSprite.anchor.set(frame.anchorX, 1);
		this.artSprite.scale.set(scaleX, this.idleFitScale);
		this.artSprite.position.set(this.idleCenterX, this.idleFeetY);

		// The silhouette mirrors the art, offset down and *behind* it — to the bottom-left
		// unflipped, flipping to the bottom-right so the shadow always trails the side the
		// character faces away from.
		const dx = this.cardWidth * SHADOW_OFFSET_X_RATIO * (this.flipped ? -1 : 1);
		const dy = this.cardWidth * SHADOW_OFFSET_Y_RATIO;
		this.shadowSprite.texture = frame.texture;
		this.shadowSprite.anchor.set(frame.anchorX, 1);
		this.shadowSprite.scale.set(scaleX, this.idleFitScale);
		this.shadowSprite.position.set(this.idleCenterX + dx, this.idleFeetY + dy);
	}

	private tick = (): void => {
		const frames = this.idleFrames;
		if (!frames || frames.length < 2 || this.destroyed) return;
		this.frameElapsed += this.app.ticker.deltaMS;
		let guard = frames.length;
		while (this.frameElapsed >= frames[this.frameIndex].duration && guard-- > 0) {
			this.frameElapsed -= frames[this.frameIndex].duration;
			this.frameIndex = (this.frameIndex + 1) % frames.length;
		}
		this.applyIdleFrame();
	};

	private applyFace(tex: Texture): void {
		this.artSprite.texture = tex;
		// object-contain within the art area, with a little inset padding.
		const pad = this.cardWidth * 0.08;
		const boxW = this.artArea.w - pad * 2;
		const boxH = this.artArea.h - pad * 2;
		const scale = Math.min(boxW / tex.width, boxH / tex.height);
		const w = tex.width * scale;
		const h = tex.height * scale;
		// Centre the face in the art box (it's symmetric, so plain centring suffices).
		const centerX = this.artArea.x + this.artArea.w / 2;
		const y = this.artArea.y + (this.artArea.h - h) / 2;
		// Anchor on the horizontal centre (top edge) so a negative x-scale mirrors the
		// face in place, matching the flipped idle animation.
		const scaleX = this.flipped ? -scale : scale;
		this.artSprite.anchor.set(0.5, 0);
		this.artSprite.scale.set(scaleX, scale);
		this.artSprite.position.set(centerX, y);

		// The silhouette mirrors the face, offset down and behind — bottom-left unflipped,
		// bottom-right when flipped (matching the idle shadow).
		const dx = this.cardWidth * SHADOW_OFFSET_X_RATIO * (this.flipped ? -1 : 1);
		const dy = this.cardWidth * SHADOW_OFFSET_Y_RATIO;
		this.shadowSprite.texture = tex;
		this.shadowSprite.anchor.set(0.5, 0);
		this.shadowSprite.scale.set(scaleX, scale);
		this.shadowSprite.position.set(centerX + dx, y + dy);
	}

	/**
	 * The top title strip: the character name, centred. (The rarity badge no longer
	 * shares this row — the rarity now reads from the card's coloured frame.)
	 */
	private makeHeader(headerH: number): Container {
		const group = new Container();
		const centerY = headerH / 2;
		const nameSize = Math.max(9, Math.round(this.cardWidth * 0.072));

		const name = new Text({
			text: this.card.label,
			style: {
				fontFamily: 'sans-serif',
				fontSize: nameSize,
				fontWeight: '700',
				fill: 0xf2f2f2,
				align: 'center',
				wordWrap: true,
				wordWrapWidth: this.cardWidth * 0.9
			}
		});
		name.anchor.set(0.5, 0.5);
		name.position.set(this.cardWidth / 2, centerY);
		group.addChild(name);

		return group;
	}

	/**
	 * The row overlaid (with no background) on the top of the colour field: the show
	 * name centred. The show name is truncated to the row width. `topY` is the top edge
	 * of the colour field.
	 */
	private makeShowRow(topY: number, showRowH: number): Container {
		const group = new Container();
		const centerY = topY + showRowH / 2;

		// Show name, centred, truncated to the row width.
		if (this.card.showName) {
			const show = new Text({
				text: this.card.showName,
				style: {
					fontFamily: 'sans-serif',
					fontSize: Math.max(8, Math.round(this.cardWidth * 0.06)),
					fontWeight: '600',
					// Solid white with a black outline so it reads over the colour square.
					fill: 0xffffff,
					stroke: { color: 0x000000, width: Math.max(2, Math.round(this.cardWidth * 0.012)) }
				}
			});
			show.alpha = 1;
			this.ellipsize(show, this.card.showName, this.cardWidth * 0.9);
			show.anchor.set(0.5, 0.5);
			show.position.set(this.cardWidth / 2, centerY);
			group.addChild(show);
		}

		return group;
	}

	/**
	 * The location row overlaid (with no background) on the bottom of the colour
	 * field: the location label, with the spawn year as a two-digit suffix (e.g.
	 * `Barcelona '25`), centred in the row. Omitted when the card carries neither a
	 * location nor a spawn date. `metaY` is the top of the row (its bottom sits on the
	 * card's bottom edge).
	 */
	private makeMeta(metaY: number, metaH: number): Container {
		const group = new Container();
		const centerY = metaY + metaH / 2;
		const fontSize = Math.max(8, Math.round(this.cardWidth * 0.06));

		// Join the location and the two-digit spawn year into one label, centred in the
		// row and truncated to most of its width. Solid white with a black outline (like
		// the show name) so it reads over the colour square it sits on.
		const label = [this.card.locationName, spawnYearLabel(this.card.spawnedAt)]
			.filter(Boolean)
			.join(' ');
		if (label) {
			const loc = new Text({
				text: label,
				style: {
					fontFamily: 'sans-serif',
					fontSize,
					fontWeight: '600',
					fill: 0xffffff,
					stroke: { color: 0x000000, width: Math.max(2, Math.round(this.cardWidth * 0.012)) }
				}
			});
			loc.alpha = 1;
			this.ellipsize(loc, label, this.cardWidth * 0.9);
			loc.anchor.set(0.5, 0.5);
			loc.position.set(this.cardWidth / 2, centerY);
			group.addChild(loc);
		}

		return group;
	}

	/**
	 * The card's colour, told as the orders it bends: the sword for red's extra shot,
	 * the gathering energy for yellow's banked charge, the shield for blue's free guard
	 * (see `traitIcons`). A primary card carries one, in the bottom-left corner; a
	 * compound carries both of its components, the first bottom-left and the second
	 * bottom-right, so the pair reads left to right across the card's foot.
	 *
	 * The artwork is white (it is canvas art — see the icon note in CLAUDE.md) and is
	 * drawn plain, exactly as the board draws it. Textures load asynchronously; until
	 * they arrive the sprites are simply empty.
	 */
	private makeTraitIcons(): Container {
		const group = new Container();
		const size = this.cardWidth * TRAIT_ICON_RATIO;
		const margin = this.cardWidth * TRAIT_ICON_MARGIN_RATIO;
		const y = this.cardHeight - margin - size / 2;

		traitIcons(this.card.color as CombatColor).forEach((url, index) => {
			const x =
				index === 0 ? margin + size / 2 : this.cardWidth - margin - size / 2;

			const glyph = new Sprite(Texture.EMPTY);
			glyph.anchor.set(0.5);
			glyph.position.set(x, y);
			group.addChild(glyph);

			void textureCache.icon(url).then((texture) => {
				// The card may have been torn down while the glyph was loading.
				if (!texture || glyph.destroyed) return;
				glyph.texture = texture;
				glyph.scale.set(size / Math.max(texture.width, texture.height));
			});
		});

		return group;
	}

	/**
	 * The duplicate count, as an `×N` pill in the top-right corner of the card — how
	 * many copies of this character the viewer owns. It sits over the name header,
	 * above everything else the card draws. Empty (an unused container) for a card the
	 * viewer holds once, or one that doesn't track copies at all: a lone card needs no
	 * count.
	 */
	private makeCopiesBadge(): Container {
		const group = new Container();
		const copies = this.card.copies ?? 1;
		if (copies < 2) return group;

		const label = new Text({
			text: `×${copies}`,
			style: {
				fontFamily: 'sans-serif',
				fontSize: Math.max(9, Math.round(this.cardWidth * 0.07)),
				fontWeight: '700',
				fill: 0xffffff
			}
		});
		// A dark pill behind it, so the count reads over any art or colour beneath.
		const padX = Math.max(4, Math.round(this.cardWidth * 0.035));
		const padY = Math.max(2, Math.round(this.cardWidth * 0.012));
		const width = label.width + padX * 2;
		const height = label.height + padY * 2;
		const margin = Math.max(3, Math.round(this.cardWidth * 0.03));
		const x = this.cardWidth - margin - width;
		const y = margin;

		const pill = new Graphics();
		pill.roundRect(x, y, width, height, height / 2);
		pill.fill({ color: 0x000000, alpha: 0.7 });
		group.addChild(pill);

		label.anchor.set(0.5, 0.5);
		label.position.set(x + width / 2, y + height / 2);
		group.addChild(label);

		return group;
	}

	/** Trim `full` with a trailing ellipsis until the text fits within `maxWidth`. */
	private ellipsize(text: Text, full: string, maxWidth: number): void {
		text.text = full;
		let trimmed = full;
		while (trimmed.length > 1 && text.width > maxWidth) {
			trimmed = trimmed.slice(0, -1);
			text.text = `${trimmed.trimEnd()}…`;
		}
	}

}
