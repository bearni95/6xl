import type { PathOptions } from 'leaflet';
import type { SpawnColor } from './character-spawn.type';

/** A GeoJSON layer drawn on top of the base map, in array order (last = topmost). */
export interface MapOverlay {
	/** URL of the GeoJSON file, fetched client-side after the map mounts. */
	url: string;
	/**
	 * Leaflet path options for this layer's shapes: one object applied to every
	 * feature, or a function asked for each feature's own — which is what lets a
	 * layer paint every region in its own colour rather than one colour for the
	 * whole tier. The function is called again on every repaint, so it may read
	 * live state (the colour a region flies right now).
	 */
	style: PathOptions | ((feature?: GeoJSON.Feature) => PathOptions);
	/** Style merged onto a feature while hovered; reset on mouseout. */
	hoverStyle?: PathOptions;
	/**
	 * Style merged onto every feature of this layer listed in the map's `dimmedIds`
	 * — the regions sitting clear of the open selection, faded exactly as their pins
	 * are. Declared per layer because a stack of fills has to fade as one: the layer
	 * carrying the visible wash steps down to half, while the layers painting over it
	 * step out of the way instead of compounding their own alpha on top.
	 */
	dimmedStyle?: PathOptions;
	/** Returns the hover tooltip label for a feature. */
	label?: (feature: GeoJSON.Feature) => string;
	/** Called when a feature is clicked. */
	onClick?: (feature: GeoJSON.Feature) => void;
	/**
	 * Whether the layer captures pointer events. Defaults to true;
	 * set false on decorative layers so layers beneath stay hoverable.
	 */
	interactive?: boolean;
}

/**
 * A disc stood on a point, carrying one glyph: the mark for one place on the map.
 *
 * It is a caption and not a control — it catches no pointer, so the land under it is
 * pressed exactly as if it were not there. Which is what lets one be dropped on a
 * point that already answers for something else.
 *
 * Where two would lie on one another the map keeps one and drops the other, heaviest
 * first: a mark about a bigger thing is the one worth the room. So `weight` is
 * whatever the caller measures its things in — nothing here reads it but the sort.
 */
export interface MapGlyphMark {
	/** Stable id, so a rebuild can tell one mark from another. */
	id: string;
	/** Where the disc sits, as [lat, lng] — its centre, not a corner. */
	position: [number, number];
	/** Raw SVG markup for the glyph on it, inlined so it paints in the disc's own ink. */
	iconSvg: string;
	/** How much the mark is worth keeping where two would stand on the same spot. */
	weight: number;
}

/** A standalone straight line (polyline) drawn on the map, independent of any GeoJSON. */
export interface MapLine {
	/** Ordered vertices as [lat, lng] pairs; a straight segment between each. */
	points: [number, number][];
	/** Leaflet path options for the line's stroke. */
	style: PathOptions;
	/** Text shown as a permanent centred label over the line. */
	label?: string;
}

/**
 * What a pin says about taking the region it stands on: how far the reader has got
 * towards it, and the one control that acts on it. Drawn under the side holding the
 * place, at the foot of the pin, so who is to be beaten and the way to fight them are
 * read as one thing standing on one town.
 *
 * Plain data and a callback — which of the button and the countdown is drawn is
 * decided by whoever hands this over, since the rules (a town cooling down after a
 * fight, one battle at a time, a full team to field) are theirs and not the map's.
 */
export interface MapChallenge {
	/** Wins banked against the wins needed to take the region. */
	siege: { wins: number; required: number };
	/** The control to act with, or null when the countdown stands in its place. */
	button: { label: string; title: string; disabled: boolean; onClick: () => void } | null;
	/** Epoch ms the region can be acted on again at; null unless it is closed. */
	unlocksAt: number | null;
	/** Called the moment that countdown runs out, so the control can come back. */
	onUnlock?: () => void;
}

/**
 * A pin dropped at a point, showing an image and caption in a small card — used
 * to mark each imaged region's top show on the map instead of painting it across
 * the region's polygons.
 */
export interface MapMarker {
	/** Stable id (the region key), so the marker layer can diff on rebuild. */
	id: string;
	/** Where the pin sits, as [lat, lng]. */
	position: [number, number];
	/**
	 * The region's bounding box as `[[south, west], [north, east]]`, when known.
	 * Lets a level-of-detail map decide which grouping tier to draw by whether the
	 * region fits the viewport, rather than by a raw pin count.
	 */
	bounds?: [[number, number], [number, number]];
	/**
	 * Raw SVG markup drawn on the pin's tile — the show's glyph, inlined so it paints
	 * in the tile's own colour rather than a baked one. The pin is lettering-only when
	 * null (no glyph picked for that show), exactly as the panel's tables fall back
	 * to the show's name alone.
	 */
	iconSvg: string | null;
	/**
	 * The side standing on this region, in the order it is fielded — drawn on the pin
	 * *under* its plate, as the very statues the roster draws a team with. One member
	 * per statue, in the shape `TeamLineup` takes. It adds to the pin and replaces no
	 * part of it: the plate, its tile and its two lines are the same whether or not
	 * anybody is standing on the place they name.
	 *
	 * Only a municipality has one, and only the picked one: a comarca or a province is
	 * not a thing anybody holds, and every town wearing its side at once would be a
	 * terrain of cards with no map left under it. Absent or empty means the same thing.
	 */
	team?: {
		label: string;
		basePath: string | null;
		color: SpawnColor;
		locationName: string | null;
		showId: number | null;
	}[];
	/**
	 * Who is holding the place, drawn on the plate under the two lines naming it: the
	 * face they wear and what they are called. Absent — or null — where nobody has
	 * taken it, which is a town still on its seeded house team and belongs to no
	 * player to name.
	 *
	 * Only a municipality has one, for the same reason only a municipality has a side
	 * standing on it: a comarca or a province is not a thing anybody holds.
	 *
	 * The avatar is the pair that IS one, the character and the colour together, and
	 * both null is the initial-letter avatar — drawn off the name, exactly as that
	 * player's own profile card draws it.
	 */
	holder?: {
		/** What to call them — already worded for a player who never chose a name. */
		name: string;
		/** The character half of the avatar they wear, or null for the letter. */
		characterId: string | null;
		/** The colour half of that same avatar, or null for the letter. */
		color: SpawnColor | null;
		/** The level they have reached, worked out from their experience, never stored. */
		level: number;
	} | null;
	/**
	 * The siege standing and the challenge control, drawn on the pin's own plate under
	 * the lines naming the place and its show — one mark saying what the town is and what
	 * may be done about it, rather than a second card at the foot of the column.
	 *
	 * Every pin carries the standing: how far a place has been taken is a fact about the
	 * place, not about its being selected. The `button` is what belongs to one town —
	 * only the picked one is given a control, and it too goes bare once the reader holds
	 * the place. Absent altogether means there is nothing there to take.
	 */
	challenge?: MapChallenge | null;
	/**
	 * The booster box this place has waiting, drawn as the last block of the pin's column
	 * (or behind its side, where it has one). Handed to the pin the way its team and its
	 * standing are, because whether a place has one to offer is the caller's question:
	 * which shows a town's packs are printed from and which days the window reaches are
	 * both things this side has never known.
	 *
	 * A map may instead give the whole crop of them to its own box layer (see the `boxes`
	 * prop), which stands them on their points — the two are answers to different
	 * questions, one about a mark a pin carries and one about towns with no pin at all.
	 * A box given here wins for this pin, since the caller has named it.
	 *
	 * The game's own map gives neither: its pins are built with no box and it declares no
	 * box layer, so nothing stands a wrapper on the terrain at any tier or any zoom. What
	 * fills this in is the pin built for the column beside the map — the same `MapMarker`,
	 * off the same builder, drawn as a document rather than on the canvas — which is where
	 * a town's offer is read (see the frontend page's NO_BOXES and `townBox`).
	 */
	box?: MapBoosterBox | null;
	/**
	 * Classes painted onto the glyph's tile at the left end of the pin's plate — the
	 * region's own colour, as a fill plus the ink that reads on it. Null leaves the
	 * tile on the neutral base surface, which is also what a region with no colour
	 * yet gets.
	 */
	frameClasses?: string | null;
	/** The show the region flies — the plate's second line, under the place's name. */
	title: string;
	/** The region's own name — the plate's top line. */
	subtitle?: string;
	/**
	 * `properties.id`s of the overlay features this pin stands for (the region's
	 * municipalities). Hovering the pin applies the overlays' `hoverStyle` to them,
	 * so the whole region lights up as if each polygon were hovered directly.
	 */
	featureIds?: string[];
	/**
	 * Whether the pin sits outside the currently selected area. A dimmed pin fades its
	 * coloured tile so the selected region's pins stand out, without hiding the rest of
	 * the map's breakdown; its plate keeps full opacity either way, so every pin on
	 * screen is still legible.
	 */
	dimmed?: boolean;
	/**
	 * Whether this pin is left off the map altogether — the same tier, the same stack, no
	 * mark drawn for it. Dimming is the answer where every pin still has room to be read
	 * (see `dimmed`); this is for the view where it has not, and one place being looked at
	 * is worth more than the breakdown around it.
	 *
	 * A hidden pin stays in the rendering it belongs to rather than being filtered out of
	 * it, because the stack is read for more than drawing: which tier the view is inside and
	 * which region it is centred on are measured off these boxes, and a map that took the
	 * pins away would have moved those readings with them. So it is one field the drawing
	 * obeys and every measure ignores — and the town's booster mark is taken back by the box
	 * layer onto its own point, exactly as a pin folded into a group has its taken back.
	 */
	hidden?: boolean;
	/** Called when the pin is clicked. */
	onClick?: () => void;
}

/**
 * A place as the plate that names it, away from the map: everything a pin's plate prints
 * about a town — the show's glyph and colour, the place's name and the show it flies,
 * whoever holds it, how far it has been taken — with nothing about *pinning* it.
 *
 * The fields are the marker's own, because it is the marker's plate: a surface drawing this
 * (the combat arena's card over the board) is showing the very mark the map shows, not a
 * second wording of one town. What it leaves behind is everything only a pin needs — where
 * it sits, what it stands for, whether it is dimmed, what a click does — and, in practice,
 * the challenge's button: a card over a fight already under way has nothing left to start.
 */
export interface TownPlateCard {
	iconSvg: string | null;
	frameClasses: string | null;
	title: string;
	subtitle?: string;
	holder?: MapMarker['holder'];
	challenge?: MapChallenge | null;
}

/**
 * A booster box hung at a point — the municipalities whose festa major the booster
 * window reaches, each carrying the pack the Booster tab has waiting for it. Drawn
 * with the very component that tab's grid draws (BoosterBox), off the same four
 * things, so the box on the town and the box in the panel are one object seen in two
 * places.
 *
 * How big a mark it gets is the reader's attention and not the zoom: a town the reader
 * has picked is drawn as the box itself, and every other town — at every tier that marks
 * towns at all — is the disc that box folds up to (see `selected` and `onDiscClick`). A
 * map of covers is a terrain of covers with no map left under it, the same reason only
 * the picked town stands its side up on its pin.
 */
export interface MapBoosterBox {
	/** Stable id (the municipality feature id), so the layer can diff on rebuild. */
	id: string;
	/** The point the box hangs under, as [lat, lng] — the municipality's centre. */
	position: [number, number];
	/** The assigned show's poster, used as the box's cover, or null for a plain frame. */
	coverUrl?: string | null;
	/** The show's wordmark across the head of the cover, or null when it has none. */
	logoUrl?: string | null;
	/**
	 * TMDB id of the assigned show, which the box's whole rendering — cover, wordmark and
	 * lid — is drawn for.
	 */
	showId?: number | null;
	/**
	 * The show's glyph as inline-ready SVG markup, stamped on the disc this box folds up
	 * to — the same mark this map pins the show with, and the same one the box's own lid
	 * takes. Handed over drawn rather than looked up here for the reason a pin's is
	 * (see `MapMarker.iconSvg`): the mark is authored, so it arrives with the data.
	 */
	iconSvg?: string | null;
	/** The town the box belongs to, said across the foot of the cover. */
	locationName?: string | null;
	/**
	 * Printed on white card instead of black — the stock the Booster tab prints this
	 * town's box on: white for a town de festa today, black for a town the window
	 * reaches but whose day is past or still coming.
	 */
	light?: boolean;
	/**
	 * Whether the reader has already opened this box — a town deals two a year, the white
	 * one on the day of its festa and the black one around it, and neither twice. The
	 * mark stays on the town, faded: a box taken is not a box that was never there, and
	 * a reader should be able to see which of the window's towns they have been to.
	 * Always false signed out, there being no claims to read.
	 */
	claimed?: boolean;
	/**
	 * Whether this is the town the reader has picked. The picked town's box is drawn
	 * whole — the cover, its wordmark and the place across its foot, inside that town's
	 * own pin where the tier gives it one; every other town is the disc. Nothing is
	 * hidden by that: a disc is the same object with one mark on it instead of four, and
	 * picking the town is what unfolds it.
	 */
	selected?: boolean;
	/** Called when the box is clicked (e.g. open the town's festa booster pack). */
	onClick?: () => void;
	/**
	 * Called when the *disc* is clicked — the mark an unpicked town's box folds up to. A
	 * box is a cover to be read and a click on it is a click on the pack; a disc is a dot
	 * on a place the reader has not picked yet, and a click on it is more readily a click
	 * on the town than on what the town has waiting — which is also what unfolds it, since
	 * picking the town is what draws its box. Falls back to `onClick` when a caller wants
	 * the same thing at both sizes.
	 */
	onDiscClick?: () => void;
}

/** A standalone circular region drawn on the map, independent of any GeoJSON. */
export interface MapCircle {
	/** Centre as [lat, lng]. */
	center: [number, number];
	/** Radius in metres. */
	radius: number;
	/** Leaflet path options for the circle's stroke/fill. */
	style: PathOptions;
	/** Text shown as a permanent centred label over the circle. */
	label?: string;
	/** Called when the circle is clicked. */
	onClick?: () => void;
}
