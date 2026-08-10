<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { _ } from 'svelte-i18n';
	import RegionListRow from '$components/core/RegionListRow.svelte';
	import {
		REGION_ROW_BOX_WIDTH,
		REGION_TYPE_KEYS,
		type RegionRow
	} from '$components/core/region-types';
	import type { RegionType } from '$utils/geo/region-tree';

	// The list of places, and nothing else: what the open region divides into, or what a search
	// has turned up in its place. It was the scrolling half of the column that stood beside the
	// map; then it was painted over the terrain, as the second of that column's three tabs; and
	// it is now a tab of the block UNDER the map, beside the open town and that town's box (see
	// +page.svelte's `townTab`) — a list of names being an answer to what is at the open place
	// rather than a picture of the level, which is what the tabs left over the terrain were.
	// The shares row it was headed by and the field that fills it stayed up on the map for a
	// while and have come down after it: they are the two rows directly above this one again,
	// since a press that hides rows and a press that replaces them belong on the box they edit.

	// What the open region divides into (see regionLevelNodes), already lettered by the caller —
	// and already without the head among them, since the caller is what tallies the shares over
	// exactly these rows.
	export let rows: RegionRow[] = [];
	// The place the map is open on. Only ever read to mark it where it falls among its sisters,
	// which only a town is: no coarser region is one of its own subdivisions.
	export let current: RegionRow | null = null;
	// Every place on the map matching what is typed in the field above this list, lettered
	// exactly as `rows` are and carrying the tier each one is, which is what they are grouped
	// under. The search is the caller's — the tree is theirs and so is the matching — and while
	// there is a query these stand here in place of the level: a search is a list of places, and
	// this is where this map lists places.
	export let searchRows: (RegionRow & { type: RegionType })[] = [];
	// What is being looked for. Read rather than bound: the field itself stands on the row above
	// this list, and this list only has to know whether it is answering a question or drawing a
	// level.
	export let searchQuery: string = '';
	// The show the list is being read through, picked off the shares row above it. Handed in
	// rather than held here because the press that sets it is up there, and null is the whole
	// level.
	export let activeShow: number | null = null;
	export let classes: string = '';

	// Picking one is picking a region, which is the map's own gesture and not this list's: the
	// page answers it exactly as it answers a pin or a crumb.
	const dispatch = createEventDispatcher<{ select: { key: string } }>();

	// The rows as they are drawn: all of them, or the ones flying the picked show. The shares
	// row that picked it is deliberately left whole — it is the division of the level, and a
	// division recomputed over a filtered list would say 100% of one show the moment one was
	// picked, which is the reader's own press read back to them as a fact about the map.
	$: visibleRows = activeShow === null ? rows : rows.filter((row) => row.showId === activeShow);

	// Whether the list is showing what a search turned up instead of the level: a query, and not
	// the field being out. An empty field is somebody about to type, and the level is what they
	// were reading a moment ago.
	$: searching = searchQuery.trim().length > 0;

	// The tiers a search is grouped under, finest first. A place people look for by name is
	// nearly always a town — it is the tier there are thousands of and the only one anybody
	// lives in — so the towns are the answer and everything coarser is context under it. The
	// same order the drill runs in, read upwards.
	const SEARCH_TIERS: RegionType[] = ['Municipality', 'Comarca', 'Province', 'Territory'];

	// The matches under their tiers, and only the tiers that caught something: a heading over
	// nothing is the list saying it has an answer of that kind when it has not.
	$: searchGroups = SEARCH_TIERS.map((type) => ({
		type,
		rows: searchRows.filter((row) => row.type === type)
	})).filter((group) => group.rows.length > 0);
</script>

<!-- White ink, as on the bar and as in the column this came out of: a crumb letters what it
	flies in white at 70% and is drawn to be read over the map's own surface.

	Each row is a block and not a flex box, so the crumb's own span fills the width and the name
	truncates against it.

	It scrolls, and it is the only thing here that does: a comarca of forty towns is a longer
	list than the window, and it is given a height to divide rather than a run of rows as tall as
	its contents (see the `min-h-0` the caller hands it). `min-h-0` is what lets it be shorter
	than its own contents — a flex item is floored at its content height without it, which is a
	box that scrolls the page instead of itself. The side padding is the one the shares row
	above it carries, so the head and the rows under it read as one column and not two boxes
	stacked. -->
<div
	class={classNames('flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-2 text-white', classes)}
>
	{#if searching}
		<!-- What the search turned up, in place of the level: a search is a list of places, and
			this is where this map lists places, so the matches are the very rows the level is drawn
			with rather than cards on a plate of their own.
			Under their tiers, finest first: a name typed into that field is nearly always a town's,
			so the towns are the answer and everything coarser is context under it. Each tier is a
			fold, open as it arrives — the reader asked for these, so nothing is hidden to begin
			with — and shut for the ones they are not looking at. `<details>` because that is what a
			fold is in a document: it remembers its own state, it is keyboard-operable and it needs
			nothing held here. -->
		{#each searchGroups as group (group.type)}
			<details open class="group">
				<summary
					class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/10 [&::-webkit-details-marker]:hidden"
				>
					<!-- The one mark a fold needs: which way it is facing. Turned by the group's own
						open state rather than by anything held in the script. -->
					<span class="text-base leading-none transition-transform group-open:rotate-90">›</span>
					<span>{$_(REGION_TYPE_KEYS[group.type])}</span>
					<span class="opacity-60 tabular-nums">{group.rows.length}</span>
				</summary>
				<!-- Two to a line, as the level below is: what is under a tier's heading is the same
					kind of thing listed the same way, and a search that answered in one column while
					the level answers in two would read as a different list rather than as the same
					list of places asked a question. -->
				<div class="grid grid-cols-2 gap-0.5">
					{#each group.rows as row (row.key)}
						<RegionListRow
							{row}
							current={row.key === current?.key}
							marked={row.key === current?.key}
							boxWidth={REGION_ROW_BOX_WIDTH}
							onSelect={(key) => dispatch('select', { key })}
						/>
					{/each}
				</div>
			</details>
		{:else}
			<p class="px-2 py-4 text-center text-xs opacity-60">{$_('map.search.empty')}</p>
		{/each}
	{:else}
		<!-- The level itself: every place the open region divides into, or the ones flying the show
			picked on the shares row above. The row that is the place the map is open on
			takes the fill, so it can be found among its sisters without being counted along them —
			only a town is ever among its own level, so there is at most one of them.
			Two to a line at every width (`grid-cols-2`), and not a column that becomes two on a
			wide screen: a comarca is forty towns and a province several hundred, and a single file
			of them is a scroller a reader drags through to find one name. Two columns halve that
			run at every size, and the entries are short — a tile, a name, the show under it — so
			half a panel is a box a name fits in rather than one it is cut to. Reading order is
			unchanged: a grid fills its first row before its second, so the names still run in the
			order they were handed over, left to right and then down.
			`gap-0.5` in both directions, which is the gap the run of rows already had between
			them — the same list, folded, and not a table of cards. -->
		<div class="grid grid-cols-2 gap-0.5">
			{#each visibleRows as row (row.key)}
				<RegionListRow
					{row}
					current={row.key === current?.key}
					marked={row.key === current?.key}
					boxWidth={REGION_ROW_BOX_WIDTH}
					onSelect={(key) => dispatch('select', { key })}
				/>
			{/each}
		</div>
	{/if}
</div>
