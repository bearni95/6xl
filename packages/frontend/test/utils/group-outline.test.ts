import { describe, expect, it } from 'vitest';
import { groupShapes, type OutlineChain } from '$utils/geo/group-outline';

// A run of cells across the same row, each one degree of longitude wide and one of
// latitude tall, so `cell(0)` and `cell(1)` share the meridian between them. Written
// as GeoJSON writes a position — [lng, lat] — with the two apart, so a chain coming
// back the other way round would be visible in the assertions.
function cell(column: number, group: string | null): GeoJSON.Feature {
	const west = column;
	const east = column + 1;
	return {
		type: 'Feature',
		properties: { id: `c${column}`, group },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[west, 40],
					[east, 40],
					[east, 41],
					[west, 41],
					[west, 40]
				]
			]
		}
	};
}

function row(...groups: (string | null)[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: groups.map((group, column) => cell(column, group))
	};
}

const grouping = (collection: GeoJSON.FeatureCollection) =>
	groupShapes(collection, (feature) => (feature.properties?.group as string | null) ?? null);

const outlines = (collection: GeoJSON.FeatureCollection) => grouping(collection).chains;

// Every leg drawn, as unordered endpoint pairs — which is what the outline actually
// says. Where a chain was cut and which way round it was walked are the stitcher's
// business and are deliberately not asserted.
function legs(chains: OutlineChain[]): Set<string> {
	const drawn = new Set<string>();
	for (const chain of chains) {
		for (let i = 0; i < chain.length - 1; i++) {
			const a = chain[i].join(',');
			const b = chain[i + 1].join(',');
			drawn.add(a < b ? `${a} ${b}` : `${b} ${a}`);
		}
	}
	return drawn;
}

/** A leg written the way the chains carry it: `[lat, lng]` at both ends. */
const leg = (aLat: number, aLng: number, bLat: number, bLng: number) => {
	const a = `${aLat},${aLng}`;
	const b = `${bLat},${bLng}`;
	return a < b ? `${a} ${b}` : `${b} ${a}`;
};

describe('groupShapes outlines', () => {
	it('drops the border between two shapes of the same group', () => {
		const drawn = legs(outlines(row('bola-de-drac', 'bola-de-drac')));

		// The pair's outside, and nothing down the middle: one shape two cells wide.
		expect(drawn).toEqual(
			new Set([
				leg(40, 0, 40, 1),
				leg(40, 1, 40, 2),
				leg(40, 2, 41, 2),
				leg(41, 1, 41, 2),
				leg(41, 0, 41, 1),
				leg(40, 0, 41, 0)
			])
		);
	});

	it('keeps the border between two shapes of different groups', () => {
		const drawn = legs(outlines(row('bola-de-drac', 'shin-chan')));

		expect(drawn.has(leg(40, 1, 41, 1))).toBe(true);
		// Three legs of each cell's outside plus the one between them — drawn once and
		// not once per side, a border being one line on the map whoever it divides.
		expect(drawn.size).toBe(7);
	});

	it('outlines a group broken by another and not the break', () => {
		const drawn = legs(outlines(row('bola-de-drac', 'shin-chan', 'bola-de-drac')));

		// The two ends fly the same show and are still two shapes: they do not touch.
		expect(drawn.has(leg(40, 1, 41, 1))).toBe(true);
		expect(drawn.has(leg(40, 2, 41, 2))).toBe(true);
	});

	it('draws where a group meets ungrouped land but not around the land itself', () => {
		const drawn = legs(outlines(row('bola-de-drac', null)));

		// Where the show ends is drawn…
		expect(drawn.has(leg(40, 1, 41, 1))).toBe(true);
		// …and the show-less cell has no outline of its own: only the first cell's four.
		expect(drawn.size).toBe(4);
	});

	it('draws nothing where nothing is grouped', () => {
		expect(outlines(row(null, null))).toEqual([]);
		expect(groupShapes(null, () => 'bola-de-drac')).toEqual({ chains: [], runs: [] });
	});

	it('joins a group\'s legs into as few chains as it can', () => {
		const chains = outlines(row('bola-de-drac', 'bola-de-drac'));

		// Six legs round one shape, walked as one closed ring that comes back to its
		// first point rather than as six polylines.
		expect(chains).toHaveLength(1);
		expect(chains[0]).toHaveLength(7);
		expect(chains[0][0]).toEqual(chains[0][6]);
	});

	it('reads a MultiPolygon as the rings it is made of', () => {
		const collection: GeoJSON.FeatureCollection = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { id: 'islands', group: 'bola-de-drac' },
					geometry: {
						type: 'MultiPolygon',
						coordinates: [
							(cell(0, null).geometry as GeoJSON.Polygon).coordinates,
							(cell(2, null).geometry as GeoJSON.Polygon).coordinates
						]
					}
				}
			]
		};

		// Two rings that do not touch, so the group is two chains of four legs each.
		expect(legs(outlines(collection)).size).toBe(8);
	});
});

describe('groupShapes runs', () => {
	it('makes one run of shapes that touch and share a group', () => {
		expect(grouping(row('bola-de-drac', 'bola-de-drac')).runs).toEqual([
			{ group: 'bola-de-drac', members: [0, 1] }
		]);
	});

	it('makes a run each of shapes that share a group without touching', () => {
		// The same show either side of a third: two pieces of country, and two marks.
		expect(grouping(row('bola-de-drac', 'shin-chan', 'bola-de-drac')).runs).toEqual([
			{ group: 'bola-de-drac', members: [0] },
			{ group: 'shin-chan', members: [1] },
			{ group: 'bola-de-drac', members: [2] }
		]);
	});

	it('runs a chain of shapes joined one to the next', () => {
		const line = Array<string>(6).fill('bola-de-drac');
		expect(grouping(row(...line)).runs).toEqual([
			{ group: 'bola-de-drac', members: [0, 1, 2, 3, 4, 5] }
		]);
	});

	it('leaves ungrouped shapes out of every run', () => {
		expect(grouping(row(null, 'shin-chan', null)).runs).toEqual([
			{ group: 'shin-chan', members: [1] }
		]);
	});
});
