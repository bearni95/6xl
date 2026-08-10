/**
 * Reads a tier of polygons as the *groups* its shapes fall into rather than as the
 * shapes themselves: given a group name per polygon, it works out which polygons
 * touch which, and answers with every run of touching polygons that share a group —
 * as the outline round each run, and as the runs themselves.
 *
 * The map uses it to say which shows the level on screen is divided between: the
 * towns of one comarca that fly the same show are one shape in pink with one disc
 * standing on it, and the comarca's own white border still crosses it. Nothing here
 * knows about shows, or about Leaflet: it takes a collection and a naming function
 * and answers with chains of points and lists of indices.
 *
 * Both answers come out of one walk because they are one question. The method is
 * the one a dissolve uses, and it is exact rather than approximate: these layers
 * are topologically clean — a border between two municipalities is the *same* run
 * of vertices in both polygons, written once forwards and once backwards (the
 * dissolved tiers pass through topojson, which quantizes them onto one grid; the
 * municipality layer inherits the coverage GISCO cut it from). So every segment is
 * looked up by its two endpoints, unordered, and the two shapes that own it are
 * read off directly. Same group on both sides and the segment is interior: it is
 * dropped from the outline, and the two shapes are joined into one run. Anything
 * else is where a group ends, and is kept.
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

/**
 * One run of touching shapes that share a group — a single piece of the country
 * flying one show, which is what a reader sees inside one pink line.
 *
 * The shapes are given as positions in the collection handed in, so a caller can
 * take whatever it needs off its own features (their geometry, their names) without
 * this having to guess which of those it wanted. A shape in no group is in no run:
 * a group of null is a group for the purpose of dropping the borders inside it, and
 * never one anything is said about.
 */
export interface ShapeRun {
	/** The group every shape in the run belongs to. */
	group: string;
	/** Indices into `collection.features`, in the order they were read. */
	members: number[];
}

/** What a tier's shapes add up to: the line round each run, and the runs. */
export interface Grouping {
	chains: OutlineChain[];
	runs: ShapeRun[];
}

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

/** One segment of a ring, held by its endpoints and by the shapes on either side. */
interface Edge {
	a: string;
	b: string;
	/** The two positions, so a chain can be built without re-parsing the keys. */
	from: number[];
	to: number[];
	/** The shape it was first read from, as a position in the collection. */
	left: number;
	/** The shape that claimed it second, or -1 while it is an outer edge. */
	right: number;
}

/**
 * The grouping of `collection` under `groupOf`, which names the group a feature
 * belongs to or null for one that belongs to no group at all — a town whose show
 * has not landed, say.
 *
 * A null is a group like any other for the purpose of dropping interior borders
 * (two show-less towns side by side draw no line between them) but is never
 * *outlined* and never *run*: what is being drawn is where a group ends, and "no
 * show" is not a group anything is being said about. So the edge between a group
 * and the show-less land beside it is drawn, and the edge between show-less land
 * and the sea is not.
 */
export function groupShapes(
	collection: GeoJSON.FeatureCollection | null | undefined,
	groupOf: (feature: GeoJSON.Feature) => string | null
): Grouping {
	if (!collection) return { chains: [], runs: [] };

	const groups = collection.features.map(groupOf);

	// Every segment on the tier, keyed by its two endpoints unordered, so the two
	// polygons that share a border meet in the same entry whichever way round each
	// of them walks it. A third claimant is impossible on a clean coverage and would
	// simply be ignored here — two shapes is what an edge has sides for.
	const edges = new Map<string, Edge>();

	collection.features.forEach((feature, index) => {
		for (const ring of ringsOf(feature.geometry)) {
			for (let i = 0; i < ring.length - 1; i++) {
				const from = ring[i];
				const to = ring[i + 1];
				const a = pointKey(from);
				const b = pointKey(to);
				if (a === b) continue;
				const key = a < b ? `${a}|${b}` : `${b}|${a}`;
				const seen = edges.get(key);
				if (seen) seen.right = index;
				else edges.set(key, { a, b, from, to, left: index, right: -1 });
			}
		}
	});

	// Which shapes are one shape: every interior segment joins its two sides, and
	// what is left standing after the pass is the runs.
	const runOf = new Runs(collection.features.length);

	// What survives into the outline: a segment with a different group on each side.
	// An unshared segment's other side is the sea or the world past the map, which is
	// no group — so it is kept exactly when the land side of it is in one, and the
	// one rule covers that too.
	const kept: Edge[] = [];
	for (const edge of edges.values()) {
		const left = groups[edge.left];
		const right = edge.right === -1 ? null : groups[edge.right];
		if (left === right) {
			if (left != null && edge.right !== -1) runOf.join(edge.left, edge.right);
			continue;
		}
		kept.push(edge);
	}

	// The runs, in the order their first shape appears — so a caller walking them is
	// walking the collection, and two views of the same map list them the same way.
	const byRoot = new Map<number, ShapeRun>();
	const runs: ShapeRun[] = [];
	groups.forEach((group, index) => {
		if (group == null) return;
		const root = runOf.rootOf(index);
		const run = byRoot.get(root);
		if (run) run.members.push(index);
		else {
			const started = { group, members: [index] };
			byRoot.set(root, started);
			runs.push(started);
		}
	});

	return { chains: stitch(kept), runs };
}

/**
 * Which shapes have been found to be one shape, as a union-find over their
 * positions in the collection. Each shape starts as its own run and every interior
 * segment merges two of them; `rootOf` names whichever run a shape has ended up in.
 * Paths are flattened as they are walked, which is what keeps a chain of merges
 * (a long valley of towns, joined one to the next) from being re-walked per member.
 */
class Runs {
	private parent: number[];

	constructor(size: number) {
		this.parent = Array.from({ length: size }, (_, index) => index);
	}

	rootOf(index: number): number {
		let root = index;
		while (this.parent[root] !== root) root = this.parent[root];
		let walk = index;
		while (this.parent[walk] !== root) {
			const next = this.parent[walk];
			this.parent[walk] = root;
			walk = next;
		}
		return root;
	}

	join(a: number, b: number): void {
		const rootA = this.rootOf(a);
		const rootB = this.rootOf(b);
		if (rootA !== rootB) this.parent[rootB] = rootA;
	}
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
