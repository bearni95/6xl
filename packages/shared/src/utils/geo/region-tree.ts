/**
 * Groups the flat municipality polygons into the map's nested divisions, drawn
 * red / yellow / green / blue: territory (red) → province (yellow) → comarca
 * (green) → municipality (blue). Built purely from `municipis.json`, whose every
 * feature carries its own `territory`, `prov` and `comarca` names, so no extra
 * layer is fetched.
 *
 * The province tier only appears where it genuinely subdivides a territory —
 * i.e. a territory with more than one entry in the `prov` field (the Spanish
 * provincias of País Valencià, and Catalunya's vegueries, which replace its four
 * provinces in the geo build). Territories with a single province (its name
 * mirrors the territory: Illes Balears, Catalunya Nord, Andorra, l'Alguer) skip
 * the tier and list their comarques directly. A handful of municipalities
 * (Andorra, l'Alguer) also have no comarca and hang directly off their parent.
 */

import type { RegionSiege } from './region-siege';
import { ArtificialColor, type RegionColor } from '../../types/region-color.type';

/** The trimmed show shape shown against a region: what a pin is lettered with. */
export interface RegionShow {
	id: number;
	name: string;
	posterUrl: string | null;
}

/** A single blue municipality — the leaf of the tree. */
export interface RegionMunicipality {
	id: string;
	name: string;
	/** The seeded show assigned to this municipality, when a lookup is given. */
	show?: RegionShow;
	/**
	 * The colour the municipality flies, when a lookup is given: its holder's lead
	 * colour, or the map's own grey while nobody has taken it (see
	 * `types/region-color.type`).
	 */
	color?: RegionColor;
}

/** A green comarca grouping the municipalities within it. */
export interface RegionComarca {
	/** Slug key, unique within its territory. */
	id: string;
	name: string;
	municipis: RegionMunicipality[];
	/** The most common show among this comarca's municipalities (simple count). */
	show?: RegionShow;
	/** The most common colour among this comarca's municipalities (simple count). */
	color?: RegionColor;
}

/** A yellow province: its comarques plus any comarca-less municipalities. */
export interface RegionProvince {
	id: string;
	name: string;
	comarques: RegionComarca[];
	/** Municipalities with no comarca, shown directly under the province. */
	municipis: RegionMunicipality[];
	/** Total municipalities in the province, across all comarques. */
	count: number;
	/** The most common show across every municipality in the province. */
	show?: RegionShow;
	/** The most common colour across every municipality in the province. */
	color?: RegionColor;
}

/**
 * A red territory. When it has more than one province, its subtree hangs off
 * `provincies` and `comarques`/`municipis` are empty; otherwise the province
 * tier is skipped and `comarques`/`municipis` carry the subtree directly.
 */
export interface RegionTerritory {
	id: string;
	name: string;
	/** Populated only for multi-province territories (Spanish provincias). */
	provincies: RegionProvince[];
	/** Comarques listed directly, when the territory has no province tier. */
	comarques: RegionComarca[];
	/** Comarca-less municipalities (Andorra, l'Alguer), shown directly. */
	municipis: RegionMunicipality[];
	/** Total municipalities under this territory, across everything within. */
	count: number;
	/** The most common show across every municipality in the territory. */
	show?: RegionShow;
	/** The most common colour across every municipality in the territory. */
	color?: RegionColor;
}

/**
 * A stable expand/collapse + fill key for a node, unique across the whole tree:
 * a territory is its own id; deeper tiers append their id to the parent's key.
 * The sidebar toggles these keys and the map reads them, so both agree on which
 * region a click opens and which poster a polygon shows.
 */
export function joinKey(parentKey: string, id: string): string {
	return `${parentKey}/${id}`;
}

/** The four region tiers, matching the map's red/yellow/green/blue divisions. */
export type RegionType = 'Territory' | 'Province' | 'Comarca' | 'Municipality';

/**
 * One region as a nestable node: its selection key (the same key the map images,
 * see buildFillIndex), tier, top show, and the child regions one tier deeper.
 * A territory's children are its provinces (or, where the province tier is
 * skipped, its comarques); a province's are its comarques + comarca-less
 * municipalities; a comarca's are its municipalities; a municipality is a leaf.
 */
export interface RegionNode {
	key: string;
	name: string;
	type: RegionType;
	show?: RegionShow;
	color?: RegionColor;
	children: RegionNode[];
}

/** Builds the nested region nodes from the tree, keyed to match the map fills. */
export function buildRegionNodes(territories: RegionTerritory[]): RegionNode[] {
	const municipalityNode = (municipality: RegionMunicipality): RegionNode => ({
		key: municipality.id,
		name: municipality.name,
		type: 'Municipality',
		show: municipality.show,
		color: municipality.color,
		children: []
	});

	const comarcaNode = (parentKey: string, comarca: RegionComarca): RegionNode => ({
		key: joinKey(parentKey, comarca.id),
		name: comarca.name,
		type: 'Comarca',
		show: comarca.show,
		color: comarca.color,
		children: comarca.municipis.map(municipalityNode)
	});

	return territories.map((territory) => {
		let children: RegionNode[];
		if (territory.provincies.length) {
			children = territory.provincies.map((province) => {
				const provinceKey = joinKey(territory.id, province.id);
				return {
					key: provinceKey,
					name: province.name,
					type: 'Province' as const,
					show: province.show,
					color: province.color,
					children: [
						...province.comarques.map((comarca) => comarcaNode(provinceKey, comarca)),
						...province.municipis.map(municipalityNode)
					]
				};
			});
		} else {
			children = [
				...territory.comarques.map((comarca) => comarcaNode(territory.id, comarca)),
				...territory.municipis.map(municipalityNode)
			];
		}
		return {
			key: territory.id,
			name: territory.name,
			type: 'Territory' as const,
			show: territory.show,
			color: territory.color,
			children
		};
	});
}

/**
 * What the whole map flies: the plurality show and colour over every municipality
 * node in the forest, counted and tie-broken exactly as each tier's own are (see
 * {@link majorityShow}), so the top view is read off the same towns the same way
 * every region under it is.
 *
 * The top view is the one place on the map with no region of its own — there is no
 * node for the Països Catalans entire, so the tier above the territories has
 * nothing baked onto it and is worked out here instead. Reading it off the built
 * nodes rather than off the source tree is what keeps it current: a town changing
 * hands rebuilds the nodes, and this re-tallies with them.
 */
export function everyTownPlurality(nodes: RegionNode[]): {
	show?: RegionShow;
	color?: RegionColor;
} {
	const towns: RegionNode[] = [];
	const walk = (node: RegionNode) => {
		if (node.type === 'Municipality') towns.push(node);
		for (const child of node.children) walk(child);
	};
	for (const node of nodes) walk(node);

	return { show: majorityShow(towns), color: majorityColor(towns) };
}

/**
 * One region flattened out of the tree for free-text search: its selection key,
 * name, tier, top show, the colour it is drawn in, and the ancestor region names
 * from the top territory down to (but not including) it.
 *
 * The colour is here because a match is drawn as the place itself — the same tile,
 * name and show a crumb or a listed sister gets (see the column beside the map) —
 * and a place's tile is its colour. Looking it back up by key would mean walking the
 * tree once per match to recover something the walk that produced the match had in
 * its hand.
 */
export interface RegionSearchEntry {
	key: string;
	name: string;
	type: RegionType;
	show?: RegionShow;
	color?: RegionColor;
	path: string[];
}

/**
 * Every region in the tree, at every tier, flattened for search. Each entry
 * carries the chain of ancestor names above it so a match can be shown in
 * context (e.g. a municipality under its comarca / province / territory).
 */
export function flattenRegionNodes(nodes: RegionNode[]): RegionSearchEntry[] {
	const entries: RegionSearchEntry[] = [];
	const walk = (node: RegionNode, ancestors: string[]) => {
		entries.push({
			key: node.key,
			name: node.name,
			type: node.type,
			show: node.show,
			color: node.color,
			path: ancestors
		});
		for (const child of node.children) walk(child, [...ancestors, node.name]);
	};
	for (const node of nodes) walk(node, []);
	return entries;
}

/**
 * The regions listed beside the map for the open one: what it divides into, one
 * tier down — the top territories when nothing is open at all.
 *
 * A municipality divides into nothing, and a column that emptied on the last step
 * of every drill would be a column that goes blank exactly when a place has been
 * arrived at. So a town lists its **sisters** instead: the whole level it is one of,
 * read off its own parent whatever tier that turns out to be — its comarca, or the
 * province or territory itself where the comarca tier is skipped (Andorra,
 * l'Alguer, and a territory whose provinces were never split). The open town is one
 * of them, so walking from sister to sister leaves the list where it stands.
 *
 * This is deliberately not {@link regionRowsForSelection}, which is the same
 * question asked by a table that drills exactly one tier per click and therefore
 * empties on a leaf.
 */
export function regionLevelNodes(nodes: RegionNode[], selected: string | null): RegionNode[] {
	if (!selected) return nodes;
	const path = nodePath(nodes, selected);
	const open = path.at(-1);
	// A key no node answers to is the top view, as it is everywhere else the tree is
	// asked about the selection.
	if (!open) return nodes;
	if (open.type !== 'Municipality') return open.children;
	return path.at(-2)?.children ?? nodes;
}

/** A row the sidebar table renders: one region at the current drill level. */
export interface RegionRow {
	key: string;
	name: string;
	type: RegionType;
	show?: RegionShow;
	/** Whether drilling into this region reveals a deeper level. */
	hasChildren: boolean;
	/**
	 * The reader's siege counter for this region — a municipality's own, or the sum
	 * of every municipality beneath a grouping (see buildRegionSieges).
	 */
	siege: RegionSiege;
}

/** The chain of nodes from a root territory down to `key`, or [] if not found. */
export function nodePath(nodes: RegionNode[], key: string): RegionNode[] {
	for (const node of nodes) {
		if (node.key === key) return [node];
		const below = nodePath(node.children, key);
		if (below.length) return [node, ...below];
	}
	return [];
}

/**
 * The rows the table shows: only the current level of view — the direct children
 * of the open region (the sub-regions the map is imaging), or the top territories
 * when nothing is open. Ancestors are reached through the breadcrumbs and the
 * open region's own siblings are never listed, so the table is a single flat
 * level that drills exactly one tier deeper on each click.
 */
export function regionRowsForSelection(
	nodes: RegionNode[],
	selected: string | null,
	sieges: ReadonlyMap<string, RegionSiege>
): RegionRow[] {
	// The open region's node (its last path entry); an unknown key falls back to
	// the top view. A leaf municipality has no children, so its level is empty.
	const open = selected ? nodePath(nodes, selected).at(-1) : null;
	const level = selected ? (open?.children ?? nodes) : nodes;
	return level.map((node) => ({
		key: node.key,
		name: node.name,
		type: node.type,
		show: node.show,
		hasChildren: node.children.length > 0,
		// Every node in the tree is in the siege map; a region built without one
		// (nothing loaded yet) simply reads as no progress against no towns.
		siege: sieges.get(node.key) ?? { wins: 0, required: 0 }
	}));
}

/** One tier a municipality can be painted at: its region's key + that show's poster. */
export interface FillLevel {
	key: string;
	url: string | null;
}

/**
 * Precomputes, for every municipality, the ordered chain of fill tiers from its
 * territory down to itself (territory → [province] → [comarca] → municipality).
 * The map walks this chain against the set of expanded keys to pick the poster:
 * the shallowest tier whose region is still collapsed (or the municipality's own
 * show once every ancestor is open). Keys match the sidebar's toggle keys.
 */
export function buildFillIndex(territories: RegionTerritory[]): Map<string, FillLevel[]> {
	const index = new Map<string, FillLevel[]>();

	const leaf = (municipality: RegionMunicipality): FillLevel => ({
		key: municipality.id,
		url: municipality.show?.posterUrl ?? null
	});

	for (const territory of territories) {
		const territoryLevel: FillLevel = { key: territory.id, url: territory.show?.posterUrl ?? null };

		const addComarca = (above: FillLevel[], comarcaKey: string, comarca: RegionComarca) => {
			const comarcaLevel: FillLevel = { key: comarcaKey, url: comarca.show?.posterUrl ?? null };
			for (const municipality of comarca.municipis) {
				index.set(municipality.id, [...above, comarcaLevel, leaf(municipality)]);
			}
		};

		if (territory.provincies.length) {
			for (const province of territory.provincies) {
				const provinceKey = joinKey(territory.id, province.id);
				const provinceLevel: FillLevel = {
					key: provinceKey,
					url: province.show?.posterUrl ?? null
				};
				const above = [territoryLevel, provinceLevel];
				for (const comarca of province.comarques) {
					addComarca(above, joinKey(provinceKey, comarca.id), comarca);
				}
				for (const municipality of province.municipis) {
					index.set(municipality.id, [...above, leaf(municipality)]);
				}
			}
		} else {
			for (const comarca of territory.comarques) {
				addComarca([territoryLevel], joinKey(territory.id, comarca.id), comarca);
			}
			for (const municipality of territory.municipis) {
				index.set(municipality.id, [territoryLevel, leaf(municipality)]);
			}
		}
	}

	return index;
}

/**
 * Picks the tier a municipality is painted at: the shallowest ancestor still
 * collapsed, or the municipality's own leaf once every ancestor is expanded.
 */
export function resolveFill(levels: FillLevel[], expanded: Set<string>): FillLevel {
	for (let i = 0; i < levels.length - 1; i++) {
		if (!expanded.has(levels[i].key)) return levels[i];
	}
	return levels[levels.length - 1];
}

/**
 * The ids of every municipality that sits under a given fill key — i.e. whose
 * ancestor chain (or leaf) carries that key. Used to frame the map on a region:
 * the map fits to the union of these municipalities' polygons. A municipality's
 * own id returns just itself.
 */
export function municipalityIdsForKey(
	index: Map<string, FillLevel[]>,
	key: string
): Set<string> {
	const ids = new Set<string>();
	for (const [id, levels] of index) {
		if (levels.some((level) => level.key === key)) ids.add(id);
	}
	return ids;
}

/**
 * The plurality show among a set of municipalities: the one held by the most of
 * them (simple count), ties broken by name for a stable pick. Municipalities
 * with no show are ignored.
 *
 * Takes the field and not the type, so the same count serves a tier being built
 * out of source municipalities and a tier being read back off built nodes (see
 * {@link everyTownPlurality}) — one rule for what a region flies, wherever the
 * towns under it are being counted from.
 */
function majorityShow(municipis: { show?: RegionShow }[]): RegionShow | undefined {
	const tally = new Map<number, { show: RegionShow; count: number }>();
	for (const municipality of municipis) {
		if (!municipality.show) continue;
		const entry = tally.get(municipality.show.id);
		if (entry) entry.count += 1;
		else tally.set(municipality.show.id, { show: municipality.show, count: 1 });
	}

	let best: { show: RegionShow; count: number } | undefined;
	for (const entry of tally.values()) {
		if (
			!best ||
			entry.count > best.count ||
			(entry.count === best.count && entry.show.name.localeCompare(best.show.name, 'ca') < 0)
		) {
			best = entry;
		}
	}
	return best?.show;
}

/**
 * The plurality colour among a set of municipalities — the colour flown by the
 * most of them, counted and tie-broken as {@link majorityShow} counts shows, with
 * one difference: the unheld grey is counted only where there is nothing else to
 * count. Municipalities with no colour at all (nothing rolled for them yet) are
 * ignored, as they are there.
 *
 * Grey is not a colour a region flies — it is the map saying nobody has taken this
 * (see `types/region-color.type`) — so it is not a candidate in a tally that has a
 * claim in it. A single town won inside a comarca of a hundred colours the whole
 * comarca, and its province and its territory above that, however heavily it is
 * outnumbered: what the coarse tiers are then saying is that somebody has been here,
 * and whose the most of what has been taken is. Counting grey like a team said the
 * opposite — a map that stayed grey entire until half a region had changed hands,
 * which is a conquest nobody can see from the zoom they conquered at.
 *
 * So grey survives exactly one case, and it is the honest one: every town under the
 * region is unheld, and the region is drawn as untouched country.
 *
 * The show tally is untouched by any of this — a show is what a place flies whether
 * or not anybody holds it, so every town of a region counts towards its show at
 * every tier (see {@link majorityShow}).
 */
function majorityColor(municipis: { color?: RegionColor }[]): RegionColor | undefined {
	const tally = new Map<RegionColor, number>();
	for (const municipality of municipis) {
		if (!municipality.color) continue;
		tally.set(municipality.color, (tally.get(municipality.color) ?? 0) + 1);
	}

	// Whether anything here is somebody's. Grey is one key like any other, so a tally
	// holding more than it — or holding something that is not it — has a claim in it.
	const claimed = tally.size > 1 || !tally.has(ArtificialColor.Gray);

	let best: { color: RegionColor; count: number } | undefined;
	for (const [color, count] of tally) {
		if (claimed && color === ArtificialColor.Gray) continue;
		if (!best || count > best.count || (count === best.count && color < best.color)) {
			best = { color, count };
		}
	}
	return best?.color;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ca');

/** Raw accumulator for one province before shows are attached and it's sorted. */
interface RawProvince {
	id: string;
	name: string;
	comarques: Map<string, RegionComarca>;
	municipis: RegionMunicipality[];
	count: number;
}

/**
 * Builds the territory → province → comarca → municipality tree from the
 * municipality GeoJSON. Territories are ordered by municipality count (largest
 * first, so Catalunya leads); every other tier is sorted by name.
 */
export function buildRegionTree(
	municipalities: GeoJSON.FeatureCollection | null | undefined,
	shows?: Map<string, RegionShow>,
	colors?: Map<string, RegionColor>
): RegionTerritory[] {
	if (!municipalities) return [];

	const territories = new Map<
		string,
		{ id: string; name: string; provinces: Map<string, RawProvince>; count: number }
	>();

	for (const feature of municipalities.features) {
		const props = feature.properties ?? {};
		const territoryName = String(props.territory ?? 'Unknown');
		const provinceName = String(props.prov ?? territoryName);
		const municipality: RegionMunicipality = {
			id: String(props.id ?? props.name ?? ''),
			name: String(props.name ?? 'Unknown')
		};

		let territory = territories.get(territoryName);
		if (!territory) {
			territory = { id: slugify(territoryName), name: territoryName, provinces: new Map(), count: 0 };
			territories.set(territoryName, territory);
		}
		territory.count += 1;

		let province = territory.provinces.get(provinceName);
		if (!province) {
			province = { id: slugify(provinceName), name: provinceName, comarques: new Map(), municipis: [], count: 0 };
			territory.provinces.set(provinceName, province);
		}
		province.count += 1;

		const comarcaName = props.comarca ? String(props.comarca) : null;
		if (!comarcaName) {
			province.municipis.push(municipality);
			continue;
		}

		let comarca = province.comarques.get(comarcaName);
		if (!comarca) {
			comarca = { id: slugify(comarcaName), name: comarcaName, municipis: [] };
			province.comarques.set(comarcaName, comarca);
		}
		comarca.municipis.push(municipality);
	}

	// A municipality carries what the lookups know about it: the show it flies and
	// the colour its team flies, both keyed by feature id and both optional, so a
	// tree built without them is exactly the bare tree.
	const withLookups = (municipality: RegionMunicipality): RegionMunicipality => {
		const show = shows?.get(municipality.id);
		const color = colors?.get(municipality.id);
		if (!show && !color) return municipality;
		return { ...municipality, ...(show ? { show } : {}), ...(color ? { color } : {}) };
	};

	// Resolve one raw province into its sorted comarques + direct municipalities.
	const resolveProvince = (raw: RawProvince) => {
		const comarques = [...raw.comarques.values()]
			.map((comarca) => {
				const municipis = comarca.municipis.map(withLookups).sort(byName);
				return {
					...comarca,
					municipis,
					show: majorityShow(municipis),
					color: majorityColor(municipis)
				};
			})
			.sort(byName);
		const municipis = raw.municipis.map(withLookups).sort(byName);
		const everyMunicipality = [...comarques.flatMap((comarca) => comarca.municipis), ...municipis];
		return { comarques, municipis, everyMunicipality };
	};

	return [...territories.values()]
		.map((territory) => {
			const rawProvinces = [...territory.provinces.values()];
			const everyMunicipality: RegionMunicipality[] = [];

			// Only the Spanish provincias (a territory with >1 province) get a
			// province tier; a lone province is redundant, so flatten it away.
			if (rawProvinces.length > 1) {
				const provincies = rawProvinces
					.map((raw) => {
						const { comarques, municipis, everyMunicipality: within } = resolveProvince(raw);
						everyMunicipality.push(...within);
						return {
							id: raw.id,
							name: raw.name,
							count: raw.count,
							comarques,
							municipis,
							show: majorityShow(within),
							color: majorityColor(within)
						};
					})
					.sort(byName);
				return {
					id: territory.id,
					name: territory.name,
					count: territory.count,
					provincies,
					comarques: [],
					municipis: [],
					show: majorityShow(everyMunicipality),
					color: majorityColor(everyMunicipality)
				};
			}

			const { comarques, municipis, everyMunicipality: within } = resolveProvince(rawProvinces[0]);
			return {
				id: territory.id,
				name: territory.name,
				count: territory.count,
				provincies: [],
				comarques,
				municipis,
				show: majorityShow(within),
				color: majorityColor(within)
			};
		})
		.sort((a, b) => b.count - a.count);
}
