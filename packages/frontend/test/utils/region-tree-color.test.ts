import { describe, expect, it } from 'vitest';
import { buildRegionTree, type RegionShow } from '$utils/geo/region-tree';
import { SpawnColor } from '$types/character-spawn.type';
import { ArtificialColor, type RegionColor } from '$types/region-color.type';

// One territory with a single province (so the province tier is flattened away)
// holding two comarques: three towns in the first, one in the second — enough for
// a comarca's plurality to disagree with the territory's.
const municipalities: GeoJSON.FeatureCollection = {
	type: 'FeatureCollection',
	features: ['ES_08019', 'ES_08073', 'ES_08187', 'ES_17079'].map((id, index) => ({
		type: 'Feature',
		geometry: { type: 'Point', coordinates: [0, index] },
		properties: {
			id,
			name: id,
			territory: 'Catalunya',
			prov: 'Catalunya',
			comarca: index < 3 ? 'Barcelonès' : 'Gironès'
		}
	}))
};

const show = (id: number, name: string): RegionShow => ({ id, name, posterUrl: null });

function tree(colors: Map<string, RegionColor>, shows?: Map<string, RegionShow>) {
	return buildRegionTree(municipalities, shows, colors);
}

describe('buildRegionTree colours', () => {
	it('hangs each municipality on the colour its lookup gives it', () => {
		const [catalunya] = tree(
			new Map([
				['ES_08019', SpawnColor.Red],
				['ES_17079', SpawnColor.Blue]
			])
		);
		const barcelones = catalunya.comarques.find((comarca) => comarca.name === 'Barcelonès')!;
		expect(barcelones.municipis.find((town) => town.id === 'ES_08019')?.color).toBe(SpawnColor.Red);
		// A town the lookup says nothing about carries no colour at all.
		expect(barcelones.municipis.find((town) => town.id === 'ES_08073')?.color).toBeUndefined();
	});

	it('compounds the plurality colour up every tier, as the show does', () => {
		const [catalunya] = tree(
			new Map([
				['ES_08019', SpawnColor.Red],
				['ES_08073', SpawnColor.Red],
				['ES_08187', SpawnColor.Green],
				['ES_17079', SpawnColor.Blue]
			])
		);
		const barcelones = catalunya.comarques.find((comarca) => comarca.name === 'Barcelonès')!;
		const girones = catalunya.comarques.find((comarca) => comarca.name === 'Gironès')!;
		expect(barcelones.color).toBe(SpawnColor.Red);
		// A lone town is its comarca's plurality outright.
		expect(girones.color).toBe(SpawnColor.Blue);
		// The territory counts towns, not comarques: two reds against one of each other.
		expect(catalunya.color).toBe(SpawnColor.Red);
	});

	it('ignores towns with no colour and breaks a tie the same way every time', () => {
		const [catalunya] = tree(
			new Map([
				['ES_08019', SpawnColor.Purple],
				['ES_08073', SpawnColor.Green]
			])
		);
		// One each, so the tie is broken by the colour itself — never by which town
		// happened to be walked first.
		expect(catalunya.color).toBe(SpawnColor.Green);
	});

	it('lets one claimed town outvote the grey it is outnumbered by', () => {
		const [catalunya] = tree(
			new Map<string, RegionColor>([
				['ES_08019', ArtificialColor.Gray],
				['ES_08073', ArtificialColor.Gray],
				['ES_08187', SpawnColor.Red],
				['ES_17079', SpawnColor.Blue]
			])
		);
		const barcelones = catalunya.comarques.find((comarca) => comarca.name === 'Barcelonès')!;
		// Two of the three towns are nobody's, and the third's red is what the comarca
		// flies anyway: grey is not a team, so it is no candidate beside one.
		expect(barcelones.color).toBe(SpawnColor.Red);
		// And above it, where the reds and the blues are one each — the tie broken by the
		// colour itself, with the two greys under them counting for nothing.
		expect(catalunya.color).toBe(SpawnColor.Blue);
	});

	it('keeps the grey where every town under the region is unheld', () => {
		const [catalunya] = tree(
			new Map<string, RegionColor>([
				['ES_08019', ArtificialColor.Gray],
				['ES_08073', ArtificialColor.Gray],
				['ES_08187', ArtificialColor.Gray],
				['ES_17079', ArtificialColor.Gray]
			])
		);
		const barcelones = catalunya.comarques.find((comarca) => comarca.name === 'Barcelonès')!;
		expect(barcelones.color).toBe(ArtificialColor.Gray);
		expect(catalunya.color).toBe(ArtificialColor.Gray);
	});

	it('leaves every tier colourless when nothing is known yet', () => {
		const [catalunya] = tree(new Map(), new Map([['ES_08019', show(1, 'One Piece')]]));
		expect(catalunya.color).toBeUndefined();
		expect(catalunya.comarques.every((comarca) => comarca.color === undefined)).toBe(true);
		// The shows still land, colours and shows being independent lookups.
		expect(catalunya.show).toEqual(show(1, 'One Piece'));
	});
});
