<script lang="ts">
	import classNames from 'classnames';
	import { mount, onMount, onDestroy, unmount } from 'svelte';
	import type L from 'leaflet';
	import TeamLineup from '$components/core/TeamLineup.svelte';
	import TownChallenge from '$components/core/TownChallenge.svelte';
	import { PLATE_CLASSES, TILE_CLASSES } from '$components/core/TownPlate.svelte';
	import BoosterBox from '$components/core/pack/BoosterBox.svelte';
	import { levelIndexForView } from '$utils/geo/level-of-detail';
	import { layoutPins, type PinAnchor, type PinOffset } from '$utils/map/pin-layout';
	import { groupPins } from '$utils/map/pin-groups';
	import type {
		MapBoosterBox,
		MapCircle,
		MapGroupMark,
		MapLine,
		MapMarker,
		MapOutline,
		MapOverlay
	} from '$types/map.type';

	let {
		center = [20, 0] as [number, number],
		zoom = 2,
		minZoom = 2,
		maxZoom = 19,
		overlays = [],
		outline = null,
		groupMarks = [],
		circles = [],
		lines = [],
		markers = [],
		markerLevels = null,
		pickedMarker = null,
		boxes = [],
		highlightId = null,
		highlightStyle = null,
		selectedIds = new Set<string>(),
		selectedStyle = null,
		dimmedIds = new Set<string>(),
		hiddenLineUrls = new Set<string>(),
		pulse = null,
		focusBounds = null,
		zoomBounds = null,
		zoomStops = [],
		spotlight = null,
		chromeInsets = {},
		currentZoom = $bindable(zoom),
		activeLevel = $bindable(0),
		currentCenter = $bindable(center),
		classes = ''
	}: {
		/** Initial map centre as [lat, lng]. */
		center?: [number, number];
		zoom?: number;
		minZoom?: number;
		maxZoom?: number;
		/**
		 * GeoJSON overlays drawn in array order (last = topmost). The data is fetched
		 * once at mount, but the array itself is read live: handing over a new array
		 * repaints every layer from its (possibly per-feature) `style`, so a caller
		 * can recolour the map as its state moves. Only the styles are re-read — the
		 * urls and their order must stay put, or a layer would be painted with
		 * another's style.
		 */
		overlays?: MapOverlay[];
		/**
		 * One line drawn over every overlay, in a pane of its own between the polygons
		 * and the marks: the edge of something the shapes add up to, which no shape of
		 * theirs is (see {@link MapOutline}).
		 *
		 * Above the polygons because that is where it is legible — where it runs along a
		 * border it is covering it, and covering it is the point, the border being one of
		 * the edges the outline is made of. Under the marks and under the spotlight's
		 * cover, because it is terrain and not reading matter. It catches no pointer, so
		 * the land under it is clicked exactly as if it were not there.
		 *
		 * Null draws nothing, which is also what an outline with no chains in it does.
		 */
		outline?: MapOutline | null;
		/**
		 * The discs standing on whatever the outline is drawn round — one glyph each, on a
		 * point of the caller's choosing (see {@link MapGroupMark}).
		 *
		 * The map does two things with them the caller cannot: it drops the ones off screen,
		 * and where two would stand on the same spot it keeps the heavier and drops the other
		 * — both of which are questions about the view and are re-asked every time the view
		 * settles. Everything else about a mark is the caller's.
		 */
		groupMarks?: MapGroupMark[];
		/** Standalone circular regions drawn above the overlays. */
		circles?: MapCircle[];
		/** Standalone straight lines drawn above the overlays. */
		lines?: MapLine[];
		/**
		 * Image-and-caption pins dropped above the overlays; rebuilt reactively.
		 * Treated as a single level of detail — for zoom-driven level-of-detail,
		 * pass `markerLevels` instead.
		 */
		markers?: MapMarker[];
		/**
		 * A stack of pin renderings, ordered coarsest → finest (e.g. territory
		 * pins, then province pins, …). At any view the map shows the finest level
		 * whose pins stay legible in the viewport and steps down to a coarser one
		 * as it zooms out, so a dense breakdown never forbids zooming out — it just
		 * falls back to the previous rendering. Takes precedence over `markers`.
		 */
		markerLevels?: MapMarker[][] | null;
		/**
		 * One mark drawn at every tier: the place the reader has picked.
		 *
		 * Nothing hands one over today — the game's map draws no plates on its terrain at all
		 * (see `hidden`, which the page sets on every pin of every tier), where you are being
		 * said by the row along the map's bottom edge and shown by the polygon under the
		 * spotlight. What is written here is what this prop is FOR, and it is the honest answer
		 * wherever a caller does want one mark to outlive the zoom.
		 *
		 * A pin in the stack belongs to a tier and goes when that tier does — which is right for
		 * a mark the map chose to draw, and wrong for the one mark the reader asked for by name.
		 * A town picked at the town tier used to vanish the moment the wheel folded its comarca
		 * up, so the one thing on screen that was there by request was the first thing the zoom
		 * took away.
		 *
		 * So it is handed over beside the stack rather than found in it: the levels stay the
		 * map's model of the breakdown (which tier the view is inside, what a click on the land
		 * opens, how a framing is fitted — see `hidden`), and this is drawn over whichever of
		 * them is on screen. It is dealt its room first (see RANK_PICKED) and never folded into
		 * a count, being about one place and not about a crowd. Culled with the rest when its
		 * point is off screen — a mark pulled into the canvas for a place outside it would be
		 * standing in the room of a place that is on it.
		 *
		 * Drawn once even where the tier on screen has a pin of its own for that region: the two
		 * are the same mark, and the one already in the stack is left to draw it.
		 */
		pickedMarker?: MapMarker | null;
		/**
		 * Booster boxes stood on individual points (the festa-major towns the booster
		 * window reaches) — a town keeps its pin and gets a box, drawn as one more block of
		 * that pin's column where it has one, and on the point itself where the tier gave
		 * it none. How one is marked is the reader's pick and not the zoom (see
		 * markKindForBox): the picked town's box is drawn whole, every other town is a disc
		 * of the box's own stock. The tier only says whether towns are marked at all —
		 * every tier but the coarsest (see marksTowns).
		 */
		boxes?: MapBoosterBox[];
		/** `properties.id` of the one feature to paint with `highlightStyle`. */
		highlightId?: string | null;
		/** Style merged over the highlighted feature's base style. */
		highlightStyle?: L.PathOptions | null;
		/**
		 * `properties.id`s of every feature that belongs to the selected region —
		 * painted with `selectedStyle` and kept painted (unlike the transient hover),
		 * so the whole selected location stays filled. Reactive: repaints when the
		 * selection changes.
		 */
		selectedIds?: Set<string>;
		/** Style merged over the base style of each feature in `selectedIds`. */
		selectedStyle?: L.PathOptions | null;
		/**
		 * `properties.id`s of every feature sitting clear of the selected region —
		 * painted with each overlay's own `dimmedStyle`, the polygon counterpart of a
		 * dimmed pin. Ids may name features of any overlay (each layer decides how it
		 * fades). A feature in `selectedIds` is never dimmed. Reactive: repaints when
		 * the selection changes.
		 */
		dimmedIds?: Set<string>;
		/**
		 * `url`s of the overlays whose stroke should be suppressed. A hidden overlay
		 * keeps its fill but drops its border, so sub-division lines don't crowd the
		 * tier the map is currently focused on. Reactive: repaints as the selection
		 * changes which tier is imaged.
		 */
		hiddenLineUrls?: Set<string>;
		/**
		 * The one shape drawn as breathing: the open region's, whose wash swells and falls
		 * back for as long as it is the open one, in the colour it already flies (see
		 * `--animate-region-pulse`). Which shape, said the way a shape names itself — the
		 * layer it belongs to, and the value its `properties.id` or `properties.name`
		 * carries — plus the wash it is painted at, which is where the breath starts and
		 * returns to and is the caller's, being the caller's own paint.
		 *
		 * A CSS animation and not a repaint: the alpha Leaflet writes is a presentation
		 * attribute, which any rule outranks, so the browser is left to animate one path
		 * while nothing here runs at all. Null takes the pulse off whatever was pulsing.
		 */
		pulse?: { url: string; key: string; opacity: number } | null;
		/**
		 * When set, the map animates to frame this `[[south, west], [north, east]]`
		 * box (e.g. the selected region's polygons). A fresh array reference re-fits
		 * even to the same box, so re-selecting a region re-centres it.
		 */
		focusBounds?: [[number, number], [number, number]] | null;
		/**
		 * When set, the map zooms until this `[[south, west], [north, east]]` box stands whole
		 * in the canvas — and moves nothing else. The same fit `focusBounds` frames to, minus
		 * the framing: the view stays where it is looking and only the scale changes, which is
		 * what a caller asking for a *tier* rather than for a place wants, since the tier drawn
		 * is decided by the size of the region the centre is in and not by where it sits (see
		 * boundsFitAtZoom). A fresh array re-zooms even to the same box.
		 */
		zoomBounds?: [[number, number], [number, number]] | null;
		/**
		 * The boxes whose fits are the zooms a wheel comes to rest at, coarsest first — the
		 * ladder of regions the view is inside, which is the ladder the breadcrumb bar draws.
		 * A notch of the wheel is one step along it rather than an amount of zoom, so a spin
		 * settles where a tier stands whole in the canvas and never between two (see
		 * wheelStopZooms). Read live, so the ladder can be rebuilt as the view moves; empty
		 * leaves the wheel stepping the map's own whole zoom levels.
		 */
		zoomStops?: [[number, number], [number, number]][];
		/**
		 * One shape the map is asked to look at alone — a town a fight is being staged on —
		 * as its own GeoJSON geometry. Null is the map as it usually stands.
		 *
		 * It is a framing and a mask in one gesture, because they are one thing: the shape is
		 * brought to the middle of the canvas at the zoom it stands whole at, on both axes and
		 * against the same margin every other framing keeps (see focusPadding), and everything
		 * outside it is covered by a single black polygon — the world with this shape punched
		 * out of it (see MASK_PANE and the effect under it). So what is left on screen is the
		 * one place, painted in whatever the caller paints it, on nothing.
		 *
		 * The cover is the map's own and not a caller's paint: it is not a region's colour but
		 * the map's way of showing one region alone — and it fades in and out over the 250ms every
		 * polygon on this map repaints over (see MASK_FADE_MS and the paths' own transition), so
		 * raising one is a change the map is seen making rather than a different map.
		 *
		 * What it does NOT do is hide the lines still drawn inside the shape: the black covers
		 * every border outside it, and the shape's own outline is the caller's to drop
		 * (`hiddenLineUrls`) if it wants the place read off its fill alone.
		 */
		spotlight?: GeoJSON.Geometry | null;
		/**
		 * What the caller has drawn over the map, per edge, in pixels — the breadcrumb bar
		 * across the top, a plate in a corner, anything else standing on the canvas that is
		 * not the map's own furniture.
		 *
		 * The map cannot see any of it: those are the parent's elements, positioned over the
		 * same box, and Leaflet's canvas is the whole box either way. So a pin kept "on the
		 * screen" is kept under the bar unless it is told where the bar is — which is what
		 * this is for. It bounds the room the pins are dealt (see placeMarks); it moves nothing
		 * about the map itself, which goes on being the full container.
		 */
		chromeInsets?: { top?: number; right?: number; bottom?: number; left?: number };
		/** Live map zoom level, kept in sync with the map (bindable). */
		currentZoom?: number;
		/**
		 * Index into `markerLevels` of the rendering currently on screen (0 = the
		 * coarsest). Bindable, so the parent can mirror the zoom-driven tier in the
		 * rest of its UI (e.g. which polygon borders and sidebar level to show).
		 */
		activeLevel?: number;
		/** Live map centre as [lat, lng], kept in sync with the map (bindable). */
		currentCenter?: [number, number];
		/** Extra Tailwind classes for the map container. */
		classes?: string;
	} = $props();

	let mapContainer: HTMLDivElement;
	// The Leaflet module + map instance, captured at mount so the reactive
	// $effects (markers, focus, restyle) can drive the map after it exists.
	let Leaf: typeof import('leaflet') | null = null;
	let mapInstance: L.Map | null = null;
	// True from the moment this component is torn down. The mount is async — a dynamic
	// import of Leaflet, then a fetch of every overlay — and a map may be walked off in the
	// middle of either: the arena bounces a visit with nothing staged back here, and this
	// page stages the open battle and goes straight back to it, so the whole of that mount
	// can run against a component that is already gone. Nulling `mapInstance` on destroy
	// answers for what happens after the map exists; this answers for what happens before
	// there is one to null, where the only sign of the teardown would be a container that is
	// no longer in the document.
	let destroyed = false;
	// The geoJSON layer groups, in overlay order, captured at mount so the
	// highlight/hidden-stroke $effect can repaint reactively.
	let overlayGroups: L.GeoJSON[] = [];
	// The pins layer, rebuilt whenever the markers prop changes.
	let markerLayer: L.LayerGroup | null = null;
	// The sides standing on the pins on screen. A pin is plain DOM built by markerElement,
	// except for this one thing: clearing the layer only detaches a mounted component, and
	// a statue runs a frame timer of its own, so every rebuild unmounts the previous crop
	// first rather than leaving it animating for a pin no longer on the map.
	//
	// Kept per pin rather than in one heap, because a pin can now be taken off the map
	// without the rest going with it: a crop is drawn and measured, and the pins that turn
	// out to be one pin are folded into it (see rebuildMarkers). What is folded away has to
	// take its own clock with it, and only a bucket per pin can say which mounts those were.
	let pinMounts = new Map<string, Record<string, unknown>[]>();
	// The festa-box layer, rebuilt whenever the boxes prop changes. Kept separate from the
	// region pins — it marks its towns its own way, and at the coarsest tier not at all
	// (see marksTowns) — and drawn under them.
	let boxLayer: L.LayerGroup | null = null;
	// The boxes are given a Leaflet pane of their own, and not for the stacking. The
	// marker pane is a place no <img> can be sized in: leaflet.css resets every image in
	// it to `width: auto` with `max-width` and `max-height` at none and !important
	// (`.leaflet-container .leaflet-marker-pane img`, a rule for map tiles), which two
	// class names cannot outrank — so a booster box came out correct in every part of
	// itself that is a div, while its cover and its wordmark drew at whatever pixel size
	// the file happens to be and hung off the box in every direction. Everything Leaflet
	// does with a marker it does in any pane, and that selector names one: in a pane of
	// its own the component's own widths are simply left standing.
	const BOX_PANE = 'festaBoxPane';
	// The pane every leader line is drawn in, below both the marks' panes, so no mark is ever
	// crossed by another mark's line (see the pane's own note at createPane).
	const LEADER_PANE = 'pinLeaderPane';
	// The pane the spotlight's mask is drawn in (see `spotlight`), over everything: the polygons
	// in Leaflet's own overlay pane at 400, and the marks standing on them — the leader lines at
	// 580, the boxes at 590, the pins at 600. Covering the lot is what "one place, on nothing"
	// means; the pin of the place itself survives because it is inside the hole (see createPane).
	const MASK_PANE = 'spotlightMaskPane';
	// The pane the grouping line is drawn in (see `outline`), between the polygons in
	// Leaflet's own overlay pane at 400 and the leader lines at 580.
	const OUTLINE_PANE = 'groupOutlinePane';
	// The one path that line is, so a fresh outline can take the previous one off the map.
	// A plain variable: nothing is drawn from it — it IS what was drawn.
	let outlineLayer: L.Polyline | null = null;
	// The pane the discs standing on those groups are drawn in (see `groupMarks`), and the
	// layer holding the crop of them on screen right now. Under the leader lines at 580,
	// since a disc is a caption on the terrain and not a mark a reader acts on.
	const GROUP_PANE = 'groupMarkPane';
	let groupLayer: L.LayerGroup | null = null;
	// The BoosterBox components standing in that layer, tracked for the same reason the
	// pins' mounts are: clearing the layer only detaches their DOM, and a box left
	// mounted holds its poster and its logo for a town no longer on screen.
	let boxMounts: Record<string, unknown>[] = [];
	// Which pin tier is on screen and how many there are — the box layer marks a town only
	// where the pins have got fine enough for a town to be read off one (see marksTowns),
	// so it needs both the tier and the two ends of the stack. Set by rebuildMarkers, which is what decides the tier, and
	// read by rebuildBoxes, which runs right after it wherever the view changes (the
	// moveend handler, the resize observer, and the two $effects in that order).
	//
	// Plain variables and not $state on purpose: the box layer is rebuilt in the same
	// breath as the pins, so it wants the values and not a subscription to them — an effect
	// woken by the tier changing would rebuild a second time and remount every box's
	// pictures for nothing.
	let pinLevelIndex = 0;
	let pinLevelCount = 0;
	// Watches the map container so Leaflet re-projects when the container resizes
	// (e.g. a side panel opening reserves horizontal space). Torn down on destroy.
	let resizeObserver: ResizeObserver | null = null;
	// municipality `properties.id` → the featureIds of the pin region it currently
	// belongs to (at the tier on screen), rebuilt with the pins. Lets hovering
	// anywhere in a pinned region's polygons light that whole region, not just the pin.
	let regionByFeatureId = new Map<string, string[]>();
	// For every overlay that carries a hoverStyle, its group + hoverStyle + a
	// `properties.id → layer` lookup, so a pin can light up all of its region's
	// polygons with the same hover the polygons show on their own mouseover.
	let hoverLayers: { group: L.GeoJSON; hoverStyle: L.PathOptions; byId: Map<string, L.Path> }[] = [];
	// Flipped true once the map and overlays are on the map, so the reactive
	// $effects know the layers exist before they touch them.
	let ready = $state(false);
	// Whether the map is in the middle of a zoom — from the moment one starts to the moveend
	// that ends it. While it is, the map carries no pins at all (see clearMarkers). A plain
	// variable and not $state: it is read by the code that builds the pins, never by anything
	// drawn, and an effect woken by it would be the very rebuild it exists to refuse.
	let midZoom = false;
	// Each drawn pin's rendered size in pixels, keyed by marker id, written by rebuildMarkers
	// off the pins it has just put on the map and read by the framing (see viewForBounds).
	// A plain variable for the same reason `midZoom` is one: nothing is drawn from it, and an
	// effect woken by it would be woken by the very rebuild that fills it.
	let pinExtents = new Map<string, L.Point>();
	// Each drawn mark's leader line, keyed by its id — the strip built with the mark and
	// given its length and its angle once the placement pass knows where it ended up.
	// Filled and cleared with `pinExtents`, and a plain variable for the same reason.
	let pinLeaders = new Map<string, HTMLElement>();
	// The pins that were folded into a count on this rebuild (see foldPins), so the towns
	// among them are not treated as pinned: a town whose pin has gone into a group has no pin
	// to carry its booster mark, and the box layer is what marks it instead (see pinnedIds).
	// A plain variable for the same reason `pinExtents` is one — it is filled by the very
	// rebuild an effect woken by it would run again.
	let foldedIds = new Set<string>();
	// Everything standing on the map right now, in the two families it is drawn in: the region
	// pins and the booster marks. Held rather than placed as each is built, because where a
	// mark may stand is a question about ALL of them — a disc and a plate are different kinds
	// of mark and are never folded into one another (see foldPins), so the only thing that
	// keeps them off each other is being dealt the room together (see placeMarks).
	let pinMarks: PinMark[] = [];
	let boxMarks: PinMark[] = [];
	// The black polygon covering everything outside the spotlit shape, and the timer that
	// takes it off the map once it has faded out. Plain variables: nothing is drawn from
	// them, they are what the spotlight effect has already drawn.
	let maskLayer: L.Polygon | null = null;
	let maskTimer: ReturnType<typeof setTimeout> | null = null;
	// Which spotlight the mask on screen is about, counted up on every change, so a fade-in
	// scheduled for a shape can tell that another one (or none) has been asked for since.
	let maskGeneration = 0;

	// A feature's base style, plus the highlight merged on when it's the chosen
	// one and its stroke dropped when its overlay is hidden. Called both at first
	// paint and by resetStyle, so reading the live props keeps both effects
	// through hover resets.
	function styleFor(overlay: MapOverlay, feature?: GeoJSON.Feature): L.PathOptions {
		// A layer may hand over one style for the whole tier or a function asked per
		// feature — the latter is how a region is painted in its own colour.
		let style = typeof overlay.style === 'function' ? overlay.style(feature) : overlay.style;
		if (highlightId != null && highlightStyle && feature?.properties?.id === highlightId) {
			style = { ...style, ...highlightStyle };
		}
		// Fade everything clear of the selection with this overlay's own dim style, the
		// polygon counterpart of a dimmed pin. Applied before the selected style so a
		// feature that is somehow in both still reads as selected.
		if (overlay.dimmedStyle && feature?.properties?.id != null && dimmedIds.has(String(feature.properties.id))) {
			style = { ...style, ...overlay.dimmedStyle };
		}
		// Keep every feature of the selected region painted with the selected style,
		// so the whole selected location's background stays filled (not just on hover).
		if (selectedStyle && feature?.properties?.id != null && selectedIds.has(String(feature.properties.id))) {
			style = { ...style, ...selectedStyle };
		}
		// Suppress the stroke of a hidden overlay while keeping its fill, so a
		// sub-division border no longer draws over a coarser tier's region.
		if (hiddenLineUrls.has(overlay.url)) {
			style = { ...style, opacity: 0 };
		}
		return style;
	}

	$effect(() => {
		// Repaint when the highlight or the hidden-stroke set changes: resetStyle
		// re-runs each group's style option, which now reflects the new state.
		// `overlays` is in there too: a caller that recolours its layers hands over a
		// fresh array, and each group reads its overlay back out of it by index (see
		// onMount), so the new styles land without refetching a single polygon.
		void overlays;
		void highlightId;
		void highlightStyle;
		void selectedIds;
		void selectedStyle;
		void dimmedIds;
		void hiddenLineUrls;
		for (const group of overlayGroups) group.resetStyle();
	});

	// The class the pulse is, and the property it pulses from — one name each, because the
	// stylesheet and this side both have to spell them and a second spelling is a second
	// animation nobody asked for (see `--animate-region-pulse` in css/app.css).
	const PULSE_CLASS = 'animate-region-pulse';
	const PULSE_FROM = '--region-pulse-from';
	// The path breathing right now, so it can be put back to a plain shape when the pulse
	// moves or goes. A plain variable: nothing is drawn from it — it IS what was drawn.
	let pulsingPath: SVGElement | null = null;
	// Where that path was standing among its neighbours before it was raised, as the element it
	// was drawn before — so putting it back is putting it back, and not a guess at an order.
	// Null means it was the last one drawn, which is what appending it again says.
	let pulsingPathBefore: ChildNode | null = null;

	$effect(() => {
		// Move the pulse. A repaint does not carry it: `resetStyle` re-runs a style option,
		// and a class on an element is not one of the things a style option says — so the
		// class is put on the element here and taken off here, and the shape is found by
		// walking the layer it belongs to.
		//
		// Once per change of the open region, not once per repaint, which is why this is its
		// own effect and not a line in the one above: the tier the map images changes with
		// every notch of the wheel, and the shape that is picked does not.
		const wanted = pulse;
		void ready;
		if (pulsingPath) {
			pulsingPath.classList.remove(PULSE_CLASS);
			pulsingPath.style.removeProperty(PULSE_FROM);
			// Back into the order it came out of, before the class goes: the raising is half of
			// what was done to this shape (see below) and a shape left on top of its map would
			// go on covering the tier it belongs under long after it stopped saying anything.
			// Only against the neighbour it was drawn before if that neighbour is still there;
			// otherwise back to the end, which is where a shape with nothing after it stood.
			const parent = pulsingPath.parentNode;
			const before = pulsingPathBefore?.parentNode === parent ? pulsingPathBefore : null;
			parent?.insertBefore(pulsingPath, before);
			pulsingPath = null;
			pulsingPathBefore = null;
		}
		if (!ready || !wanted) return;
		const index = overlays.findIndex((overlay) => overlay.url === wanted.url);
		const group = overlayGroups[index];
		if (!group) return;
		group.eachLayer((layer) => {
			if (pulsingPath) return;
			const feature = (layer as L.GeoJSON).feature as GeoJSON.Feature | undefined;
			const props = feature?.properties;
			if (!props) return;
			// How a shape names itself is the layer's own business — a town carries an id and
			// every grouping carries a name (see the caller's featureKey) — so both are asked
			// of the one value, within the one layer the caller named. Nothing else in that
			// layer answers to it.
			if (String(props.id ?? '') !== wanted.key && String(props.name ?? '') !== wanted.key) return;
			const path = (layer as L.Path).getElement() as SVGElement | undefined;
			if (!path) return;
			// Over every other shape on the map, and not because it is breathing: the layers are
			// stacked coarsest-on-top, and the one tier that fills is the one the zoom is imaging
			// — so a picked town kept washed while the map draws provinces was painted UNDER the
			// province wash covering it, at a fifth of an alpha, which is a shape saying nothing.
			// Raised, it is read against whatever it stands on at any zoom. Remembered by the
			// neighbour it was drawn before, since it goes back there when the pick moves.
			pulsingPathBefore = path.nextSibling;
			path.parentNode?.appendChild(path);
			path.style.setProperty(PULSE_FROM, String(wanted.opacity));
			path.classList.add(PULSE_CLASS);
			pulsingPath = path;
		});
	});

	$effect(() => {
		// Rebuild the pins whenever the parent swaps the markers (e.g. the selection
		// changes which regions are imaged, or supplies a new level stack). Gated on
		// `ready` so a set passed before mount still applies once the layer exists.
		void markers;
		void markerLevels;
		// The mark that stands at every tier goes with them: it is drawn by that same pass, and
		// naming it here is what makes another place being picked redraw it (see `pickedMarker`).
		void pickedMarker;
		// And whenever the room they are dealt changes shape: the bar across the top grows a
		// row when a search is being typed into it, and the pins under where it now reaches
		// have to be dealt again (see chromeInsets).
		void chromeInsets;
		// The boxes go with them, because which towns the pins fold into counts is settled by
		// this pass and read by that one: a town whose pin has just been folded away is a town
		// the box layer has to mark itself (see pinnedIds), and a box layer left standing from
		// the previous crop would be marking the wrong towns until the map was next moved.
		if (ready) {
			rebuildMarkers();
			rebuildBoxes();
		}
	});

	$effect(() => {
		// Rebuild the festa boxes whenever the parent swaps them (e.g. a new day's
		// festa-major towns arrive). Gated on `ready` so a set passed before mount
		// still applies once the layer exists. The pins go with them: at the town tier a
		// box is drawn inside the pin of the town it belongs to (see markerElement), so a
		// new day's boxes are a new set of pins as much as a new set of boxes.
		void boxes;
		if (ready) {
			rebuildMarkers();
			rebuildBoxes();
		}
	});

	// (Nothing here answers a full view being raised over the map any more. The marker, box and
	// leader panes used to be blurred to nothing and brought back as sheets came and went — a
	// `markersBlurred` prop the root page held to its modal store. A sheet covers the viewport, so
	// what it was clearing was furniture nobody could see, at the cost of every pin on the map
	// filtering twice per modal; and the sheets themselves now simply blur in and out over
	// whatever is behind them, untouched. What still moves the panes' contents is the map's own
	// business: the tier walking in as the zoom changes, and a rebuild when the day's boxes do.)

	$effect(() => {
		// Frame the requested region. Gated on `ready` (a $state flag) so a focus set
		// before the map mounts still applies once the instance exists.
		void ready;
		if (!focusBounds || !mapInstance) return;

		// The zoom at which the box stands inside the canvas with the margin around it, and
		// the centre of the box in the centre of the canvas — so the region is framed whole,
		// with room on all four sides.
		//
		// That is also, and deliberately, the zoom at which the map unfolds the region into
		// its parts: "does this region stand inside the canvas" is the very question the tier
		// rule asks, against this very margin (see boundsFitAtZoom), and the tier it draws is
		// the children of the coarsest region that answers yes. So framing a place and opening
		// it are one movement rather than two rules kept in step by hand — a click frames what
		// it named and pins what is inside it, which is what can be clicked next. A leaf has
		// nothing to unfold into and simply comes to rest framed whole, which is all a town was
		// ever going to do.
		//
		// This used to be stepped one zoom deeper to force that unfolding, and the step was
		// dropped because a zoom was a doubling: the region it was framing came out at up to
		// twice the canvas, so picking a place could put its far side off the screen. Nothing
		// is stepped now and nothing needs to be — the zoom is fractional (see zoomSnap), so
		// the framing lands exactly on the fit rather than up to a doubling short of it, and
		// exactly on the fit is the side of the threshold the children are drawn on.
		//
		// What is actually framed, though, is the pins and not the box (see viewForBounds):
		// what a reader is brought to a place to look at is the marks the map makes on it,
		// and those are the thing that has to come out whole on the canvas.
		const view = viewForBounds(focusBounds);
		mapInstance.setView(view.centre, view.zoom, { animate: true });
	});

	$effect(() => {
		// Zoom to fit a box without going to it. The zoom is the region's own fit, against the
		// same margin the framing starts from, so a caller asking for the zoom at which a
		// region stands whole gets it — and, since the level-of-detail rule measures a region's
		// size and not its place (see boundsFitAtZoom), the tier the map draws lands where the
		// caller asked for it.
		//
		// Where the framing goes on to fit the pins as well (see viewForBounds), this stops at
		// the region: fitting pins is fitting them around a centre, and this is the one request
		// that deliberately leaves the centre alone. So a rung pressed on the ladder can land a
		// tenth of a level tighter than pressing the pin would have — the same tier, the same
		// place, read at the region's own fit rather than at its marks'.
		void ready;
		if (!zoomBounds || !mapInstance) return;
		mapInstance.setZoom(mapInstance.getBoundsZoom(zoomBounds, false, focusPadding()), {
			animate: true
		});
	});

	$effect(() => {
		// Draw the grouping line, or take it off. Gated on `ready` like the framings above,
		// so an outline handed over before the map mounts is still drawn once there is a
		// pane to draw it in.
		//
		// Redrawn whole rather than edited: the chains are a fresh answer to a question about
		// every shape on the tier (which of them group together, and where that group ends),
		// so there is no such thing as moving part of one. One polyline for the lot — a list
		// of lists is a single path with a subpath each, which is what keeps a couple of
		// thousand chains to one element on the map.
		const wanted = outline;
		if (!ready || !mapInstance || !Leaf) return;

		outlineLayer?.remove();
		outlineLayer = null;
		if (!wanted?.chains.length) return;

		outlineLayer = Leaf.polyline(wanted.chains, {
			...wanted.style,
			pane: OUTLINE_PANE,
			// Nothing is inside a chain — it is a run of edges and may not even close — and
			// a path Leaflet fills would paint the shape a browser closes it into.
			fill: false,
			interactive: false
		}).addTo(mapInstance);
	});

	// How wide a group disc is (`size-10`), which is the one place that class's size has to be
	// reckoned with rather than applied: the map decides which discs stand by measuring them
	// against each other, and a measurement cannot be read out of a class.
	const GROUP_DISC_EXTENT = 40;

	// The disc itself: the glyph on the chrome every plate on this map is drawn on — base-100
	// at four fifths, so the terrain reads faintly through it — inside a ring in the colour of
	// the line round the group it belongs to, which is what says the two are one statement.
	// The ring is the group's colour and the glyph is not: the mark is drawn in the theme's
	// primary, so what is being said (this show) reads in the game's own ink and the ring goes
	// on saying which line it belongs to.
	//
	// The glyph is inlined rather than pointed at by an <img> so it paints in the disc's own
	// ink (see inlineIconMarkup), and sized through a CSS rule, which outranks the svg's own
	// 1em width and height. Decorative: what the mark says is said in full in the column
	// beside the map, and a glyph read aloud off a map is a name nobody asked for.
	function groupDiscElement(mark: MapGroupMark): HTMLElement {
		const disc = document.createElement('div');
		disc.className =
			'flex size-10 items-center justify-center rounded-full shadow-md ' +
			'bg-base-100/80 text-primary ring-2 ring-secondary [&>svg]:size-6';
		disc.setAttribute('aria-hidden', 'true');
		disc.innerHTML = mark.iconSvg;
		return disc;
	}

	// (Re)build the group discs for the current view: clear the crop that was standing, keep
	// the ones inside the viewport, and drop the ones that would stand on a disc already
	// placed. Runs whenever the marks change and whenever the map settles, so both answers
	// track what is on screen.
	//
	// Heaviest first, so what survives a crowd is the mark about the biggest thing — a show
	// holding a whole comarca keeps its disc where a single town of it beside the border
	// loses one. The test is against the discs already placed and in container pixels,
	// because standing on one another is a fact about the view and not about the ground:
	// two points a kilometre apart are one mark at the top view and two a few zooms in.
	//
	// O(kept²), and kept is bounded by the canvas — a screen only holds so many discs that
	// are not on top of each other, which is the very thing being enforced.
	function rebuildGroupMarks() {
		if (!mapInstance || !Leaf) return;
		if (!groupLayer) groupLayer = Leaf.layerGroup().addTo(mapInstance);
		groupLayer.clearLayers();

		const bounds = mapInstance.getBounds();
		const room = GROUP_DISC_EXTENT + PIN_GAP;
		const placed: L.Point[] = [];

		for (const mark of [...groupMarks].sort((a, b) => b.weight - a.weight)) {
			if (!bounds.contains(mark.position)) continue;
			const at = mapInstance.latLngToContainerPoint(mark.position);
			if (placed.some((taken) => Math.abs(taken.x - at.x) < room && Math.abs(taken.y - at.y) < room))
				continue;
			placed.push(at);

			// Anchored at its middle, so the disc is centred on the point rather than hung
			// off it — this is a mark ON a place, not a pin pointing at one, and it is dealt
			// no room by the placement pass for the same reason.
			const icon = Leaf.divIcon({
				html: groupDiscElement(mark),
				className: '',
				iconSize: [GROUP_DISC_EXTENT, GROUP_DISC_EXTENT],
				iconAnchor: [GROUP_DISC_EXTENT / 2, GROUP_DISC_EXTENT / 2]
			});
			Leaf.marker(mark.position, { icon, pane: GROUP_PANE, interactive: false }).addTo(
				groupLayer
			);
		}
	}

	$effect(() => {
		// Rebuild the discs whenever the parent swaps them — the zoom reaching another tier,
		// a town changing hands, the glyphs landing. Gated on `ready` like every other layer,
		// so a set handed over before the map mounts is still drawn once there is one.
		void groupMarks;
		if (ready) rebuildGroupMarks();
	});

	// How long the mask takes to arrive and to go, matched to the 250ms every polygon repaints
	// over (see the paths' transition below) — one gesture, and a black that cut in at once
	// would be the one part of it that did not play.
	const MASK_FADE_MS = 250;

	// Carried by every polygon on the map: its fill and its stroke are eased over the same
	// 250ms the mask fades over, so a repaint is a change the map is seen making rather
	// than a different map. That is what a spotlight is drawn out of on both sides — the town
	// taking its 80% wash and every border going, and both coming back when the fight leaves —
	// and, being the polygons' own paint and not the spotlight's, it is as true of a tier
	// giving way to the next as the zoom walks in.
	//
	// The two properties are named rather than `transition-all`: a Leaflet path's `d` is
	// rewritten on every pan and zoom, and a browser that eases `d` (they do) would draw the
	// whole map a quarter of a second behind the hand moving it.
	const PATH_CLASSES = 'transition-[fill-opacity,stroke-opacity] duration-[250ms] ease-in-out';

	// What the cover is: black at nine parts in ten, and no line at all. Not the full ten,
	// so the terrain is still faintly there under it — what is covered is put out of the
	// reading rather than taken off the map, which is the same thing the blur does to the
	// furniture. A stroke on it would be a border drawn around the spotlit shape at the very
	// moment the map has done away with borders.
	const MASK_STYLE = { color: '#000', fillColor: '#000', fillOpacity: 0.9, stroke: false };

	// The ring the cover starts from: the whole of the projected world, which the renderer
	// clips to the canvas before it draws it, so the map may be panned anywhere behind the
	// mask without ever reaching its edge. Latitudes stop at Mercator's own limit, past which
	// the projection has no point to give.
	const WORLD_RING: [number, number][] = [
		[-85, -180],
		[-85, 180],
		[85, 180],
		[85, -180]
	];

	$effect(() => {
		// Raise or lower the spotlight (see the prop): frame the shape, and cover the rest of
		// the map with the world minus that shape.
		//
		// Gated on `ready` like the framings above, so a spotlight handed over before the map
		// mounts is still drawn once there is a map to draw it on.
		const geometry = spotlight;
		if (!ready || !mapInstance || !Leaf) return;

		// A shape with no rings to it is no spotlight — the light has nothing to be on, and
		// leaving the map covered would be blacking it out around nothing.
		const rings = geometry ? spotlightRings(geometry) : [];

		const pane = mapInstance.getPane(MASK_PANE);
		if (maskTimer) {
			clearTimeout(maskTimer);
			maskTimer = null;
		}
		const generation = ++maskGeneration;

		if (!rings.length) {
			// Fade it out, then take it off — a layer removed on the spot takes its fade with it.
			pane?.classList.add('opacity-0');
			maskTimer = setTimeout(() => {
				maskLayer?.remove();
				maskLayer = null;
			}, MASK_FADE_MS);
			return;
		}

		maskLayer?.remove();
		// The world with the shape's every ring cut out of it. One polygon rather than a hole
		// per ring, because the cover is one thing: Leaflet fills a path even-odd, so a ring
		// inside the world ring is a hole and a ring inside THAT one is filled again — which
		// is exactly right for a town that encloses another town's land.
		maskLayer = Leaf.polygon([WORLD_RING, ...rings], {
			...MASK_STYLE,
			pane: MASK_PANE,
			interactive: false
		}).addTo(mapInstance);
		frameSpotlight(rings);
		// A frame later, so the pane has been drawn hidden once and the class coming off is a
		// change the browser has something to ease from.
		requestAnimationFrame(() => {
			if (generation === maskGeneration) pane?.classList.remove('opacity-0');
		});
	});

	/**
	 * A spotlit geometry's rings as Leaflet takes them — every ring of a Polygon, and every
	 * ring of every part of a MultiPolygon, since a town with islands is one shape and all of
	 * it is in the light. Anything that is not a polygon has no area to spotlight.
	 */
	function spotlightRings(geometry: GeoJSON.Geometry): L.LatLng[][] {
		if (geometry.type === 'Polygon') {
			return Leaf!.GeoJSON.coordsToLatLngs(geometry.coordinates, 1) as L.LatLng[][];
		}
		if (geometry.type === 'MultiPolygon') {
			return geometry.coordinates.flatMap(
				(part) => Leaf!.GeoJSON.coordsToLatLngs(part, 1) as L.LatLng[][]
			);
		}
		return [];
	}

	/**
	 * Put the spotlit shape in the middle of the canvas at the zoom it stands whole at.
	 *
	 * Deliberately not `viewForBounds`: that framing is about the marks standing on a region
	 * and gives up zoom to seat them (see its note), and there are no marks here — the
	 * furniture is off the map for as long as a spotlight is up. So this is the box and
	 * nothing else, fitted against the same margin every other framing keeps.
	 *
	 * The centre is taken in pixels rather than in degrees: a Mercator box's middle latitude
	 * is not the middle of the box on screen, and "in the middle" is a statement about the
	 * screen.
	 */
	function frameSpotlight(rings: L.LatLng[][]): void {
		const bounds = Leaf!.latLngBounds(rings.flat());
		if (!bounds.isValid()) return;
		const zoom = mapInstance!.getBoundsZoom(bounds, false, focusPadding());
		const centre = mapInstance!.unproject(
			mapInstance!
				.project(bounds.getNorthWest(), zoom)
				.add(mapInstance!.project(bounds.getSouthEast(), zoom))
				.divideBy(2),
			zoom
		);
		mapInstance!.setView(centre, zoom, { animate: true });
	}

	// The margin kept clear between a region and the edge of the canvas, per side: a share
	// of the canvas, capped in pixels, so a small map gives up a margin it can afford rather
	// than the same 24px a large one hardly notices.
	//
	// One margin, read by both halves of the same statement: the framing puts a region
	// inside it (focusPadding), and the level of detail asks whether a region is inside it
	// (boundsFitAtZoom). They were a 4% margin and a flat 85% of the canvas, two figures for
	// one idea — so a framed region measured as fitting or as overflowing depending on how far
	// `getBoundsZoom` had snapped down for it, and clicking a pin unfolded the map into the
	// region for some regions and left it pinning the region itself for others.
	const FOCUS_MARGIN = 24;
	const FOCUS_MARGIN_SHARE = 0.04;

	/** That margin against the canvas as it stands, in pixels, per side. */
	function focusMargin(): L.Point {
		const size = mapInstance!.getSize();
		return Leaf!.point(
			Math.min(FOCUS_MARGIN, size.x * FOCUS_MARGIN_SHARE),
			Math.min(FOCUS_MARGIN, size.y * FOCUS_MARGIN_SHARE)
		);
	}

	// The same margin in the form `getBoundsZoom` wants it: it takes the padding off the
	// canvas ONCE for the whole axis, so a margin wanted at both ends is handed over
	// doubled.
	function focusPadding(): L.Point {
		return focusMargin().multiplyBy(2);
	}

	// The geographic centre of a `[[south, west], [north, east]]` box.
	function focusBoundsCentre(
		bounds: [[number, number], [number, number]]
	): [number, number] {
		const [[south, west], [north, east]] = bounds;
		return [(south + north) / 2, (west + east) / 2];
	}

	// The most zoom a framing will give up to get its pins whole: one level, which halves how
	// far apart they land on the canvas. Bounded, rather than searched down to the map's own
	// floor, for two reasons. A pin that cannot be seated at any zoom — a picked town's column
	// is taller than a short window whatever the map does — would pull the view out to nothing
	// for no gain. And the tier the map draws is decided by what fits the canvas (see
	// levelForView), so a framing free to fly far enough out would fold the very pins it was
	// framing back into their parents. A level is far more than the overhang of a plate and
	// well short of the gap between one tier and the next.
	const PIN_FIT_BACKOFF = 1;

	// What a pin nobody has measured is taken to be: its plate, at the widest a plate goes
	// (`max-w-[15rem]`) and the height one comes out at (a `size-10` tile in `p-1.5`, under the
	// `mt-1` it hangs by). Every pin has a plate and most pins are nothing else, so a framing
	// that reaches a region whose pins are not on screen to be read is out by whatever statues
	// and a booster box would have added, rather than out by a whole pin.
	const PIN_PLATE_EXTENT: [number, number] = [240, 56];

	// The gap a moved pin asks for between its point and its left edge — short enough that the
	// mark reads as belonging to the place, long enough that the line between them is a line
	// and not a nick. Named here rather than left to the layout's own default because the
	// framing has to reckon with the same reach (see pinsPixelBox and placeMarks).
	const PIN_LEAD = 16;

	// The clear space demanded between two marks, which is one number for two questions: how
	// near two pins may stand before they are one pin (see foldPins), and how near the layout
	// may place two marks that were not folded (see placeMarks). Two numbers there would be a
	// crowd folded by one rule and laid out by another, which is a pair of pins left touching
	// because each pass thought the other had dealt with them.
	const PIN_GAP = 4;

	// The zoom and centre a framing settles on: the highest zoom at which every pin this view
	// is about to draw for the region stands whole on the canvas, centred on what those pins
	// cover rather than on the box around the region.
	//
	// The box is what used to be framed, and a box is not what is being looked at. A pin is
	// drawn in pixels and not in the projection — it is the same size whatever the map does
	// (see clearMarkers) — and the picked town's is some 700px of plate, statues, booster box
	// and siege bar centred on the town's point. Framing the polygon put the middle of the
	// polygon on the middle of the canvas, which is not even where the pin stands (a pin takes
	// the region's own centroid, not the centre of the box around it), and then zoomed until
	// the town filled the canvas — at which point the mark standing on the town hung off the
	// top of the screen and the bottom. So the pins are measured as they are drawn (see
	// rebuildMarkers), their boxes are what the canvas is fitted to, and the centre is the
	// middle of what they cover.
	//
	// Giving up zoom only helps a region that draws SEVERAL pins: it brings their points
	// together while each keeps its size. So that is the only case it happens in — a region
	// whose pins already fit is framed at the zoom it asked for, and a pin that fits at no
	// zoom is centred and left to clip equally at both ends, no zoom having been able to
	// help it.
	function viewForBounds(bounds: [[number, number], [number, number]]): {
		centre: [number, number];
		zoom: number;
	} {
		const fitZoom = mapInstance!.getBoundsZoom(bounds, false, focusPadding());
		const centre = focusBoundsCentre(bounds);
		const levels = markerLevelStack();
		// The tier this framing is about to draw, asked exactly as the map will ask it on
		// arrival (see levelForView): the children of the coarsest region that fits. Asked at
		// the zoom the region itself called for, since that is the zoom the answer is about —
		// the search below only ever gives zoom up, and giving zoom up makes more regions fit
		// rather than fewer, which is what PIN_FIT_BACKOFF is bounded for.
		const tier = levels.length
			? levelIndexForView(levels, centre, (box) => boundsFitAtZoom(box, fitZoom))
			: 0;
		// The pins this framing will actually draw, so a mark that is left off the map cannot buy
		// room with zoom the view had (see MapMarker.hidden) — the whole of what a hidden pin
		// takes is nothing.
		const pins = (levels[tier] ?? []).filter(
			(marker) => !marker.hidden && withinBounds(marker.position, bounds)
		);
		if (!pins.length) return { centre, zoom: fitZoom };

		const floor = Math.max(fitZoom - PIN_FIT_BACKOFF, mapInstance!.getMinZoom());
		let zoom = fitZoom;
		// The pins' spread grows with the zoom while their own sizes do not, so "do they fit"
		// is answered no above some zoom and yes below it, and a few halvings between the two
		// ends land on it to a thousandth of a level — closer than a view can be looked at.
		// Only worth asking when the two ends disagree: fitting at the top means there is
		// nothing to gain, and fitting at neither end means there is nothing to gain either,
		// so the framing keeps the zoom the region asked for rather than pulling out for a pin
		// no zoom can seat.
		if (!pinsFitAtZoom(pins, fitZoom) && pinsFitAtZoom(pins, floor)) {
			let low = floor;
			let high = fitZoom;
			for (let step = 0; step < 10; step++) {
				const mid = (low + high) / 2;
				if (pinsFitAtZoom(pins, mid)) low = mid;
				else high = mid;
			}
			zoom = low;
		}
		return { centre: pinsCentre(pins, zoom), zoom };
	}

	// The pixel box these pins stand inside at a zoom: each one's point projected, then grown
	// by the mark standing on it — half its width each way and half its height each way, a
	// mark being centred on the point it is about (see classNamesFor).
	//
	// Asked of the pin where it MEANS to stand, not where the crowd put it. The framing is a
	// question about a view that does not exist yet — a zoom being weighed up, at which the
	// pins have neither been folded nor laid out and could not be without drawing them — and
	// the offsets are answers about the view on screen now. The point is the part that is the
	// same in every view, which makes it the honest part to reckon a hypothetical with; a pin
	// moved off it, or folded into a count with its neighbours, is the map making room inside
	// the box this measures rather than leaving it.
	function pinsPixelBox(
		pins: MapMarker[],
		zoom: number
	): { minX: number; minY: number; maxX: number; maxY: number } {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const pin of pins) {
			const at = mapInstance!.project(pin.position, zoom);
			const extent = pinExtents.get(pin.id);
			const halfX = (extent ? extent.x : PIN_PLATE_EXTENT[0]) / 2;
			const halfY = (extent ? extent.y : PIN_PLATE_EXTENT[1]) / 2;
			minX = Math.min(minX, at.x - halfX);
			maxX = Math.max(maxX, at.x + halfX);
			minY = Math.min(minY, at.y - halfY);
			maxY = Math.max(maxY, at.y + halfY);
		}
		return { minX, minY, maxX, maxY };
	}

	// Whether that box stands inside the canvas, against the same margin and the same pixel of
	// slack a region's own box is measured with (see boundsFitAtZoom) — one rule for what
	// "fits" means, whether the thing being fitted is a region or the marks standing on it.
	function pinsFitAtZoom(pins: MapMarker[], zoom: number): boolean {
		const { minX, minY, maxX, maxY } = pinsPixelBox(pins, zoom);
		const size = mapInstance!.getSize();
		const margin = focusMargin();
		return (
			maxX - minX <= size.x - 2 * margin.x + FIT_TOLERANCE &&
			maxY - minY <= size.y - 2 * margin.y + FIT_TOLERANCE
		);
	}

	// The place to put on the middle of the canvas: the middle of what the pins cover, read
	// back out of the projection — the marks standing on the points and not the points alone,
	// so what is centred is what is being looked at. For the one pin a municipality draws that
	// comes back to its own point, the mark being centred on it.
	function pinsCentre(pins: MapMarker[], zoom: number): [number, number] {
		const { minX, minY, maxX, maxY } = pinsPixelBox(pins, zoom);
		const middle = mapInstance!.unproject(
			Leaf!.point((minX + maxX) / 2, (minY + maxY) / 2),
			zoom
		);
		return [middle.lat, middle.lng];
	}

	/** Whether a point stands inside a `[[south, west], [north, east]]` box. */
	function withinBounds(
		position: [number, number],
		bounds: [[number, number], [number, number]]
	): boolean {
		const [[south, west], [north, east]] = bounds;
		const [lat, lng] = position;
		return lat >= south && lat <= north && lng >= west && lng <= east;
	}

	// One box inside a mark that is a control rather than part of the mark: the challenge's bar,
	// the booster box, the radio's play/pause. Without this a press on it would go on up to the
	// marker — re-opening the region and re-framing the view under the reader — and a drag begun
	// on it would pan the map. Leaflet's own way of saying "this DOM is a widget, not terrain",
	// said once here because three kinds of mark ask for it and a mark that forgot to would be a
	// button that moves the map.
	function guardWidget(element: HTMLElement): void {
		Leaf!.DomEvent.disableClickPropagation(element);
		Leaf!.DomEvent.disableScrollPropagation(element);
	}

	// Build a pin's DOM: the one plate that says what the pin is — the tile at its left end,
	// the place's name and its show's beside it — and, on the picked town, the side holding
	// it standing over that plate. The wrapper is translated so its bottom centre sits on
	// the point (the marker itself is zero-sized, see rebuildMarkers), giving a pin that
	// stands above its region.
	//
	// The plate is built the same way whether or not there is a side over it: a pin is the
	// map's mark on a place, and the place does not stop being named because somebody is
	// standing on it. So the statues are added to the pin rather than drawn in place of any
	// part of it, and the plate is read UNDER them — the side and the box it came out of are
	// the picture, and the plate is its caption: what the place is called, who is sitting on
	// it, how far it has been taken and what may be done about it, all of it about the three
	// standing above it and none of it worth putting between them and the point.
	function markerElement(marker: MapMarker): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = classNamesFor(marker);

		// (One thing on this pin was not a fact about its region — the radio, drawn on the mark for
		// the place the map is open on and on no other, which is why this function used to have to
		// know which mark that was. It is on the row along the map's own bottom edge now, beside
		// the badge naming that same place, so every line of every plate here is again a fact about
		// the region the pin stands on and nothing here asks about the picked mark.)

		// The line back to the place is NOT in here. It stands on the point, in a pane of its
		// own under every mark on the map (see addLeader), so that a line never crosses a
		// neighbour's plate on top of it.

		// A square tile in the region's colour carrying the show's glyph, standing at the
		// left end of the plate below. The glyph is inlined rather than pointed at by an
		// <img> so it inherits the tile's ink (see inlineIconMarkup) — which is why the fill and
		// the ink arrive together in `frameClasses`. Sized through a CSS rule, which outranks
		// the svg's own 1em width/height attributes. Decorative: the show is named in the
		// line right beside it, so announcing the glyph too would read it twice. A pin with
		// neither a colour nor a glyph is lettering alone and skips the tile entirely.
		let tile: HTMLElement | null = null;
		if (marker.iconSvg || marker.frameClasses) {
			tile = document.createElement('div');
			tile.className =
				TILE_CLASSES +
				' [&>svg]:size-7 ' +
				(marker.frameClasses ?? 'bg-base-100 text-base-content') +
				// A pin clear of the selection recedes by its colour, not by its lettering:
				// the fade is on the tile alone (see classNamesFor).
				(marker.dimmed ? ' opacity-50' : '');
			tile.setAttribute('aria-hidden', 'true');
			if (marker.iconSvg) tile.innerHTML = marker.iconSvg;
		}

		// One plate for everything the pin says AND everything it offers: the tile, the place
		// and the show on its head row, and under them the siege standing — on every pin that
		// has one — with the one control that acts on it where the caller gave the pin a
		// control at all (the picked town). The three separate chips this replaces
		// each carried their own card, which put two rounded boxes and a bordered tile on a
		// town where one mark belongs. The place is the pin's own name and takes the ink; the
		// show is what it flies and is lettered under it.
		//
		// The siege is in here rather than in a card of its own at the foot of the column for
		// the same reason: what a town is called, whose colour it flies and how far it has been
		// taken are one reading about one place, and printing them on two surfaces made the bar
		// look like a second mark about a second thing. It also settles the bar's width, which
		// nothing else could — the plate is the only part of a pin with a width of its own (see
		// classNamesFor), so a bar inside it is as wide as the name above it.
		//
		// Which is why it now has a floor as well as a ceiling: shrink-to-fit alone, a town
		// with a short name gave the bar under it a stub to draw in and the button beneath a
		// line to wrap on. 200px is the plate's least width whatever it is carrying, so a
		// pin's bar and button never come out narrower than they can be read at; the 15rem
		// cap above it is still what a long name truncates against.
		// The breadcrumb bar's surface — base-100 at four fifths — and not the flat black these
		// were printed in: a pin's plate and the bar naming where the map is looking are the one
		// chrome, and a pin is the thing that bar's path is walked with. Four fifths still keeps
		// the lettering off the terrain, which is the whole of what the black was for, while
		// letting the ground the pin stands on read faintly through the mark standing on it.
		const plate = document.createElement('div');
		plate.className = PIN_PLATE_CLASSES;

		// The head row: the tile at the left end, the two lines beside it.
		const head = document.createElement('div');
		head.className = 'flex items-center gap-2';

		if (tile) head.appendChild(tile);

		// `min-w-0` is what lets a line longer than the plate's own width truncate rather
		// than push the plate wider: a flex item's floor is its content otherwise.
		const lines = document.createElement('div');
		lines.className = 'flex min-w-0 flex-col text-left leading-tight';

		if (marker.subtitle) {
			const location = document.createElement('span');
			location.textContent = marker.subtitle;
			location.className = 'truncate text-xs font-semibold';
			lines.appendChild(location);
		}

		const caption = document.createElement('span');
		caption.textContent = marker.title;
		caption.className = 'truncate text-xs font-medium text-white/70';
		lines.appendChild(caption);

		head.appendChild(lines);
		plate.appendChild(head);

		// (Whose the place is stood here, between what it is called and how far it has been
		// taken: a row of the holder's face and their username, mounted rather than built
		// because an avatar is a sprite sheet loaded and cropped and not markup a string can
		// carry. It is off every plate now — the band over the side already wears that same
		// face (see TeamLineup's `owner`), so a mark carrying both said one player twice, and
		// the one that went is the one that only ever had room for a name.)

		// What can be done about the place, on the plate that names it: the siege standing and
		// the one control that acts on it, under the head row. Mounted and tracked exactly as
		// the team is — it runs a clock of its own when it is counting down.
		if (marker.challenge) {
			const bar = document.createElement('div');
			guardWidget(bar);
			trackPinMount(
				marker.id,
				mount(TownChallenge, { target: bar, props: { ...marker.challenge } })
			);
			plate.appendChild(bar);
		}

		// (The radio was the last line of this plate, on the one mark the map drew for the place it
		// was open on. What put it here was that the station is already said up there — the map
		// tunes the radio to the show the open place flies (see musicService.follow) and the pin's
		// second line is that show, on a tile in the place's own colour — so the plate carried
		// everything about the radio except what is on and whether it is running.
		//
		// What a pin cannot give it is a place that does not move: a pin stands where its town is,
		// so the radio went wherever the map was panned to and was as small as a mark's caption.
		// It went to the row along the map's bottom edge, which letters the station just as well
		// — that badge is the same crumb out of the same fields (see RegionCurrentBadge) — and it
		// is on the band across the top of the page now, always in the same place at the same size
		// whatever the map is doing, which is what a radio wants. It also cost this
		// function the `guardWidget` it had to hand the play/pause — a control laid over the map
		// rather than mounted into a Leaflet marker is not terrain to begin with.)

		// The side sitting on the region, where there is one: the very statues the roster
		// draws a team with — floor, character, name, place and all — three across, standing
		// at the head of the column with the plate under them. Which pins get one is the
		// caller's to say (today, the picked town alone); every other pin is the plate by
		// itself, which is why the plate is the block that never moves. It is the
		// same component (see TeamLineup), mounted into the pin's DOM because this is
		// imperative code rather than a template, and tracked so the next rebuild can unmount
		// it.
		let statues: HTMLElement | null = null;
		if (marker.team?.length) {
			const frame = document.createElement('div');
			// A fixed 500px for the side together, shared out by the row. Fixed, so the
			// statues come out the same size whichever town is picked, rather than tracking
			// anything about the map or the region under them — up to the width of the screen,
			// which is the one thing 500px cannot ignore: a phone is narrower than that, and the
			// pin is centred on its point, so a side that size hung off both edges of the
			// viewport at once with the outer two statues half in the sea. The cap is in viewport
			// units and not a percentage of the pin, because there is no pin to take a percentage
			// of: a marker's own box is zero-sized (see rebuildMarkers) and everything hung on it
			// overflows that box on purpose, which is what centres it on the point. It is in
			// viewport units rather than behind a breakpoint for the same reason the statues are
			// flex-1 of the row — it says the thing itself, and it is inert on any screen with
			// room for the 500px the side asked for.
			// `relative` because the picked town's booster box stands behind this row, centred on
			// the statue in the middle of it (see below): the side is what the box is dealt out
			// onto, so the row is the box's containing block.
			frame.className = 'relative mt-1 w-[500px] max-w-[100vw] drop-shadow-lg';
			trackPinMount(
				marker.id,
				mount(TeamLineup, {
					target: frame,
					// A town's team is somebody else's side, so it faces the viewer
					// unmirrored, as a rival side does on the board. And a town nobody holds is
					// still on the team its seed rolled, so the row's banner takes the map's grey
					// exactly as this pin's own tile and the polygon under it do — the mark on
					// the terrain and the one in the column beside it say the one thing.
					// `owner` is that same holder, which is what puts their own face at the head
					// of the band — the very face the plate under these statues names them by.
					// A town nobody holds hands over nothing, and the band draws the robot that
					// stands for a side no account is behind (see TeamLineup).
					props: {
						members: marker.team,
						owner: marker.holder ?? null,
						flipped: false,
						seeded: !marker.holder,
						classes: 'gap-1'
					}
				})
			);
			wrap.appendChild(frame);
			statues = frame;
		}

		// And the plate under whatever side there was, naming the place the three of them are
		// standing on. Appended here rather than where it was built, so the order the column is
		// read in is written down in one place.
		wrap.appendChild(plate);

		// What the town is offering, where the booster window has anything for this place and
		// the tier on screen marks towns at all (see boxForMarker) — at whichever of its two
		// sizes this town calls for (see markKindForBox).
		//
		// The DISC is the last block of the column: the side at the head of it is who is holding
		// the place, the plate under them says what the place is and what may be done about it,
		// and the offer waiting there is what the column ends on.
		//
		// The BOX — the picked town's, 200px of cover with a wordmark and a place across its
		// foot — stands BEHIND the side instead, on the middle statue's own centre and up over
		// their heads, and takes no room in the column at all. Which is the same reading the box already carried: what is
		// inside it is cards, and the cards it opens onto are the very statues standing in front
		// of it. Stood in the column it made the one pin the reader had asked to look at the
		// tallest thing on the map, and pushed the plate naming the town half a column away from
		// the town; stood in the canvas's corner it was clear of the map but had to say which
		// town it was about with a line drawn across it. On the side it is on its own town, at
		// its own size, and the column is as tall as it was without it.
		//
		// In the pin, either way, and not hung on the point by the box layer. The layer hangs a
		// mark on a point by its own centre, so a town with both had its plate lying across its
		// disc — two marks about one town, the same size, in the same place, the upper pane
		// deciding which of them a reader ever saw. The box layer keeps the towns this tier gave
		// no pin to (see rebuildBoxes); a town with a pin carries its own mark.
		//
		// A picked town with no side over it — the one case there is nothing to stand the box
		// behind — takes it as a block of the column, which is where it would have stood all
		// along.
		//
		// Its click is the mark's own — the pack behind a box, the town behind a disc (see
		// boxAction) — and not the pin's (the region), so the pin's marker must not see it: the
		// same guard the challenge bar takes, for the same reason.
		const boosterBox = boxForMarker(marker);
		if (boosterBox) {
			const kind = markKindForBox(boosterBox);
			const holder =
				kind === 'disc'
					? discElement(boosterBox, 'pin')
					: boxElement(boosterBox, statues ? 'statues' : 'pin');
			guardWidget(holder);
			const action = boxAction(boosterBox, kind);
			if (action) holder.addEventListener('click', () => action());
			(kind === 'box' && statues ? statues : wrap).appendChild(holder);
		}

		return wrap;
	}

	// The one plate every pin is printed on, and the tile at the left end of it. They live on
	// TownPlate — the same plate drawn as a component, for the places that are named away
	// from the map (the arena's card over the board) — because two copies of a class list are
	// how two marks that are meant to be the same mark come to look like two. A group is
	// printed on the same stock as the pins it stands for (see groupElement), so it reads
	// them too.
	//
	// The margin is the pin's own and is added here: it is the gap between the plate and
	// whatever the column put above it — the side, where there is one, and the point itself
	// where the plate is the whole of the pin. A thing about being a pin and not about being
	// a plate, either way.
	const PIN_PLATE_CLASSES = `mt-1 ${PLATE_CLASSES}`;

	// A mark's line back to the place it is about: its own marker, standing on the point, in
	// the pane that is under every mark on the map (see LEADER_PANE). It belongs to the point
	// and not to the mark — which is what lets a line be drawn under a plate it crosses rather
	// than over it, and is also the truer reading of the thing, a line being about the place
	// the mark has had to leave.
	//
	// Without its geometry: that is the placement pass's to give it once it knows whether the
	// mark had to move at all (see drawLeader), and a mark standing on its own point never
	// draws one. It is anchored at the point and swung out towards the mark, `origin-left`
	// being the point itself.
	//
	// It is the region's own colour, taken from the very class the mark's tile is filled with
	// rather than from a second table of the same six swatches — the line and the tile are the
	// one colour saying the one thing, and a copy is how two of them come to disagree. A mark
	// clear of the selection fades its line with its tile.
	//
	// A strip of a div and not an svg: it is a straight line of one colour, which is a box
	// with a background and a rotation, and a box can be filled with a class while a stroke
	// cannot. Registered under the mark's id, so the placement pass can find it again, and
	// never interactive — it is a sign about a mark, and everything that answers a pointer is
	// in the mark itself.
	function addLeader(
		id: string,
		position: [number, number],
		frameClasses: string | null,
		dimmed: boolean,
		into: L.LayerGroup
	): L.Marker {
		const leader = document.createElement('div');
		leader.className =
			'pointer-events-none absolute left-0 top-0 -mt-px h-0.5 origin-left ' +
			(frameClasses ?? 'bg-base-content') +
			(dimmed ? ' opacity-50' : '');
		leader.setAttribute('aria-hidden', 'true');
		pinLeaders.set(id, leader);
		const icon = Leaf!.divIcon({ html: leader, className: '', iconSize: [0, 0] });
		const layer = Leaf!.marker(position, { icon, interactive: false, pane: LEADER_PANE });
		layer.addTo(into);
		return layer;
	}

	// The mark several pins fold into: one pin, printed exactly as any of them, whose tile
	// carries the number of places it stands for instead of a show's glyph.
	//
	// Styled as an individual pin on purpose, and that is the whole of the idea: a reader who
	// has learnt to read one plate can read this one, and what it says differently is one
	// number in the place where a mark's meaning already sits. It is not a badge stuck on the
	// map or a cluster bubble of another kind — a crowd of towns is still a mark on a place,
	// and the only honest thing it cannot say is which of the towns is which.
	//
	// What it does say is who is under it: the places it covers, named in the line the place's
	// name is always in, truncated by the same plate. And the show, on the line the show is
	// always on, when every place under it flies the same one — where they do not, that line
	// is left off rather than one of them being made to speak for the rest. The colour is
	// carried the same way: the shared one where the group has one, the neutral surface where
	// its members disagree, so a tile never says a colour that half of what it counts does not
	// fly.
	//
	// A click unfolds it (see unfold) rather than opening anything, because the mark stands
	// for several regions and there is no one region a click on it could mean. The hover is
	// every region's at once — that one CAN be said of all of them, and is (see addGroup).
	function groupElement(members: MapMarker[]): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'relative flex cursor-pointer flex-col items-center';

		const frameClasses = groupFrameClasses(members);
		// Faded only when every place under it is outside the open selection: a count with one
		// relevant town in it is a count the reader is being pointed at.
		const dimmed = members.every((member) => member.dimmed);

		const plate = document.createElement('div');
		plate.className = PIN_PLATE_CLASSES;

		const head = document.createElement('div');
		head.className = 'flex items-center gap-2';

		// The count, in the tile the glyph would have been in — the size a mark's meaning is
		// read at on every other pin. Not hidden from a screen reader the way a pin's glyph is:
		// the glyph repeats the show named beside it, while this number is said nowhere else.
		const tile = document.createElement('div');
		tile.className =
			TILE_CLASSES +
			' text-lg font-bold ' +
			(frameClasses ?? 'bg-base-100 text-base-content') +
			(dimmed ? ' opacity-50' : '');
		tile.textContent = String(members.length);
		head.appendChild(tile);

		const lines = document.createElement('div');
		lines.className = 'flex min-w-0 flex-col text-left leading-tight';

		const places = document.createElement('span');
		places.textContent = members.map((member) => member.subtitle ?? member.title).join(', ');
		places.className = 'truncate text-xs font-semibold';
		lines.appendChild(places);

		if (members.every((member) => member.title === members[0].title)) {
			const caption = document.createElement('span');
			caption.textContent = members[0].title;
			caption.className = 'truncate text-xs font-medium text-white/70';
			lines.appendChild(caption);
		}

		head.appendChild(lines);
		plate.appendChild(head);
		wrap.appendChild(plate);
		return wrap;
	}

	/**
	 * The colour a count is printed in: the one its members all fly, or none at all where they
	 * disagree — so a tile never says a colour that half of what it counts does not fly. Asked
	 * twice (the tile, and the line back to the point), which is why it is not asked inline.
	 */
	function groupFrameClasses(members: MapMarker[]): string | null {
		const first = members[0].frameClasses ?? null;
		return members.every((member) => (member.frameClasses ?? null) === first) ? first : null;
	}

	// Open a group: put the map where its places are no longer one mark.
	//
	// A count is a mark saying there is something folded here to go and look at, so a click on
	// it has to be the going and looking — there is no one region it could open, and leaving it
	// inert would take the pins it stands for out of the reader's reach altogether.
	//
	// It steps IN rather than jumping to whatever zoom would separate the places outright: two
	// towns on all but the same point would send the map to its deepest zoom in one press,
	// past every tier between here and there, and a reader who wanted a closer look would have
	// lost where they were. A step or two of zoom towards the group, centred on it, unfolds
	// most groups at once and the rest on a second press.
	function unfold(positions: [number, number][]) {
		if (!mapInstance || !Leaf || !positions.length) return;
		const bounds = Leaf.latLngBounds(positions.map(([lat, lng]) => Leaf!.latLng(lat, lng)));
		const zoom = mapInstance.getZoom();
		const wanted = mapInstance.getBoundsZoom(bounds, false, focusPadding());
		mapInstance.setView(
			bounds.getCenter(),
			Math.min(Math.max(wanted, zoom + 1), zoom + UNFOLD_MAX_STEP, mapInstance.getMaxZoom())
		);
	}

	// The most zoom one press on a count may spend. Two levels quarters the ground the canvas
	// covers, which is enough to pull all but the tightest groups apart, and is short of the
	// gap between two tiers of the hierarchy — so unfolding a group shows the group, rather
	// than dropping the reader into a breakdown they did not ask for.
	const UNFOLD_MAX_STEP = 2;

	// The pin wrapper's classes: a column, made clickable when the marker carries an onClick.
	//
	// Where it stands is not something a class can say. A pin is centred on its point when it
	// has the room to be and moved off it when it has not (see placeMarks), so the offset is
	// measured in pixels, per pin, per view, and applied as an inline transform by that pass.
	// What is left here is the part that never varies, which is how the offset is to be read:
	// the pin's LEFT-MIDDLE is the end of it, so a leader line — on the pins that end up
	// needing one — always leaves the point rightwards and always arrives at the same corner
	// of the mark.
	//
	// `relative` is for that line, which hangs off this box (see markerElement).
	//
	// Which spends the room under the point that the marks hung there (a disc, a box) used
	// to have to themselves. So a town with a pin no longer hangs one: the pin carries its
	// mark as a block of this column (see markerElement), and only the towns this tier left
	// unpinned still take the point directly — by their own centre (see discElement and
	// boxElement).
	//
	// The fade for a pin outside the selected area is NOT here: an
	// opacity on the wrapper groups everything under it, and no child can win its way back
	// to full — which took the plate's lettering down with the tile and left white type at
	// half strength over the terrain it is meant to be read against. It goes on the tile
	// instead (see markerElement), so a pin recedes without becoming unreadable.
	//
	// Nothing here caps the pin's width either, and nothing here can: a pin is as wide as the
	// widest thing it carries, which is not known until it has been drawn — the placement
	// pass measures it and gives the box that width, so the column has an honest left edge
	// for a line to arrive at. Anything a pin hangs that could come out wider than the screen
	// says so in viewport units of its own (the plate's 15rem never can; the side's 500px
	// can, see markerElement).
	function classNamesFor(marker: MapMarker): string {
		let classes = 'relative flex flex-col items-center';
		if (marker.onClick) classes += ' cursor-pointer';
		return classes;
	}

	// Light up (or reset) a region's polygons as the pin standing for it is
	// hovered: apply each hoverable overlay's hoverStyle to the covered features,
	// exactly as their own mouseover does, so the whole region's fill shows.
	function highlightRegion(featureIds: string[] | undefined, on: boolean) {
		if (!featureIds?.length) return;
		for (const entry of hoverLayers) {
			for (const id of featureIds) {
				const layer = entry.byId.get(id);
				if (!layer) continue;
				if (on) layer.setStyle(entry.hoverStyle);
				else entry.group.resetStyle(layer);
			}
		}
	}

	// The available pin renderings, coarsest → finest. `markerLevels` (a stack of
	// breakdowns) wins; a plain `markers` array is treated as a single level.
	function markerLevelStack(): MapMarker[][] {
		if (markerLevels && markerLevels.length) return markerLevels;
		return markers.length ? [markers] : [];
	}

	// A pixel of slack on that comparison. The framing computes its zoom from this very
	// margin, so a region framed by it lands exactly on the boundary and is decided by the
	// last bit of a float — and the whole point of measuring both against one margin is that
	// a framed region is never the one that comes out too big by a rounding error.
	const FIT_TOLERANCE = 1;

	// Whether a region's box stands whole inside the canvas at a given zoom, margin and all —
	// the same question the framing answers by choosing a zoom (see focusMargin), asked here
	// of the zoom the map is at. This is the map's half of the level-of-detail rule: the
	// projection and the canvas are Leaflet's, and the rule itself (which tier that makes the
	// one to draw) is in @3xl/shared, knowing nothing of either.
	function boundsFitAtZoom(
		bounds: [[number, number], [number, number]],
		zoom: number
	): boolean {
		if (!mapInstance) return true;
		const [[south, west], [north, east]] = bounds;
		const topLeft = mapInstance.project([north, west], zoom);
		const bottomRight = mapInstance.project([south, east], zoom);
		const size = mapInstance.getSize();
		const margin = focusMargin();
		return (
			Math.abs(bottomRight.x - topLeft.x) <= size.x - 2 * margin.x + FIT_TOLERANCE &&
			Math.abs(bottomRight.y - topLeft.y) <= size.y - 2 * margin.y + FIT_TOLERANCE
		);
	}

	// The index of the tier to draw: the children of the coarsest region that stands whole in
	// the canvas (see levelIndexForView). That is what makes a click on a pin of any tier land
	// on that pin's subdivisions — the click frames its region whole, framed whole is what
	// "fits" means here, and what fits has its children pinned. Before, the tier drawn was the
	// fitting region's OWN, so opening a comarca framed it and marked it with the very pin
	// that had just been clicked, and its towns only appeared once the reader zoomed past the
	// comarca by hand.
	function levelForView(levels: MapMarker[][], centre: L.LatLng): number {
		const zoom = mapInstance!.getZoom();
		return levelIndexForView(levels, [centre.lat, centre.lng], (bounds) =>
			boundsFitAtZoom(bounds, zoom)
		);
	}

	// (Re)build the pins for the current view: clear the layer, pick the level of
	// detail whose regions are viewport-sized, keep only its markers inside the
	// (slightly padded) viewport, and drop a zero-sized divIcon marker at each (its
	// overflowing content is the visible card) with a hover tooltip and click.
	// Runs on every markers change and whenever the map pans or zooms, so both the
	// culling and the chosen level track what's actually on screen.
	function rebuildMarkers() {
		if (!mapInstance || !Leaf) return;
		// Not while the map is between two tiers (see clearMarkers). The pins are taken off at
		// the start of a zoom, and everything that would put a set back before the map has
		// stopped is refused here rather than at each of the several places that ask — the
		// moveend that ends the zoom is what lifts this, one line before it asks for the set the
		// new view calls for.
		if (midZoom) return;
		if (!markerLayer) markerLayer = Leaf.layerGroup().addTo(mapInstance);
		unmountPinMounts();
		markerLayer.clearLayers();

		// Exactly what is on screen, with no ring of slack around it. A pin used to be allowed
		// a quarter of a viewport's grace, because a mark standing on a point just off the edge
		// still had half a plate showing and dropping it left a visible gap. It cannot have it
		// any more: a pin is now pulled inside the canvas rather than allowed to hang off it
		// (see placeMarks), so a point beyond the edge would be given a mark within it — a town
		// nobody is looking at, standing in the room of one they are, with a leader line
		// running off the screen to say where it really is. What is not in view is not marked,
		// and the pins that ARE in view get the room that saves.
		const bounds = mapInstance.getBounds();
		const levels = markerLevelStack();
		const index = levels.length ? levelForView(levels, mapInstance.getCenter()) : 0;
		// Publish the chosen tier so the parent can mirror it (polygons, sidebar).
		activeLevel = index;
		// Tell the box layer where the pins have got to, so it can mark its towns to match.
		pinLevelIndex = index;
		pinLevelCount = levels.length;
		const chosen = levels[index] ?? [];

		// Remap every municipality of the chosen tier to its region's featureIds (from
		// all of the tier's pins, not just the culled-in ones), so a polygon hover can
		// light the same whole region its pin does — wherever in the region you point.
		regionByFeatureId = new Map();
		for (const marker of chosen) {
			for (const id of marker.featureIds ?? []) regionByFeatureId.set(id, marker.featureIds!);
		}

		// The order everything after this reads the pins in, and it is one order for one
		// reason: the picked town comes first. It is the pin carrying the side holding it,
		// its siege and the way to fight them — several hundred pixels of mark the reader
		// asked for by name — so it is never folded into a count of towns (see foldPins) and
		// never shuffled aside for a plate naming a village (see placeMarks). Everything after
		// it keeps the order the tier was built in, so the same view always settles the same
		// way rather than wandering between rebuilds.
		// A pin the page has asked to be left off is left off here and nowhere earlier (see
		// MapMarker.hidden): the tier it belongs to is still the tier, still measured for where
		// the view is and still the set a polygon hover lights its region from — it simply has
		// no mark drawn for it.
		const visible = chosen
			.filter((marker) => !marker.hidden && bounds.contains(marker.position))
			.sort((a, b) => (b.team?.length ? 1 : 0) - (a.team?.length ? 1 : 0));

		pinExtents = new Map();
		pinLeaders = new Map();
		foldedIds = new Set();

		// No pin outlives its tier: a pin of the stack is the map's naming of a region at the
		// breakdown it is drawing, so zooming out folds a town into its comarca and takes
		// everything hung on it away together.
		const drawn = visible.map((marker) => addPin(marker));

		// And then the one mark that does outlive it (see `pickedMarker`), unless this tier has
		// already drawn the very region it is about — the picked town at the town tier is one
		// pin, not two on one point. Ranked as the reader's own pick, which is what buys it the
		// first of the room and keeps it out of every count.
		if (
			pickedMarker &&
			!drawn.some((mark) => mark.id === pickedMarker!.id) &&
			bounds.contains(pickedMarker.position)
		) {
			drawn.push(addPin(pickedMarker, RANK_PICKED));
		}

		// Every pin is drawn and measured before any of them is folded, because how much room
		// a pin takes is not a thing the data behind it can be asked: a plate is as wide as
		// the place's name up to its cap, and a picked town's column is as tall as three
		// statues, a siege bar and a booster box happened to come out. Which two pins are one
		// pin is a question about those boxes, so the boxes have to exist first — the crop is
		// put on the map, read, and then the marks that will not fit beside one another are
		// taken off again and replaced by the one mark that stands for them.
		pinMarks = foldPins(drawn, measurePins(drawn));

		// Not placed here. Where these may stand depends on the booster marks as much as on one
		// another, and those are built by the pass that runs immediately after this one — so the
		// room is dealt once, to both families together, by the last of the two (see placeMarks
		// and rebuildBoxes).
	}

	/**
	 * One mark on the pin layer: the region it is about (null once it is a count standing for
	 * several), where it stands, and the two handles the passes after it need — the DOM to
	 * move, and the Leaflet marker to take off the map again if it turns out to be part of a
	 * group.
	 */
	type PinMark = {
		id: string;
		marker: MapMarker | null;
		position: [number, number];
		element: HTMLElement;
		layer: L.Marker;
		/** Its line back to the point, standing in the pane under every mark (see addLeader). */
		leader: L.Marker;
		/** Its claim on the room there is: the lower the rank, the earlier it picks. */
		rank: number;
	};

	// What a mark's claim on the canvas is worth, and there are only three kinds of claim.
	// The reader's own pick comes first — the town they opened, whether it is standing as a
	// pin with its side on it or as the booster box the coarser tiers draw it as — since it is
	// the one mark on screen that was asked for by name. Then the pins, which are the map's
	// naming of the places under them. Then the booster marks, which are what a place has on
	// offer: a smaller mark, about something the place is carrying rather than about the place,
	// and so the one to give way when a disc and a plate want the same corner.
	const RANK_PICKED = 0;
	const RANK_PIN = 1;
	const RANK_BOX = 2;

	/**
	 * Draw one region's pin on the map, as its own mark.
	 *
	 * Its claim on the room is read off the mark itself — a pin carrying the side standing on
	 * its region is the picked one — except where the caller has already answered that by
	 * handing the mark over as the picked one (see `pickedMarker`), which it now may do for a
	 * plate carrying nothing at all.
	 */
	function addPin(marker: MapMarker, rank = marker.team?.length ? RANK_PICKED : RANK_PIN): PinMark {
		const element = markerElement(marker);
		const icon = Leaf!.divIcon({ html: element, className: '', iconSize: [0, 0] });
		const layer = Leaf!.marker(marker.position, { icon, riseOnHover: true });
		if (marker.onClick) layer.on('click', () => marker.onClick!());
		// Hovering the pin highlights its whole region's fill, just like hovering
		// the polygons; leaving it resets them to their base style.
		layer.on('mouseover', () => highlightRegion(marker.featureIds, true));
		layer.on('mouseout', () => highlightRegion(marker.featureIds, false));
		layer.addTo(markerLayer!);
		return {
			id: marker.id,
			marker,
			position: marker.position,
			element,
			layer,
			leader: addLeader(
				marker.id,
				marker.position,
				marker.frameClasses ?? null,
				!!marker.dimmed,
				markerLayer!
			),
			rank
		};
	}

	/**
	 * Draw one count in place of the pins it stands for: the same plate every other pin is
	 * printed on, at the middle of their points, hovering the whole of what it covers and
	 * unfolding it on a click (see groupElement).
	 */
	function addGroup(members: MapMarker[], position: [number, number]): PinMark {
		const id = `group:${members[0].id}`;
		const element = groupElement(members);
		const icon = Leaf!.divIcon({ html: element, className: '', iconSize: [0, 0] });
		const layer = Leaf!.marker(position, { icon, riseOnHover: true });
		layer.on('click', () => unfold(members.map((member) => member.position)));
		// A group lights every region under it, exactly as each of its pins lit its own: the
		// mark is about all of them, so pointing at it says so on the terrain too.
		const featureIds = members.flatMap((member) => member.featureIds ?? []);
		layer.on('mouseover', () => highlightRegion(featureIds, true));
		layer.on('mouseout', () => highlightRegion(featureIds, false));
		layer.addTo(markerLayer!);
		return {
			id,
			marker: null,
			position,
			element,
			layer,
			leader: addLeader(
				id,
				position,
				groupFrameClasses(members),
				members.every((member) => member.dimmed),
				markerLayer!
			),
			rank: RANK_PIN
		};
	}

	// What each mark came out as, in pixels, read back off the DOM once it is standing.
	//
	// Measured in one pass and not inside the loop that built them: asking an element for its
	// offsetWidth makes the browser settle the layout it is holding, so a read per pin as it
	// is added settles the whole crop once per pin. `offsetWidth`/`offsetHeight` are the
	// untransformed box, which is what is wanted — a pin is moved off its point by a transform
	// (see placeMarks) and its size is not what that transform changes.
	//
	// The height is the wrapper's, the width is its widest block's. The wrapper stands in a
	// marker box of no size at all (`iconSize: [0, 0]`, which is what lets a pin be placed
	// against a point rather than filling anything), so its own width resolves to that
	// nothing and every block in it overflows on purpose — the column measures 0 across
	// while carrying 500px of statues. Its height is honest, being the content's own. So
	// the width is read off the blocks that actually draw.
	function measurePins(marks: readonly PinMark[]): Map<string, L.Point> {
		const extents = new Map<string, L.Point>();
		for (const mark of marks) {
			let width = mark.element.offsetWidth;
			for (const block of mark.element.children) {
				width = Math.max(width, (block as HTMLElement).offsetWidth);
			}
			extents.set(mark.id, Leaf!.point(width, mark.element.offsetHeight));
		}
		return extents;
	}

	// Fold the pins that cannot all be drawn into the one pin that stands for them.
	//
	// A comarca of villages is more plates than the canvas has room for, and the map used to
	// answer that by moving every one of them off its point until it had room, with a line
	// drawn back to say which point it was still about. That kept every town named, at the
	// price of the map: a screen of plates joined to the terrain by lines, in which nothing
	// could be seen but the marks. So the crowding is answered first by drawing FEWER marks —
	// the pins that would have stood on one another become a single pin, printed exactly as
	// one of them and saying how many places it is about (see groupElement) — and only what
	// folding cannot help is moved aside afterwards.
	//
	// Which marks may be folded together is a question about their KIND, and that is why this
	// runs over the region pins alone: the booster marks hung on towns are their own family
	// and are folded among themselves (see rebuildBoxes), because a mark saying "4" that
	// turned out to mean two towns and two boxes is a count of nothing. The picked town is a
	// kind of one — it is offered ungroupable, so it neither joins a count nor swallows its
	// neighbours, which are left to be moved off it in the old way.
	function foldPins(drawn: readonly PinMark[], extents: Map<string, L.Point>): PinMark[] {
		const byId = new Map(drawn.map((mark) => [mark.id, mark]));
		const groups = groupPins(
			drawn.map((mark) => {
				const at = mapInstance!.latLngToContainerPoint(mark.position);
				const extent = extents.get(mark.id);
				return {
					id: mark.id,
					x: at.x,
					y: at.y,
					width: extent ? extent.x : PIN_PLATE_EXTENT[0],
					height: extent ? extent.y : PIN_PLATE_EXTENT[1],
					// Read off the claim the mark was given rather than off what it is carrying:
					// the picked mark is the picked mark whether the caller said so by standing a
					// side on it or by naming it (see addPin).
					groupable: mark.rank !== RANK_PICKED
				};
			}),
			{ gap: PIN_GAP }
		);

		const marks: PinMark[] = [];
		for (const group of groups) {
			if (group.ids.length === 1) {
				marks.push(byId.get(group.ids[0])!);
				continue;
			}
			// The members come off the map, clock and all, and the count goes on in their
			// place — at the middle of the points it stands for, which is where the group
			// worked out that one mark of that size would fit.
			for (const id of group.ids) {
				const mark = byId.get(id)!;
				markerLayer!.removeLayer(mark.layer);
				markerLayer!.removeLayer(mark.leader);
				unmountPin(id);
				pinLeaders.delete(id);
				foldedIds.add(id);
			}
			const at = mapInstance!.containerPointToLatLng(Leaf!.point(group.x, group.y));
			const members = group.ids.map((id) => byId.get(id)!.marker!);
			marks.push(addGroup(members, [at.lat, at.lng]));
		}
		return marks;
	}

	// Stand every mark on its point, and move the few that cannot be left there.
	//
	// EVERY mark, of both families, in one pass — that is the whole reason this is its own
	// function rather than the tail of the pin rebuild. Folding answers the crowding within a
	// family (see foldPins and foldBoxes) and cannot answer it between two: a booster disc and
	// a region's plate are different kinds of mark and a count that mixed them would be a count
	// of nothing, so if they were also dealt their room separately there would be nothing at
	// all keeping a disc from lying under a plate. Laid out together, a mark of either family
	// sees a mark of the other exactly as it sees one of its own: room already taken.
	//
	// What arrives here mostly has the room it needs, folding having already taken the heaps
	// out, and a mark with room stands centred on the place it is about with nothing to
	// explain. What is left over — a disc under a plate, the picked town's column, which is
	// never folded and is too big to share a point with anything — is moved off its point
	// until it has room, with a line back to say which point it is still about.
	//
	// Which way a mark is moved is the layout's to answer (see pin-layout) and it is answered
	// the same way for every mark, because a reader who has worked out one leader line has to
	// have worked out all of them. This pass only supplies what the layout cannot know
	// without a DOM: where each point falls in the container right now, how big each mark came
	// out, and how much canvas there is to move about in.
	//
	// The order marks are offered in is the order they get their pick of the room: by rank
	// first (see RANK_PICKED), and within a rank the order they were built in, which is the
	// order their tier was built in — so the same view always settles the same way rather than
	// wandering between rebuilds.
	function placeMarks() {
		if (!mapInstance || !Leaf) return;
		const size = mapInstance.getSize();
		// Stable, so a rank is a tie-break and never a reshuffle of what is inside it.
		const marks = [...pinMarks, ...boxMarks].sort((a, b) => a.rank - b.rank);

		// This is the reading the rest of the map works from too: the framing puts these boxes
		// whole on the canvas (see viewForBounds).
		pinExtents = measurePins(marks);

		const anchors: PinAnchor[] = [];
		for (const mark of marks) {
			const extent = pinExtents.get(mark.id);
			if (!extent) continue;
			const at = mapInstance.latLngToContainerPoint(mark.position);
			anchors.push({ id: mark.id, x: at.x, y: at.y, width: extent.x, height: extent.y });
		}

		const offsets = layoutPins(
			anchors,
			{ width: size.x, height: size.y },
			// The canvas is the whole container, but the room is not: the bar naming where the
			// map is looking lies across the top of it, and a pin tucked under that bar is a
			// pin the map has kept on screen and out of sight (see chromeInsets). Nothing else
			// is spoken for — the picked town's booster box is inside that town's own pin now
			// (see markerElement), so it is dealt its room as part of the mark it stands on
			// rather than as a rectangle the layout has to be told about.
			{ lead: PIN_LEAD, gap: PIN_GAP, insets: chromeInsets }
		);

		for (const mark of marks) {
			const extent = pinExtents.get(mark.id);
			const offset = offsets.get(mark.id);
			if (!extent || !offset) continue;
			// The measured width, given back to the box it was measured off. Until now the
			// column has been a box of no width with everything in it overflowing equally to
			// both sides; a mark placed by an offset needs a real left edge, both to be moved
			// by an honest amount and to be the thing a leader line arrives at.
			mark.element.style.width = `${extent.x}px`;
			// The offset is to the mark's left-MIDDLE, so the box is dropped by half its own
			// height after being moved — one transform, since two translations compose
			// whichever way round they are read.
			mark.element.style.transform = `translate(${offset.dx}px, ${offset.dy}px) translateY(-50%)`;
			drawLeader(mark.id, offset);
		}
	}

	// One mark's line, as a length and an angle: the strip is anchored at the POINT (see
	// addLeader) and swung out onto the mark's left-middle, which is the offset read straight.
	//
	// A mark that never left its point draws no line at all. There is nothing for one to say —
	// the mark is standing on the place it names — and a stub drawn under every plate on the
	// map would be a mark of its own, saying "moved" where nothing has moved. So the line is
	// exactly the sign that a mark is beside its place rather than on it, which is the only
	// thing it was ever for.
	//
	// Nor does a mark whose line could not be run to it without crossing another mark — the
	// layout says so, having looked for room the line could reach (see PinOffset.leader). A
	// strip passing beneath two plates on its way is read as a line between those plates, not
	// as one pointing past them at a place, and the commonest case of it is the worst: a mark
	// pushed aside by the very plate covering its point, whose line would appear from under
	// that plate saying the plate is where it came from.
	function drawLeader(id: string, offset: PinOffset) {
		const leader = pinLeaders.get(id);
		if (!leader) return;
		const length = offset.leader ? Math.hypot(offset.dx, offset.dy) : 0;
		leader.style.width = `${length}px`;
		leader.style.transform = `rotate(${(Math.atan2(offset.dy, offset.dx) * 180) / Math.PI}deg)`;
	}

	// The pins come off the map before it starts to zoom, and are built again where it stops.
	//
	// A pin is not drawn in the projection: it is a plate of a fixed size in pixels, standing
	// on a point, and everything about it that says which tier the map is showing was decided
	// at the zoom it was built at — which of them are on screen, and which breakdown they are
	// the pins of. So a zoom in progress carries a set of pins that belongs to the zoom it left
	// rather than the one it is going to: they slide across the view at a size that no longer
	// means anything, and the ones that ought to have folded into a coarser mark are still
	// standing when the map arrives. Taking them off is the honest reading of that — the map is
	// between two tiers and there is no set of pins for it — and the moveend at the far end
	// builds the set the new view actually calls for (see rebuildMarkers).
	//
	// Which is also why this raises a flag and does not merely empty the layer: the pins are
	// built from a prop, by an effect, and taking them off is a thing done to the map rather
	// than to that prop — so the next flush of anything at all put the whole set straight back,
	// in the same frame, and the layer was full again before it had been seen empty (measured:
	// 28 marks removed and 28 added in one batch). The flag says what the empty layer means,
	// and rebuildMarkers reads it.
	function clearMarkers() {
		midZoom = true;
		// The picked town's box goes with them, being one more thing standing in that town's
		// pin (see markerElement) — which is the right reading of it: while the map is between
		// two tiers there is no telling whether the tier it lands on still marks that town at
		// all. It comes back with the pins.
		// Forgotten as well as taken off, because the booster marks are laid out against these
		// (see placeMarks) and a set of pins that is no longer on the map is room nothing is
		// standing in. A rebuild of the boxes arriving mid-zoom then deals itself the whole
		// canvas, which is the truth of it while there are no pins.
		pinMarks = [];
		if (!markerLayer) return;
		unmountPinMounts();
		markerLayer.clearLayers();
	}

	/** Tear down everything mounted into every pin, so no detached timer keeps running. */
	function unmountPinMounts() {
		for (const id of [...pinMounts.keys()]) unmountPin(id);
		pinMounts = new Map();
	}

	/** The same for one pin alone — the pin that has just been folded into a group. */
	function unmountPin(id: string) {
		for (const mounted of pinMounts.get(id) ?? []) void unmount(mounted);
		pinMounts.delete(id);
	}

	/** Remember a component mounted into a pin's DOM, so that pin can take it down again. */
	function trackPinMount(id: string, mounted: Record<string, unknown>) {
		const bucket = pinMounts.get(id);
		if (bucket) bucket.push(mounted);
		else pinMounts.set(id, [mounted]);
	}

	/** The same, for the boxes: a box no longer on screen must not keep its images. */
	function unmountBoxMounts() {
		for (const mounted of boxMounts) void unmount(mounted);
		boxMounts = [];
	}

	// A festa box's DOM: the very component the Booster tab's grid draws its packs
	// with, mounted into the marker rather than re-drawn here — a town's box on the map
	// and its box in the panel are the same object, so they are the same component
	// printed on the same stock off the same cover, mark and place. Mounted (this is
	// imperative code, not a template) and tracked, so the next rebuild can take down
	// the ones that panned off screen.
	//
	// The width is fixed at 200px and the box's own 30:37 gives the height: it is a mark
	// on a town, so it stays the size it is whatever the map is showing, and it is the
	// cover a box is read by, at a size the cover can actually be read at.
	//
	// Where it is drawn decides how it is placed and who takes it down again, which is the
	// whole of what `into` says:
	//
	// - `'pin'` — inside the town's own pin, one more thing in a column, so it needs only the
	//   gap the pin's other parts take. The pin is what built it, so the pin's mounts are
	//   what unmount it. The picked town asks for this only where it has no side for the box
	//   to stand on (see markerElement).
	// - `'statues'` — behind the side standing in that same pin: on the middle statue's centre
	//   and standing two thirds of its own height above their heads, out of the column's flow
	//   altogether, so the pin comes out exactly as tall as it would without it. Which also
	//   means the part above the heads is room the map's placement cannot see — it measures
	//   the pin's own box (see measurePins) and this is outside it. Also the pin's to unmount,
	//   being inside it.
	// - `'point'` — the box layer's own marker, standing on the point: a mark is about the
	//   ground under it, and 200px of cover reads as being about the town it is centred on
	//   rather than the one it hangs off. It is also what keeps the box and the disc one
	//   object seen at two sizes — both take the point the same way, so folding a box up
	//   leaves the mark where the box was rather than moving it. Where exactly it ends up is
	//   the placement's to say and not this function's: it is dealt its room with the pins,
	//   so a mark with room stands centred on its point and one without is moved off it (see
	//   pointMark and placeMarks). This is what the picked town's box does at a tier that gave
	//   it no pin to stand in — see rebuildBoxes.
	function boxElement(box: MapBoosterBox, into: 'pin' | 'point' | 'statues'): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className =
			'w-[200px] ' +
			(into === 'pin'
				? 'mt-1'
				: into === 'statues'
					? // Across: its own middle on the MIDDLE STATUE's, which is not the middle of the
						// row. The three cells come to 110% of it and the middle pulls 7.5% back over
						// each of its neighbours, so that cell's centre is 35% + 20% - 7.5% = 47.5%
						// along, plus the one gap the row was given before it (`gap-1`, see
						// markerElement). The row's own remainder falls at its far end (see
						// LINEUP_ROW_SPAN), which is why centring on the frame would have stood this a
						// few pixels to the right of the statue it is meant to be behind.
						//
						// Up: two thirds of its own height above the statues' heads, which is what
						// makes it a box they are standing in front of rather than one they are
						// covering. It is anchored at the TOP of the row and moved by a share of
						// itself, so what shows above the heads is the same amount of box whatever
						// the row comes out at — the cards' captions run to one line or two, and a
						// box hung off the row's middle would rise and fall with them. A third of it
						// is left behind the three of them, which is enough overlap to read as one
						// arrangement.
						//
						// BEHIND the row, not over it: the side is what the reader is looking at and
						// the box is what it came out of, so the statues stand in front of their own
						// packaging. Negative, because a positioned box paints above in-flow content
						// — and it is contained by the row's own stacking context (a `drop-shadow` is
						// a filter, and a filter makes one), so it goes behind the statues and
						// nothing else.
						//
						// No shadow of its own either: that same filter casts one over everything
						// inside the row, this included, and two of the same shadow is one drawn
						// twice.
						'absolute left-[calc(47.5%_+_0.25rem)] top-0 -z-10 -translate-x-1/2 -translate-y-2/3'
					: // On a point: placed by the pass that deals every mark its room (see
						// pointMark and placeMarks), so it says nothing here about where it stands.
						'');
		// A box this reader has already opened is left on its town, faded: a town deals two
		// boxes a year and neither twice, so what is drawn here is an offer that was taken
		// rather than one that is waiting. It still answers a click — the sheet it raises is
		// where a spent box says so in words.
		if (box.claimed) wrap.className += ' opacity-40';
		if (box.onClick) wrap.className += ' cursor-pointer';
		const mounted = mount(BoosterBox, {
			target: wrap,
			props: {
				coverUrl: box.coverUrl ?? null,
				logoUrl: box.logoUrl ?? null,
				showId: box.showId ?? null,
				locationName: box.locationName ?? null,
				light: box.light ?? false
			}
		});
		// A box drawn in a pin — in its column or over its side, both being the pin's own DOM —
		// belongs to that pin's town, which is the pin's own id (see boxForMarker), so it is
		// that pin's mount to take down.
		if (into === 'pin' || into === 'statues') trackPinMount(box.id, mounted);
		else boxMounts.push(mounted);
		return wrap;
	}

	// The mark this pin's town has waiting, or null — which asks two things: that the tier
	// on screen marks towns at all, and that the marker's id is a municipality's (only the
	// town tier's keys are, so no coarser pin can match a box). Which of the two marks it
	// comes out as is markKindForBox's to say, not this one's: a pin carries whatever its
	// town has, whole or folded, and it used to take only the picked town's box because
	// there was somewhere else for a disc to go. There is not — the point under the pin is
	// the pin's own middle now (see markerElement).
	function boxForMarker(marker: MapMarker): MapBoosterBox | null {
		// A box the caller hung on the pin itself is this pin's, and asked of nothing else:
		// naming it was the decision, so there is no tier to qualify and no list to search.
		if (marker.box) return marker.box;
		if (!marksTowns()) return null;
		return boxes.find((entry) => entry.id === marker.id) ?? null;
	}

	// The ids the tier on screen draws a pin for. The picked town's pin carries its own box,
	// so the box layer must not stand a second one on the same point — which is all this
	// is for (see rebuildBoxes). Read off the same stack rebuildMarkers picked from, at the
	// level it settled on.
	//
	// Less the pins that were folded into a count on this rebuild (see foldPins): a town whose
	// pin has gone into a group has no pin left to carry its mark, and the group's plate counts
	// places and says nothing about packs. So the box layer takes those towns back — where they
	// crowd, they fold into a count of their own, which is the same reading at the same size as
	// the pins' (see foldBoxes).
	//
	// And less the pins the page asked to be left off the map (see MapMarker.hidden), for the
	// very same reason: a town that was never drawn has no column for its mark to be a block
	// of, so the box layer stands it on the point instead.
	// Plus the mark that stands at every tier (see `pickedMarker`), which is a pin on the map
	// like any other and carries its own box wherever the zoom is — and is never folded, so it
	// is never taken back off this set.
	function pinnedIds(): Set<string> {
		const levels = markerLevelStack();
		const ids = new Set(
			(levels[pinLevelIndex] ?? []).filter((marker) => !marker.hidden).map((marker) => marker.id)
		);
		for (const id of foldedIds) ids.delete(id);
		if (pickedMarker) ids.add(pickedMarker.id);
		return ids;
	}

	// The same town unpicked: a disc of the box's own stock — white card for a town de festa
	// today, black for the rest of the window — with the show's glyph printed on it in the
	// ink that stock is read in. Hung on the same point, by the same centre, so folding a box
	// up leaves the mark where the box was.
	//
	// It is the box reduced to the two things that are read at a glance: what it is printed
	// on and what show is inside it. That is what every town on screen gets, because the map
	// carries the whole booster window at once — a cover, a wordmark and a place across the
	// foot, per town, is reading matter overlapping its neighbours', which is less than one
	// mark that can be told apart. So the mark is what gets the room the box's picture and
	// its two lines of type had: the glyph is 36px and the disc 56px round it, nine
	// fourteenths of the diameter, which still leaves a square mark's corners inside the
	// circle (a side of 36 spans 51 across its diagonal). Well inside the box's own 200px:
	// the disc is not a badge stuck on the map, it is the same object with one mark on it
	// instead of four, drawn small enough that neighbouring towns in one comarca are still
	// separate marks — and picking the town is what unfolds it back into the box.
	//
	// And it is a disc, laid flat with no tilt: the box's lid is a square seen in
	// perspective because it is the top of a solid, and there is no solid here to be the
	// top of. A circle has no direction to be turned in, which is what makes it the shape
	// that survives losing the box's body.
	//
	// The glyph is inlined rather than pointed at with an <img> so it paints in the disc's
	// own ink (see inlineIconMarkup), and it is the same mark the box's lid stamps itself
	// with — handed over drawn, since it is authored data the page holds and the map does
	// not. A show with no glyph picked for it leaves the disc bare rather than
	// taking a stand-in mark — the lid's rule, and every other surface that badges a show.
	// Decorative either way: the mark is what is being looked at, and nothing here is
	// named in text for it to read twice.
	//
	// Where it is drawn places it, exactly as it does the box (see boxElement), and for the
	// same reason — the two are one mark at two sizes and are placed by one rule:
	//
	// - `'pin'` — the last block of the town's own pin, under the plate naming the place,
	//   needing only the gap the pin's other parts take. This is every festa town the tier gives a
	//   pin to, which is most of them: the disc used to be hung on the point instead, back
	//   when a pin grew upwards and left that room free. It no longer does (see
	//   classNamesFor), and a 56px disc centred on the same point as a 56px plate is one
	//   mark hidden behind another rather than two marks about one town.
	// - `'point'` — the box layer's own marker, standing on the point, for the towns this tier
	//   drew no pin for at all — moved off it only where a pin or another mark is already
	//   standing there (see pointMark and placeMarks).
	function discElement(box: MapBoosterBox, into: 'pin' | 'point'): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className =
			'flex size-14 items-center justify-center rounded-full shadow-md [&>svg]:size-9 ' +
			// In a pin it is one more block of the column; on a point it is placed by the pass
			// that deals every mark its room (see pointMark and placeMarks).
			(into === 'pin' ? 'mt-1 flex-none ' : '') +
			// Faded when the reader has already opened this town's box, exactly as the box
			// itself is: the disc is that box with one mark on it instead of four, and a spent
			// box is spent at both sizes.
			(box.claimed ? 'opacity-40 ' : '') +
			(box.light ? 'bg-white text-black' : 'bg-black text-white');
		if (boxAction(box, 'disc')) wrap.className += ' cursor-pointer';
		wrap.setAttribute('aria-hidden', 'true');
		// The show's mark arrives drawn, as a pin's does: it is authored data now, so the
		// page that built this box is the side that has it.
		if (box.iconSvg) wrap.innerHTML = box.iconSvg;
		return wrap;
	}

	// What a click on this mark does, which is not the same question at both sizes: the box
	// is a cover and answers for the pack behind it, the disc is a town the reader has not
	// picked, so it answers for the town — and picking it is what draws its box, so the
	// smaller mark leads to the bigger one. A caller that names only `onClick` gets it at
	// both sizes.
	function boxAction(box: MapBoosterBox, kind: 'box' | 'disc'): (() => void) | null {
		if (kind === 'disc') return (box.onDiscClick ?? box.onClick) ?? null;
		return box.onClick ?? null;
	}

	// Whether the tier on screen marks towns at all. Every tier does but the coarsest — the
	// whole of the Països Catalans in one view, half a dozen territory pins for thousands of
	// towns — where there is no reading a town off a mark: the festa towns of a whole
	// territory land in one handful of pixels, so the marks merge into a blot over the
	// country that says only that somewhere in there are festes, which the map already says
	// with its pins. The window's towns are for finding once the reader has picked a corner
	// to look in.
	//
	// A stack with nothing to fold (no levels at all, or a single rendering) is at its finest
	// tier by definition and marks its towns — that test is made first for exactly that
	// reason, since level 0 is then both ends of the stack at once.
	function marksTowns(): boolean {
		if (pinLevelIndex >= pinLevelCount - 1) return true;
		return pinLevelIndex !== 0;
	}

	// How a town is marked, which the zoom no longer decides: the town the reader picked is
	// the box itself, and every other town on screen is the disc. Which is what keeps the map
	// readable at the tier where every town has a pin — a cover on each of them buried the
	// terrain — while the one town being looked at still shows what it is offering, whole,
	// exactly as it did.
	function markKindForBox(box: MapBoosterBox): 'box' | 'disc' {
		return box.selected ? 'box' : 'disc';
	}

	// (Re)build the festa boxes for the current view: unmount the last crop, clear the layer,
	// and — unless the tier on screen marks no towns at all — keep only the boxes inside the
	// viewport, fold the ones that would have stood on one another, and drop a zero-sized
	// divIcon at each, carrying whichever mark that town calls for. Runs on every boxes change
	// and whenever the map pans or zooms, so the culling, the mark and the picked town all
	// track what's on screen.
	//
	// It is also the pass that deals BOTH families their room, being the second of the two to
	// run: the pins are built and folded first and left standing where they asked to be, and
	// the placement at the end of this sees every mark on the map at once (see placeMarks).
	function rebuildBoxes() {
		if (!mapInstance || !Leaf) return;
		if (!boxLayer) boxLayer = Leaf.layerGroup().addTo(mapInstance);
		unmountBoxMounts();
		boxLayer.clearLayers();
		boxMarks = [];

		// A tier that marks no towns still deals the pins their room: this pass is the last of
		// the two and the placement is its to run either way (see placeMarks).
		if (!marksTowns()) {
			placeMarks();
			return;
		}

		// A town with a pin carries its own mark inside it, whichever of the two it is (see
		// markerElement), so the layer must not put a second one on the same point — which
		// with both centred on that point is not a mark beside a mark but one on top of the
		// other. So this draws the towns the tier left unpinned, and only those: at the town
		// tier that is none of them, and above it, the picked town whose box has no pin to
		// stand in.
		const pinned = pinnedIds();

		// Exactly what is on screen, with no ring of slack around it — the same cull the pins
		// take, and now for the same reason: a booster mark is dealt its room by the placement
		// too (see placeMarks), which pulls a mark inside the canvas rather than letting it hang
		// off the edge. A point beyond the edge would be given a mark within it, standing in the
		// room of a town the reader IS looking at.
		const bounds = mapInstance.getBounds();
		// The picked town first, for the reason its pin goes first: its mark is the box itself,
		// 200px of cover the reader asked for by name, and it is not folded into a count of
		// discs (see foldBoxes).
		const drawable = boxes
			.filter((box) => !pinned.has(box.id) && bounds.contains(box.position))
			.sort(
				(a, b) => (markKindForBox(b) === 'box' ? 1 : 0) - (markKindForBox(a) === 'box' ? 1 : 0)
			);

		for (const group of foldBoxes(drawable)) {
			const [box] = group;
			const kind = markKindForBox(box);
			const folded = group.length > 1;
			// Namespaced, because a town's disc and that town's pin would otherwise be one id
			// in the placement's book — and the two are two marks that must be kept off each
			// other, which is the one thing a shared id makes impossible.
			const id = `box:${box.id}`;
			const inner = folded
				? discGroupElement(group)
				: kind === 'box'
					? boxElement(box, 'point')
					: discElement(box, 'point');
			const html = pointMark(inner);
			const icon = Leaf.divIcon({ html, className: '', iconSize: [0, 0] });
			const at = folded ? boxGroupPosition(group) : box.position;
			const badge = Leaf.marker(at, { icon, riseOnHover: true, pane: BOX_PANE });
			// No tooltip: the box already carries the town's name across its foot, and a
			// hover label over a map this dense is a second thing to read where there was
			// one to look at.
			//
			// A count of towns answers for none of them, so a click on one opens no pack: it
			// unfolds, exactly as a count of pins does, and the marks it comes apart into are
			// the ones that answer.
			if (folded) {
				badge.on('click', () => unfold(group.map((member) => member.position)));
			} else {
				const action = boxAction(box, kind);
				if (action) badge.on('click', () => action());
			}
			badge.addTo(boxLayer!);
			boxMarks.push({
				id,
				marker: null,
				position: at,
				element: html,
				layer: badge,
				// The stock the mark is printed on is the colour its line back is drawn in,
				// exactly as a pin's line takes its tile's colour: one colour saying one thing.
				leader: addLeader(
					id,
					at,
					group.every((member) => member.light) ? 'bg-white' : 'bg-black',
					false,
					boxLayer!
				),
				rank: kind === 'box' && !folded ? RANK_PICKED : RANK_BOX
			});
		}

		// Both families are built; now they are dealt the room between them.
		placeMarks();
	}

	// The wrapper every booster mark is hung on its point by.
	//
	// A booster mark used to place itself, centring on its point with a pair of classes. It
	// cannot any more: it is dealt its room with the pins now (see placeMarks), so where it
	// stands is measured per view and applied as a transform, and it needs the same shape every
	// placed mark has — a box whose LEFT-MIDDLE is what the offset is about, which is the corner
	// its line back arrives at.
	function pointMark(inner: HTMLElement): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'relative flex flex-col items-center';
		wrap.appendChild(inner);
		return wrap;
	}

	// A disc is 56px across (`size-14`), which is what makes two towns a few pixels apart two
	// marks lying on each other rather than two marks. Named as a number because this is the
	// one place the class's size has to be reckoned with rather than applied.
	const DISC_EXTENT = 56;

	// Which booster marks are one booster mark: the same folding the pins get (see foldPins),
	// over the other family of marks this map draws.
	//
	// They are folded among THEMSELVES and never with the pins, which is the whole reason the
	// two passes are two: a plate saying "4" that turned out to mean two towns and two boxes
	// would be a count of nothing. A disc says a town has a pack waiting; a count of discs says
	// how many towns thereabouts have one, which is the same statement about a crowd.
	//
	// Sizes are known here without measuring — a disc is a disc — so this needs no drawn crop
	// to work from, unlike the pins, whose plates are as wide as the names on them.
	function foldBoxes(drawable: readonly MapBoosterBox[]): MapBoosterBox[][] {
		const byId = new Map(drawable.map((box) => [box.id, box]));
		return groupPins(
			drawable.map((box) => {
				const at = mapInstance!.latLngToContainerPoint(box.position);
				return {
					id: box.id,
					x: at.x,
					y: at.y,
					width: DISC_EXTENT,
					height: DISC_EXTENT,
					groupable: markKindForBox(box) === 'disc'
				};
			}),
			{ gap: PIN_GAP }
		).map((group) => group.ids.map((id) => byId.get(id)!));
	}

	/** Where a folded crop of booster marks stands: the middle of the towns it is about. */
	function boxGroupPosition(group: readonly MapBoosterBox[]): [number, number] {
		const lat = group.reduce((sum, box) => sum + box.position[0], 0) / group.length;
		const lng = group.reduce((sum, box) => sum + box.position[1], 0) / group.length;
		return [lat, lng];
	}

	// The mark several discs fold into: the same disc, of the same stock, carrying the number
	// of towns it stands for where a disc carries its show's glyph.
	//
	// The stock is white only where every town under it is de festa today — a disc's colour is
	// a statement about the day, and a white one over a crop that is mostly not would be that
	// statement made falsely. Where they disagree the count is printed on black, which is the
	// stock the window's other towns are already read on.
	function discGroupElement(group: readonly MapBoosterBox[]): HTMLElement {
		const light = group.every((box) => box.light);
		const wrap = document.createElement('div');
		wrap.className =
			'flex size-14 cursor-pointer items-center justify-center rounded-full ' +
			'text-lg font-bold shadow-md ' +
			(light ? 'bg-white text-black' : 'bg-black text-white');
		wrap.textContent = String(group.length);
		// Decorative, as every mark in this family is: a bare number read out of the map has
		// no meaning to give, and what the marks are about is said in the panel's own lists.
		wrap.setAttribute('aria-hidden', 'true');
		return wrap;
	}

	// The wheel is driven by hand, in the shape Leaflet drives a pinch: a gesture that moves
	// the view while it is happening, and a single settle at the end of it. Leaflet's own
	// wheel handler is off (see scrollWheelZoom below) because on a map zoomed fractionally
	// it loses most of what the reader pushes into it, in two ways that compound. It maps a
	// wheel's pixels through a sigmoid onto a zoom, and rounds that UP to the nearest whole
	// zoom step — except with zoomSnap at 0 there is no step to round to, so what a notch is
	// worth stays the raw fraction the sigmoid gave: a fraction of a level where a snapped
	// map moved a whole one. And what survives that is then dropped outright while a zoom
	// animation is in flight: every 40ms it asks the map to zoom by what has accumulated
	// since the last ask, each ask starts a 250ms animation, and an ask arriving inside one
	// is discarded by Leaflet along with the wheel that earned it — so roughly five ticks in
	// six of a continuous spin go nowhere. Hence the long spinning for a short movement.
	//
	// A pinch has neither problem because it is not a series of requests to zoom: it holds a
	// zoom of its own, moves the map towards it every frame with no animation to be swallowed
	// by, and redraws once when the fingers lift. That is what this is, with the wheel's
	// notches where the fingers' distance was.
	//
	// Towards, not to. A pinch can be moved straight onto the gesture's zoom because the
	// fingers are already moving smoothly and every frame is a small step; a notch is a jump,
	// and a map put on the far side of one instantly is the clunk this had at first. So the
	// notch moves a zoom the map is *heading for* and each frame takes a share of what is left
	// of the distance — a glide the length of a wheel animation, except that a notch landing
	// mid-glide extends the same glide rather than queueing a second one behind it.
	//
	// What the notch is heading for is a STOP and not an amount (see zoomStops). The map draws
	// a tier of the region hierarchy and the bar across the top names where in that hierarchy
	// the view is, so the zooms worth resting at are the ones where a tier stands whole in the
	// canvas — the same zooms the bar's own positions are pressed for. A notch is therefore one
	// step along that ladder rather than a zoom level: the wheel walks the tiers, and a spin
	// comes to rest on one instead of somewhere in the middle of it. What the pointer does is
	// unchanged — the place under it is what the gesture holds still.

	// What one detent of a wheel reports, in each of the three units a browser may report it
	// in. The pixel figure is what Chrome, Safari and Edge send per notch; Firefox reports
	// lines and sends three; pages are the fallback nothing modern uses. A trackpad sends the
	// same units in small amounts, so a two-finger push is read as the fraction of a notch it
	// covers, and moves the map when those fractions have added up to one.
	const WHEEL_NOTCH = { 0: 100, 1: 3, 2: 1 } as const;
	// The most a single event may be worth, against a mouse whose driver reports one flick as
	// hundreds of pixels: the gesture stays fast (the events keep coming) without one of them
	// crossing the whole ladder.
	const MAX_NOTCHES_PER_WHEEL = 2;
	// A pause long enough that the next push is a new gesture, and the part of a notch left
	// over from the last one is forgotten rather than counting towards it. The first push of
	// one is a step whatever it is worth (see onWheelZoom).
	const WHEEL_GESTURE_GAP = 400;
	// The least time between two steps. A trackpad goes on sending for a second after the
	// fingers have left it, and a ladder is six or seven rungs long: without this, the tail of
	// one flick is the whole of it. It is also what makes a spin readable — a tier at a time,
	// at a pace a reader can stop on the one they wanted.
	const WHEEL_STEP_GAP = 120;
	// Near enough to a stop to be standing on it, when working out which one a notch steps
	// from. Also what keeps two tiers that fit at the same zoom — a tier the place under the
	// view does not have has its parent's box — from being two stops with nothing between
	// them, which would be a notch that appeared to do nothing.
	const STOP_SLACK = 0.05;
	// The glide: how long the remaining distance takes to halve. Measured in time and not in
	// frames, so the movement lasts as long on a 120Hz screen as on a 60Hz one. At this figure
	// a notch is most of the way there in about a sixth of a second — near enough Leaflet's
	// own zoom animation, which is the movement a wheel used to make and the one a reader of
	// this map already knows.
	const WHEEL_HALF_LIFE = 55;
	// Close enough to be there. A hair under a hundredth of a zoom level: past this the glide
	// stops rather than crawling the last thousandths, and stopping is what redraws the map.
	const WHEEL_ARRIVED = 0.005;
	// How often, while the glide is still running, the tiles are re-cut for the level the map
	// has reached. A gesture scales the tiles it has rather than fetching new ones (which is
	// what keeps it smooth), so a long spin would otherwise be a long blur ending in a snap.
	const WHEEL_TILES_MS = 300;

	// Leaflet's pinch handler drives its gesture through these, so a wheel gesture is written
	// against the same ones. `_move` puts the map at a centre and a zoom with no animation;
	// told it is a pinch, the tiles scale in place instead of a fresh set being fetched for a
	// frame that is about to be replaced. `_resetView` is the redraw at the end that does
	// fetch them, and is what fires the moveend the pins and boxes are re-culled on.
	// `_animatingZoom` is Leaflet's own flag, read only where an animation and this gesture
	// would otherwise be moving the same map (see below).
	type GestureMap = L.Map & {
		_move(center: L.LatLng, zoom: number, data?: { pinch?: boolean; round?: boolean }): void;
		_resetView(center: L.LatLng, zoom: number): void;
		_onZoomTransitionEnd(): void;
		_stop(): void;
		_animatingZoom?: boolean;
	};

	// The zoom the gesture is heading for, held apart from the map's own for two reasons: the
	// map is behind it by design, gliding towards it, and events arriving faster than the
	// screen redraws all count, since what accumulates between two frames accumulates here
	// rather than on a zoom that has not caught up yet. Null between gestures.
	let wheelZoom: number | null = null;
	// The point on the canvas the zoom is anchored to — the place under the pointer stays
	// under the pointer, so a reader zooms into what they are looking at rather than into the
	// middle of the map.
	let wheelAnchor: L.Point | null = null;
	let wheelFrame = 0;
	// When the last frame was drawn, and when the tiles were last re-cut.
	let wheelLast = 0;
	let wheelTiles = 0;
	// The part of a notch pushed but not yet spent. A wheel with detents sends whole notches
	// and steps a stop each time; a trackpad sends a stream of small fractions, and this is
	// where they add up until they are worth a step. Cleared when a gesture has been over long
	// enough that the next push is a new one.
	let wheelPush = 0;
	let wheelPushAt = 0;
	let wheelStepAt = 0;
	// Whether this gesture has yet to move the map. The first push of one steps whatever it is
	// worth, so a device that reports a flick as a handful of pixels is not a device this map
	// ignores; it is only *inside* a gesture that a step costs a whole notch.
	let wheelFresh = false;

	// The zooms a gesture may come to rest at, coarsest first: each box that the ladder is made
	// of, at the zoom it stands whole in the canvas at — computed here rather than handed over
	// ready-made because the fit depends on the canvas and the projection, which are the map's.
	// The margin is the framing's own, so a stop is exactly where a click on that region would
	// have put the map, and the tier drawn there is the tier that region contains.
	//
	// Two stops closer together than the slack are one stop: a tier the place under the view
	// does not have is handed the box of the tier above it, and a notch between two zooms that
	// are the same zoom is a notch that does nothing. The map's own deepest zoom closes the
	// ladder, so the imagery can still be read at the detail it holds — past the last tier is
	// not between two tiers.
	//
	// A map given no ladder at all (the polygons never loaded) falls back to its whole zoom
	// levels, which is a notch a level: the wheel a map without a hierarchy would have had.
	function wheelStopZooms(map: L.Map): number[] {
		const min = map.getMinZoom();
		const max = map.getMaxZoom();
		const found: number[] = [];
		if (zoomStops.length) {
			const padding = focusPadding();
			for (const box of zoomStops) found.push(map.getBoundsZoom(box, false, padding));
			found.push(max);
		} else {
			for (let zoom = Math.ceil(min); zoom <= max; zoom++) found.push(zoom);
		}

		const stops: number[] = [];
		for (const zoom of found.sort((a, b) => a - b)) {
			const clamped = Math.max(min, Math.min(max, zoom));
			if (!stops.length || clamped - stops[stops.length - 1] > STOP_SLACK) stops.push(clamped);
		}
		return stops;
	}

	// The stop a number of steps away from a zoom. Counted from where the zoom stands in the
	// ladder rather than from the nearest stop, so a first notch out of a view that is between
	// two stops (a click has framed a region, or the ladder has changed under a pan) lands on
	// the one it is heading towards rather than skipping it.
	function stopAfter(stops: number[], zoom: number, steps: number): number {
		if (steps > 0) {
			const next = stops.findIndex((stop) => stop > zoom + STOP_SLACK);
			if (next < 0) return stops[stops.length - 1];
			return stops[Math.min(next + steps - 1, stops.length - 1)];
		}
		let previous = -1;
		for (let i = stops.length - 1; i >= 0; i--) {
			if (stops[i] < zoom - STOP_SLACK) {
				previous = i;
				break;
			}
		}
		if (previous < 0) return stops[0];
		return stops[Math.max(previous + steps + 1, 0)];
	}

	function onWheelZoom(event: WheelEvent) {
		if (!mapInstance) return;
		// The page must not scroll and the browser must not zoom under us: over the canvas a
		// wheel means this and nothing else.
		event.preventDefault();

		// A sideways push is a wheel event with nothing on the axis that means zoom. Nothing
		// on this map reads one, so it is refused a gesture rather than given one worth no
		// zoom, which would still cost the redraw at the end of it.
		if (!event.deltaY) return;

		const now = performance.now();
		// A gesture is a run of pushes with no real pause in it. A new one forgets whatever
		// part-notch the last one ended on, and is owed a step for its first push.
		if (now - wheelPushAt > WHEEL_GESTURE_GAP) {
			wheelPush = 0;
			wheelFresh = true;
		}
		wheelPushAt = now;

		const notch = WHEEL_NOTCH[(event.deltaMode as 0 | 1 | 2) ?? 0] ?? WHEEL_NOTCH[0];
		wheelPush += Math.max(
			-MAX_NOTCHES_PER_WHEEL,
			Math.min(MAX_NOTCHES_PER_WHEEL, -event.deltaY / notch)
		);

		// One step at a time, and one to a step gap. What earns it is a whole notch of pushing
		// — a detent of a wheel, or as much of a trackpad — except for the push that opens a
		// gesture, which earns one whatever it is worth: a device that reports a flick as a few
		// pixels is asking for the same thing as a device that reports it as a hundred, and a
		// map that waits for the hundred does nothing at all on the first.
		if (now - wheelStepAt < WHEEL_STEP_GAP) return;
		if (!wheelFresh && Math.abs(wheelPush) < 1) return;
		const steps = wheelPush > 0 ? 1 : -1;
		// Spent, along with anything pushed while the gap was closed: a step is a step, and the
		// tail of a trackpad's flick is not a queue of them waiting to be taken.
		wheelPush = 0;
		wheelFresh = false;
		wheelStepAt = now;

		// Before the map has moved a pixel of this step — the gesture's first frame is still an
		// animation frame away. A step landing mid-glide clears an already empty layer.
		clearMarkers();

		const map = mapInstance as GestureMap;
		// A wheel overtakes whatever the map was doing on its own. A pan or a fly is stopped
		// outright; a zoom animation cannot be, so it is landed at its destination now —
		// otherwise it would finish 250ms later by putting the map back where it had been
		// going, over the top of the gesture the reader has started since.
		//
		// `_stop` and not the public `stop`, which is what Leaflet's own wheel handler calls
		// here and for the reason found by measuring this: `stop` sets the zoom to the zoom the
		// map is already at, and a move of no distance still ends — it fires a moveend. Which is
		// this map's "the view has settled, build the pins for it", one line after the pins were
		// taken off for the zoom about to start, so the set came straight back and stood through
		// the whole glide. `_stop` cancels the animations and says nothing.
		map._stop();
		if (map._animatingZoom) map._onZoomTransitionEnd();

		wheelAnchor = map.mouseEventToContainerPoint(event);
		wheelZoom = stopAfter(wheelStopZooms(map), wheelZoom ?? map.getZoom(), steps);

		if (!wheelFrame) {
			wheelLast = now;
			wheelTiles = now;
			wheelFrame = requestAnimationFrame(stepWheelZoom);
		}
	}

	// One frame of the glide: take a share of what is left of the way to the gesture's zoom,
	// and put the map there keeping the anchored point where it is. That centre is the one
	// `setZoomAround` computes — the offset from the middle of the canvas to the anchor, grown
	// by how much the scale is about to change, taken off the middle again — and it is
	// recomputed per frame, so the anchor holds across a glide of any length.
	function stepWheelZoom(now: number) {
		wheelFrame = 0;
		if (!mapInstance || wheelZoom === null || !wheelAnchor) return;

		const map = mapInstance as GestureMap;
		// The map has been sent somewhere else mid-glide — a region framed by a click. That
		// movement is the newer of the two and knows where it is going; this one drops.
		if (map._animatingZoom) {
			wheelZoom = null;
			wheelAnchor = null;
			return;
		}

		const from = map.getZoom();
		const gap = wheelZoom - from;
		const arrived = Math.abs(gap) < WHEEL_ARRIVED;
		const share = 1 - Math.pow(2, -(now - wheelLast) / WHEEL_HALF_LIFE);
		wheelLast = now;

		const next = arrived ? wheelZoom : from + gap * share;
		const scale = map.getZoomScale(next, from);
		const half = map.getSize().divideBy(2);
		const offset = wheelAnchor.subtract(half).multiplyBy(1 - 1 / scale);
		const centre = map.containerPointToLatLng(half.add(offset));

		if (arrived) {
			// The end of the gesture, and the one full redraw of it: the tiles, the polygons and
			// the pins all at the zoom the map came to rest at.
			wheelZoom = null;
			wheelAnchor = null;
			map._resetView(centre, next);
			return;
		}

		// Every so often through a long glide, let the tiles be re-cut for the level reached
		// (a frame that is not called a pinch is one the tile layer reloads for) — the pins and
		// the polygons are left alone until the map stops, since those are rebuilt rather than
		// transformed and a rebuild per frame is the jerk this is avoiding.
		const recut = now - wheelTiles >= WHEEL_TILES_MS;
		if (recut) wheelTiles = now;

		map._move(centre, next, { pinch: !recut, round: false });
		wheelFrame = requestAnimationFrame(stepWheelZoom);
	}

	onMount(async () => {
		// Leaflet touches `window` at import time, so it must be loaded
		// dynamically in the browser — never during SSR.
		Leaf = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		// Gone while the module was loading: there is no container left to build on, and a map
		// built here would be one nothing ever removes — onDestroy has already run.
		if (destroyed) return;

		mapInstance = Leaf.map(mapContainer, {
			minZoom,
			maxZoom,
			worldCopyJump: true,
			// Any zoom, not the whole ones a tile pyramid is cut at. Two things want it, and
			// the second is why it is here. A wheel or a pinch moves the view by the amount it
			// was pushed rather than by a doubling, which is what a map that changes what it
			// draws as it is zoomed wants: the tier gives way when the region on screen has
			// grown past the canvas, and the reader can stop on either side of that. And the
			// framing can land exactly on the fit — a whole-numbered zoom can only land at or
			// under it, by up to a factor of two, so a region opened by a click came to rest
			// anywhere between filling the canvas and taking a quarter of it, and whether its
			// children were pinned or it was pinned by itself came down to where that fell
			// (see the focus effect and levelIndexForView).
			zoomSnap: 0,
			// The wheel is handled here instead (see onWheelZoom): Leaflet's own handler and a
			// zoom with no steps in it are the pair that made a spin of the wheel move the map
			// by almost nothing.
			scrollWheelZoom: false,
			// No +/- zoom buttons — the map is driven by scroll/pinch only.
			zoomControl: false,
			// The badge carries the Esri credit the imagery licence requires, so it
			// stays on for as long as the satellite basemap is there.
			attributionControl: true
		});

		// The pane the festa boxes hang in (see BOX_PANE), made before anything is added to
		// it. Under the region pins (600) rather than over them: the map is dense and these
		// marks are large, so where one reaches a pin the pin is the thing that must not be
		// covered — a box gives up its corner instead. Only ever a NEIGHBOUR's pin, mind: a
		// town's own mark is inside its pin (see markerElement) and nothing here stands on a
		// point a pin already has.
		mapInstance.createPane(BOX_PANE).style.zIndex = '590';

		// The pane the leader lines are drawn in (see LEADER_PANE), under every mark on the
		// map — the pins at 600 and the booster marks at 590.
		//
		// A line used to be drawn inside the mark it belongs to, which put it in that mark's
		// place in the stack: a line leaving a northern town crossed the plate of a southern
		// one and was drawn over it, because Leaflet stacks a marker by its latitude and a
		// mark is stacked whole. So the lines are taken out of the marks altogether and given
		// one pane below all of them, where no line can be over anything: a line is the least
		// of what is drawn here, being only the sign that a mark is beside its place, and it
		// crosses the terrain rather than the reading matter standing on it.
		//
		// A pane rather than a layer of the container, because a line is about a point on the
		// ground: in a pane it slides with the map exactly as the mark it points at does, and
		// needs redrawing only where the marks themselves are dealt again.
		mapInstance.createPane(LEADER_PANE).style.zIndex = '580';

		// The pane the grouping line hangs in (see OUTLINE_PANE and the `outline` prop),
		// made before anything is added to it. At 450 it is clear of the polygons at 400
		// and under every mark on the map; it catches nothing, so a press meant for the
		// town under it reaches the town.
		const outlinePane = mapInstance.createPane(OUTLINE_PANE);
		outlinePane.style.zIndex = '450';
		outlinePane.style.pointerEvents = 'none';

		// The pane the group discs stand in (see GROUP_PANE and the `groupMarks` prop), over
		// the line they belong to at 450 and under every mark a reader acts on. It catches
		// nothing either: a disc says what a stretch of country is flying, and the country
		// under it goes on being pressed.
		const groupPane = mapInstance.createPane(GROUP_PANE);
		groupPane.style.zIndex = '460';
		groupPane.style.pointerEvents = 'none';

		// The pane the spotlight's cover is drawn in (see MASK_PANE), made before anything is
		// added to it and made hidden: the mask is faded in by taking that class off, so a
		// cover that lands with the map already spotlit still arrives rather than appearing.
		// It catches nothing — the map behind it is dragged and zoomed exactly as if the black
		// were not there, which it will not be for long.
		//
		// Over EVERYTHING, marks included: 610 clears the pins at 600, the boxes at 590 and the
		// lines at 580. It sat at 450 while it only had to cover the polygons, because the sheet
		// the spotlight was raised for used to blur every mark off the map for the length of a
		// fight. No sheet touches the map any more (see the note above the effects), so a mask
		// under the marks would be a black country with the pins of every town in it standing on
		// top — which is the opposite of showing one place alone. The town being fought over keeps
		// its own pin either way: the cover is the world with that shape punched out of it, and
		// nothing inside the hole is covered.
		const maskPane = mapInstance.createPane(MASK_PANE);
		maskPane.style.zIndex = '610';
		maskPane.style.pointerEvents = 'none';
		// The duration is written out rather than read off MASK_FADE_MS: Tailwind generates the
		// classes it can SEE, and a class built out of a constant is one it cannot. Keep the two
		// in step.
		maskPane.classList.add('transition-opacity', 'duration-[250ms]', 'ease-in-out', 'opacity-0');

		// Not passive: the handler's first act is to refuse the page the scroll.
		mapContainer.addEventListener('wheel', onWheelZoom, { passive: false });

		// Esri World Imagery: pure satellite tiles, no labels or roads.
		// Note the {z}/{y}/{x} order — ArcGIS swaps y and x vs the OSM scheme.
		Leaf.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			{
				attribution:
					'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
				maxZoom: 19
			}
		).addTo(mapInstance);

		mapInstance.setView(center, zoom);
		// Keep the bindable zoom and centre in sync so callers can render a live
		// readout and tell which region the view is focused on.
		const syncView = () => {
			currentZoom = mapInstance!.getZoom();
			const c = mapInstance!.getCenter();
			currentCenter = [c.lat, c.lng];
		};
		syncView();
		// The other way a zoom begins: a region framed by a click, or a tier asked for from the
		// bar. The wheel clears the pins itself, since a gesture moves the map without ever
		// telling Leaflet a zoom has started (see onWheelZoom) — this is for the ones that do.
		// A pan is not one of them and keeps its pins: a pin carried sideways is still the pin
		// that view calls for, at the size it was drawn at.
		mapInstance.on('zoomstart', clearMarkers);
		// Re-cull the pins and re-sync the view after any pan or zoom settles. This is the far
		// end of a zoom as well as of a pan, so it is where the map stops being between two
		// tiers and may carry pins again.
		mapInstance.on('moveend zoomend', () => {
			midZoom = false;
			syncView();
			rebuildMarkers();
			rebuildBoxes();
			// The discs are re-culled and re-thinned here too, both of their answers being
			// about the view: which are on screen, and which of them are standing on one
			// another at this zoom (see rebuildGroupMarks).
			rebuildGroupMarks();
		});

		// Keep Leaflet's cached viewport in sync with its container: when the parent
		// shrinks the map to reserve room for an open side panel, invalidateSize
		// re-projects the map (so markers/boxes slide out from under the panel and
		// stay clickable) and we re-cull to the new box. Without this, Leaflet keeps
		// the stale size and the reserved gutter still overlaps live pins.
		resizeObserver = new ResizeObserver(() => {
			mapInstance?.invalidateSize({ animate: false });
			syncView();
			rebuildMarkers();
			rebuildBoxes();
			rebuildGroupMarks();
		});
		resizeObserver.observe(mapContainer);

		// Fetch all overlays in parallel, then add them in array order so
		// z-stacking is deterministic regardless of network timing.
		const datasets = await Promise.all(
			overlays.map(async (overlay) => {
				const response = await fetch(overlay.url);
				return (await response.json()) as GeoJSON.FeatureCollection;
			})
		);

		// Guard against the component unmounting while fetches were in flight. This is the
		// likeliest place for that to happen — the geo layers are megabytes and the whole rest
		// of the mount waits on them — and it only holds because onDestroy nulls the field: a
		// removed Leaflet map is still a perfectly truthy object, with its panes gone, so
		// adding a layer to one throws inside Leaflet rather than being caught here.
		if (destroyed || !mapInstance) return;

		overlays.forEach((overlay, index) => {
			// A `properties.id → layer` lookup for this overlay, populated below when
			// the overlay has a hoverStyle so pins can highlight their region.
			const byId = new Map<string, L.Path>();
			// A path's options and a collection's, in one object on purpose: a GeoJSON layer
			// hands ITS options to every shape it makes, and Leaflet puts `className` on the
			// path it draws — which is how one class reaches every polygon of every tier (see
			// PATH_CLASSES), written once here. The types keep the two families apart, since
			// nothing else is passed down like this.
			const layerOptions: L.GeoJSONOptions & L.PathOptions = {
				className: PATH_CLASSES,
				interactive: overlay.interactive ?? true,
				// Read the overlay back out of the live prop by its position rather than
				// closing over the one mounted with, so a repaint picks up the styles the
				// caller is handing over now (the mounted one is the fallback for a
				// caller that later passes a shorter array).
				style: (feature) => styleFor(overlays[index] ?? overlay, feature),
				onEachFeature: (feature, layer) => {
					if (overlay.interactive === false) return;

					const label = overlay.label?.(feature);
					if (label) {
						layer.bindTooltip(label, { sticky: true });
					}

					// Record each feature's layer so a pin can light up its whole region.
					// Hovering the polygon lights the SAME whole region its pin does (never
					// the single municipality on its own) — so the hover works across the
					// pinned area, not just on the tiny pin icon.
					if (overlay.hoverStyle) {
						const id = feature.properties?.id;
						if (id != null) {
							const key = String(id);
							byId.set(key, layer as L.Path);
							layer.on('mouseover', () => highlightRegion(regionByFeatureId.get(key), true));
							layer.on('mouseout', () => highlightRegion(regionByFeatureId.get(key), false));
						}
					}

					// The live overlay's handler, read at press time by position, for the reason its
					// style is (see above): a caller that rebuilds its overlays hands over a fresh
					// closure each repaint, and a click bound to the one this layer was mounted with
					// would be answering with whatever the map knew when it loaded.
					layer.on('click', () => (overlays[index] ?? overlay).onClick?.(feature));
				}
			};
			const layerGroup = Leaf!.geoJSON(datasets[index], layerOptions).addTo(mapInstance!);
			overlayGroups.push(layerGroup);
			if (overlay.hoverStyle) {
				hoverLayers.push({ group: layerGroup, hoverStyle: overlay.hoverStyle, byId });
			}
		});

		// Standalone straight lines, drawn above every overlay (e.g. the portal
		// axis running from the mainland out across the Mediterranean).
		for (const line of lines) {
			const shape = Leaf.polyline(line.points, line.style).addTo(mapInstance!);
			if (line.label) {
				shape.bindTooltip(line.label, {
					permanent: true,
					direction: 'center',
					className: 'bg-transparent! border-none! shadow-none! font-bold text-white!'
				});
			}
		}

		// Standalone circular regions, drawn above every overlay with a permanent
		// centred label (e.g. the "Portal" out at sea).
		for (const circle of circles) {
			const shape = Leaf.circle(circle.center, { radius: circle.radius, ...circle.style }).addTo(
				mapInstance!
			);
			if (circle.label) {
				shape.bindTooltip(circle.label, {
					permanent: true,
					direction: 'center',
					className: 'bg-transparent! border-none! shadow-none! font-bold text-white!'
				});
			}
			if (circle.onClick) {
				shape.on('click', () => circle.onClick!());
			}
		}

		// Now the layers exist: let the reactive $effects build the pins (and
		// rebuild them whenever the markers prop later changes). Any highlight set
		// before mount was already painted by styleFor; changes go through its effect.
		ready = true;
	});

	onDestroy(() => {
		destroyed = true;
		mapContainer?.removeEventListener('wheel', onWheelZoom);
		if (wheelFrame) cancelAnimationFrame(wheelFrame);
		if (maskTimer) clearTimeout(maskTimer);
		resizeObserver?.disconnect();
		unmountPinMounts();
		unmountBoxMounts();
		mapInstance?.remove();
		// Removed is not gone: Leaflet takes the panes down and leaves the object standing, so
		// everything that reads this field to decide whether there is still a map — the mount's
		// own guards, and every $effect that runs one last time on the way out — was reading a
		// map with nothing under it and getting yes. Let go of it here, and the answer is no.
		mapInstance = null;
	});
</script>

<!-- bg-transparent! overrides Leaflet's default grey container fill, so the page
	background (not a grey block) is what shows while the satellite tiles stream in.
	Nothing transforms this box. A CSS transform on the Leaflet container leaves the map
	drawn as its polygons on the page's background — the imagery goes and does not come
	back — so the board is never tipped, leaned or scaled. Nor does anything else on the page
	reach in here: a full view raised over the map leaves the map entirely alone (it used to
	blur every mark on it away, and lean the whole board back before that). -->
<div
	bind:this={mapContainer}
	class={`bg-transparent! ${classes}`}
	role="application"
	aria-label="World map"
></div>
