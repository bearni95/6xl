/**
 * Draws a line around each *group* of neighbouring shapes rather than around each
 * shape: given a tier's polygons and a group name per polygon, it returns the
 * outline of every run of touching polygons that share a group — the whole
 * cluster's edge, with the borders inside it gone.
 *
 * The map uses it to say which shows the level on screen is divided between: the
 * towns of one comarca that fly the same show are one shape in pink, and the
 * comarca's own white border still crosses it. Nothing here knows about shows, or
 * about Leaflet: it takes a collection and a naming function and answers with
 * chains of points.
 *
 * The method is the one a dissolve uses, and it is exact rather than approximate.
 * These layers are topologically clean — a border between two municipalities is
 * the *same* run of vertices in both polygons, written once forwards and once
 * backwards (the dissolved tiers pass through topojson, which quantizes them onto
 * one grid; the municipality layer inherits the coverage GISCO cut it from). So
 * every segment is looked up by its two endpoints, unordered, and the two sides
 * that own it are read off directly. A segment whose two sides are the same group
 * is interior to that group and is dropped; everything else is a group's edge and
 * is kept.
 *
 * That leaves a heap of loose segments, which is why the last step stitches them
 * end to end: 3,400 segments handed over as 3,400 polylines is 3,400 SVG paths,
 * while the same segments joined into the few hundred chains they actually form
 * can be drawn as one. The chains are not rings and are not meant to be — nothing
 * is filled from them, and a group whose edge meets three others at a point is
 * walked through in whichever order its segments arrive. What matters is that
 * every kept segment is drawn exactly once.
 */

/** A chain of points as Leaflet takes them: `[lat, lng]`, one straight leg between each. */
export type OutlineChain = [number, number][];

/** A position's identity as a lookup key — the vertex as it is written. */
function pointKey(position: number[]): string {
	return `${position[0]},${position[1]}`;
}

/** Every ring of a Polygon or MultiPolygon; anything else has no area and no edge. */
function ringsOf(geometry: GeoJSON.Geometry | null | undefined): number[][][] {
	if (!geometry) return [];
	if (geometry.type === 'Polygon') return geometry.coordinates;
	if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
	return [];
}

/** One segment of a ring, held by its endpoints and by the groups on either side. */
interface Edge {
	a: string;
	b: string;
	/** The two positions, so a chain can be built without re-parsing the keys. */
	from: number[];
	to: number[];
	/** The group on each side; the second stays null where the segment is an outer edge. */
	left: string | null;
	right: string | null;
	/** Whether a second polygon has claimed it — an unshared segment has one side. */
	shared: boolean;
}

/**
 * The outline of every same-group cluster in `collection`, as chains of `[lat, lng]`.
 *
 * `groupOf` names the group a feature belongs to, or null for one that belongs to
 * no group at all — a town whose show has not landed, say. A null is a group like
 * any other for the purpose of dropping interior borders (two show-less towns
 * side by side draw no line between them) but is never *outlined*: what is being
 * drawn is where a group ends, and "no show" is not a group anything is being said
 * about. So the edge between a group and the show-less land beside it is drawn,
 * and the edge between show-less land and the sea is not.
 */
export function groupOutlines(
	collection: GeoJSON.FeatureCollection | null | undefined,
	groupOf: (feature: GeoJSON.Feature) => string | null
): OutlineChain[] {
	if (!collection) return [];

	// Every segment on the tier, keyed by its two endpoints unordered, so the two
	// polygons that share a border meet in the same entry whichever way round each
	// of them walks it.
	const edges = new Map<string, Edge>();

	for (const feature of collection.features) {
		const group = groupOf(feature);
		for (const ring of ringsOf(feature.geometry)) {
			for (let i = 0; i < ring.length - 1; i++) {
				const from = ring[i];
				const to = ring[i + 1];
				const a = pointKey(from);
				const b = pointKey(to);
				if (a === b) continue;
				const key = a < b ? `${a}|${b}` : `${b}|${a}`;
				const seen = edges.get(key);
				if (seen) {
					seen.right = group;
					seen.shared = true;
				} else {
					edges.set(key, { a, b, from, to, left: group, right: null, shared: false });
				}
			}
		}
	}

	// What survives: a segment with a different group on each side, and never one
	// with nothing on either. An unshared segment's other side is the sea or the
	// world past the map, which is no group — so it is kept exactly when the land
	// side of it is in one.
	const kept: Edge[] = [];
	for (const edge of edges.values()) {
		if (edge.shared && edge.left === edge.right) continue;
		if (edge.left == null && edge.right == null) continue;
		kept.push(edge);
	}

	return stitch(kept);
}

/**
 * Joins segments that meet at a point into as few chains as possible.
 *
 * Two passes, and the order is the whole trick. The first starts only at points
 * where the outline cannot simply be walked through — an end, or a junction of
 * three or more — so an open run is walked from its end and comes out as one
 * chain rather than as two halves meeting in its middle. Whatever is left after
 * that is made of points with exactly two segments each, which is to say closed
 * loops: the second pass starts anywhere on each and walks it round.
 */
function stitch(edges: Edge[]): OutlineChain[] {
	// Point → the segments meeting there. A junction has more than two.
	const at = new Map<string, number[]>();
	for (let i = 0; i < edges.length; i++) {
		for (const point of [edges[i].a, edges[i].b]) {
			const list = at.get(point);
			if (list) list.push(i);
			else at.set(point, [i]);
		}
	}

	const used = new Array<boolean>(edges.length).fill(false);
	const chains: OutlineChain[] = [];

	// Walk from `start` for as long as there is an unwalked segment to take, taking
	// whichever arrives first at each point — see the note above on junctions.
	// Answers whether it drew anything, so a junction can be walked until every
	// segment meeting there has been drawn rather than just the first of them.
	const walk = (start: string): boolean => {
		let point = start;
		let chain: OutlineChain | null = null;
		for (;;) {
			const next = (at.get(point) ?? []).find((index) => !used[index]);
			if (next == null) return chain != null;
			used[next] = true;
			const edge = edges[next];
			const forwards = edge.a === point;
			const from = forwards ? edge.from : edge.to;
			const to = forwards ? edge.to : edge.from;
			if (!chain) {
				chain = [[from[1], from[0]]];
				chains.push(chain);
			}
			chain.push([to[1], to[0]]);
			point = forwards ? edge.b : edge.a;
		}
	};

	for (const [point, meeting] of at) {
		if (meeting.length === 2) continue;
		while (walk(point));
	}
	for (let i = 0; i < edges.length; i++) {
		if (!used[i]) walk(edges[i].a);
	}

	return chains;
}
