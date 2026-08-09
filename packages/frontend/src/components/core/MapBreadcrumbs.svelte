<script lang="ts">
	import classNames from 'classnames';
	import { afterUpdate, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import MapBreadcrumb from '$components/core/MapBreadcrumb.svelte';
	import MapGlyph from '$components/core/MapGlyph.svelte';

	// Where the map is looking. What the crumbs name is the view — the region the map is
	// framed on, walked into from a pin, a crumb or the zoom — so they belong beside the
	// thing they are about. It was a bar across the top of the map itself for that reason,
	// and it is one square at the head of the row laid along the map's bottom edge now, standing
	// next to the badge naming the open place: what the only path left letters is the cut ABOVE
	// that place (see +page.svelte's `aboveCrumbs`), a cut belongs beside its place, and the
	// place itself is the badge's to name (see `dotsOnly`).
	//
	// The bar wears the panel's own surface rather than the plates' black: the crumbs head
	// the map the way the panel heads its column, so the two read as one chrome. It is
	// still a plate and not a caption laid on the imagery — 80% of that surface, so the
	// terrain shows through without the lettering ever having to be read off it.
	//
	// Each step is drawn the way the town panel draws the town it is open on — tile, place,
	// show — see MapBreadcrumb. Naming a place on this map and naming its show are one
	// statement, and this is the line already saying which place.
	//
	// A path that does not fit the row it is given is not scrolled sideways but collapsed:
	// the step the map is on, and beside it a button that drops the whole path down as a
	// column (see below). Sideways scrolling hid the crumb that matters most — the end of the
	// path is where a bar this long starts you off, so the head of it was the part out of
	// view, and reading the path meant dragging a strip of it past a fixed window.

	// The path from the top view down to the open region, root first. The last crumb is
	// where the map is and is not a link; every one before it walks back up to its tier.
	//
	// Each crumb also carries the show its place flies and the colour that place is drawn
	// in, which every step has — a town's own, above it the plurality of the towns under
	// it, and at the head of the path the plurality of the whole map. The caller decides
	// what those are (a held town flies its ruling team's show, not its own most-seen one);
	// this bar just letters whatever it is handed.
	//
	// The path is a ladder of fixed positions and not just the steps that exist: every tier
	// the map divides into has a place in the row whether or not the view has reached it, and
	// whether or not the place being looked at has that tier at all (Andorra and l'Alguer have
	// no comarca; the territories with one province skip that tier). A position with no step
	// in it is drawn as an outlined square where the crumb would have been — the same square
	// the buttons at either end of this bar are drawn in — and it is pressed for the one thing
	// a tier with no place in it can still say: take the map to the zoom that tier is read at.
	// Which is why the square carries a map: there is no place to name and no show to fly, so
	// what it holds is the thing it is about, and an empty square lettered nothing at all read
	// as a crumb that had failed to load rather than as a rung still to be walked to.
	// So the tier below the view is reachable from the row rather than only the ones already
	// walked into — that tier and no other: the row is the path walked so far plus a single
	// square for the rung after it (see `rungs`), since the rung after next cannot be walked to
	// before the next one is, and a tier this place skips is a gap in the path rather than a
	// step in it.
	export let crumbs: {
		label: string;
		key: string | null;
		showName?: string | null;
		showId?: number | null;
		tileClasses?: string | null;
		/** A position with no region in it: drawn as the outlined square, pressed for `onZoom`. */
		empty?: boolean;
		/** The tier that position stands for — what the empty square is labelled by. */
		tier?: string;
		/**
		 * The step the map is on, and still a way of going somewhere: pressed for `onSelect`
		 * like every step above it, rather than being the inert end of the path. For the crumb
		 * whose place the map can be moved off while the bar goes on naming it — a picked town,
		 * which the bar holds however far the view then wanders — so pressing it is the way
		 * back to the place it names. The caller says which crumb that is; only the last one
		 * is ever asked.
		 */
		pressable?: boolean;
	}[] = [];
	export let onSelect: (key: string | null) => void;
	// What an empty position does: the tier it stands for, handed back for the caller to zoom
	// to. Never called for a crumb that names a region — that one is `onSelect`, as before.
	export let onZoom: (tier: string) => void = () => {};
	// Folded whatever the room: the bar is the dots button and the step it is on, and never the
	// path laid out, however much width it is given. Nothing asks for this on its own any more —
	// the one caller left asks for `dotsOnly`, which is this and then some — but it is what that
	// one is built on, and it is the honest answer wherever a path is stood somewhere too narrow
	// to lay one out. The whole path is still a press away, in the dropped column.
	export let folded: boolean = false;
	// Folded all the way down to the dots: no crumb kept beside them, no plate under them, just
	// the square and the column it drops. For the one caller there is, which stands it at the head
	// of the row along the map's bottom edge: the crumb a folded bar would keep is the same tile
	// and name the badge in the very next cell of that row prints (see
	// RegionCurrentBadge, drawn out of the same fields by the same component), so keeping one
	// here is that tile printed twice an inch apart — a duplicate and not a shorter path. What
	// is left is the way UP and nothing else, which is the only thing the badge cannot say.
	// No plate because whether one is wanted depends on what it is stood on, which the caller
	// knows and this does not: on a row that already carries one a frame round a single button is
	// a second frame, on a row of plates it takes the plate its neighbours wear, and laid straight
	// over terrain it needs a surface of its own to keep an outlined square legible. So `classes`
	// is where the surface comes from, if it comes at all — and for the caller there is, it does
	// not.
	export let dotsOnly: boolean = false;
	// Which way the column comes out. A path drops DOWN by default, that being where the room is
	// under a bar at the top of something. The one caller left stands the dots on a row laid along
	// the FOOT of the map, where down is off the bottom edge and then off the page — so it says so,
	// and the column comes up out of the row instead. It is the same column either way; only the
	// edge it is pinned to and the side the gap is on change.
	export let dropUp: boolean = false;
	export let classes: string = '';

	// Never anything but folded once the crumb is off: there is nothing left to lay out.
	$: foldedRow = folded || dotsOnly;

	// The square an empty position is drawn in, and the two buttons at the ends of this bar
	// with it: a line of 32px tiles, so everything on the row that is pressed rather than read
	// is the same square, told apart by being a rule around empty rather than a fill. The
	// colours are spelled out because an outlined DaisyUI button letters itself in the theme's
	// periwinkle, a stray colour on a bar that forces white over terrain, and its hover fills
	// the square and takes the rule with it.
	const squareClasses =
		'btn btn-square btn-outline btn-sm flex-none border-white/60 text-white hover:border-white hover:bg-white/10 hover:text-white';

	// Whether the whole path fits the share of the row left over after the `end` slot has
	// taken its width. Measured, not guessed at: how wide a path is depends on how many tiers
	// deep it goes and on the lengths of names nobody here chooses.
	let overflows = false;
	// And whether it is drawn folded, which is that or the caller having asked for it outright.
	$: collapsed = foldedRow || overflows;
	// Whether the collapsed path has been dropped open. Only ever true while collapsed —
	// a bar wide enough for the path has nothing to drop.
	let expanded = false;

	// The row's share for the crumbs, and inside it a copy of the whole path laid out at its
	// natural width but never drawn. The copy is what gets measured: measuring the visible
	// crumbs would ask the collapsed row whether it fits, which it always does, and the bar
	// would flip between the two states forever. The copy is the same markup in the same
	// scroller, so the width it reports is the width the path would really take.
	let trackEl: HTMLElement | null = null;
	let probeEl: HTMLElement | null = null;
	let wrapperEl: HTMLElement | null = null;
	let observer: ResizeObserver | null = null;

	function measure() {
		// Nothing to measure on a bar that is folded whatever the answer would be — the copy it
		// would have been measured against is not even laid out (see below).
		if (!probeEl) return;
		// The scroller's own overflow, a pixel of slack against fractional layout widths.
		overflows = probeEl.scrollWidth > probeEl.clientWidth + 1;
	}

	// The track changing width is the other half of it — the map column resizing, or the
	// search box beside the crumbs growing at a breakpoint. Crumb changes are caught by
	// afterUpdate instead, since the probe is stretched to the track and so does not itself
	// resize when the path it holds gets longer.
	function watch(track: HTMLElement) {
		observer?.disconnect();
		observer = new ResizeObserver(() => measure());
		observer.observe(track);
		measure();
	}

	$: if (trackEl) watch(trackEl);

	afterUpdate(measure);
	onDestroy(() => observer?.disconnect());

	// Nothing to be dropped open once the path fits again.
	$: if (!collapsed) expanded = false;

	// The step the map is on: the one crumb the collapsed row keeps. The last position that
	// names a region, not the last position — the ladder's tail is empty squares whenever the
	// map has not drilled to the bottom, and a row folded down to one thing keeps the thing
	// that says where you are. The squares it drops are in the column the dots button opens.
	$: lastCrumb = [...crumbs].reverse().find((crumb) => !crumb.empty);

	// The ladder as it is drawn: every step that names a place, and exactly one square — the
	// position straight after the last of those, when there is one. An empty position is only
	// ever worth drawing as the next rung down: two of them side by side are two ways of
	// pressing the same idea, and the finer takes the map to a zoom nothing has been walked
	// into yet, while one sandwiched between two named places is a tier this place does not
	// have (Andorra and l'Alguer have no comarca) — a gap in the path rather than a step in
	// it, and a square standing for a tier that will never hold anything here is a rung
	// offering to take the map somewhere it has already gone past. So the row is the path
	// walked so far plus the one rung after it, and nothing else.
	$: lastFilled = crumbs.reduce((last, crumb, index) => (crumb.empty ? last : index), -1);
	$: rungs = crumbs.filter((crumb, index) => !crumb.empty || index === lastFilled + 1);

	// The path as the dropped column reads it: the steps that name a place, and no square. The
	// square is a rung of the row — it stands where a crumb would have been, so the row keeps
	// its rhythm as the map drills, and it is pressed to zoom to a tier nothing has been walked
	// into. A column has no such rhythm to keep, and a line down it holding a mark and no name
	// is a place the reader is being offered without being told which: the whole point of
	// dropping the path is reading the names that would not fit. What that square offers is on
	// the row itself, which is up whenever this column is.
	$: dropped = rungs.filter((crumb) => !crumb.empty);

	function pick(key: string | null) {
		expanded = false;
		onSelect(key);
	}

	function zoomTo(tier: string) {
		expanded = false;
		onZoom(tier);
	}

	// The column stands over the map, so a press anywhere else is a press on something the
	// panel is covering: it closes rather than being clicked through.
	function handleWindowPointerDown(event: MouseEvent) {
		if (!expanded || !wrapperEl) return;
		if (!wrapperEl.contains(event.target as Node)) expanded = false;
	}
</script>

<svelte:window
	on:pointerdown={handleWindowPointerDown}
	on:keydown={(event) => {
		if (event.key === 'Escape') expanded = false;
	}}
/>

<!-- The bar is as wide as the map, and it is a row: the crumbs on the left, and at its far
	end whatever the `end` slot puts there — the one place on the map that is about where the
	map is looking, so a way of naming a place belongs at the end of the path to one.
	`relative` because two things hang off this row: the invisible copy of the path that is
	measured, and the column the dots button drops. -->
<div bind:this={wrapperEl} class={classNames('relative', classes)}>
	<!-- The plate is the bar's, not the button's: a row of crumbs is read against whatever is
		behind it and so carries a surface, and `dotsOnly` is not a row — it is one outlined
		square, whose surface is the caller's to give it or withhold (see the prop), since what
		it wants depends entirely on what it has been stood on. -->
	<div
		class={classNames(
			'flex items-center text-white',
			dotsOnly ? 'gap-0' : 'gap-3 rounded-lg bg-base-100/80 px-3 py-1.5 shadow-xl'
		)}
	>
		<!-- `min-w-0` is what lets this share shrink to whatever the `end` slot leaves it,
			which is the width the path is measured against. Nothing to shrink or stretch when the
			bar is the button alone. -->
		<div bind:this={trackEl} class={classNames('relative', { 'min-w-0 flex-1': !dotsOnly })}>
			<!-- The path at its natural width, in a scroller stretched to the track: laid out, so
				it can be measured, and hidden, so it is never read. `invisible` and not `hidden`
				— a box with no layout has no width to report. Not laid out at all for a bar that
				is folded whichever way the measurement comes out: laying out a path nobody can be
				shown, on every update, to answer a question already answered. -->
			{#if !foldedRow}
				<div
					bind:this={probeEl}
					class="breadcrumbs pointer-events-none invisible absolute inset-0 py-0 text-sm"
					aria-hidden="true"
				>
					<ul>
						{#each rungs as crumb}
							<li>
								{#if crumb.empty}
									<span class={squareClasses}><MapGlyph /></span>
								{:else}
									<MapBreadcrumb
										label={crumb.label}
										showName={crumb.showName ?? null}
										showId={crumb.showId ?? null}
										tileClasses={crumb.tileClasses ?? null}
									/>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if collapsed}
				<!-- Collapsed: the button that holds the rest of the path, and then the step the map
					is on. The button is to its left because that is where the path it stands for was —
					it is the head of the row folded into one mark, not a menu appended to the end.
					Drawn as an outlined square the size of a crumb's tile: the row it stands in is a
					line of 32px tiles, so the one thing here that is pressed rather than read is given
					the same square and told apart by being a rule around empty rather than a fill.
					DaisyUI's square and its 32px are taken as they come; its colours are not — an
					outline button letters itself in `base-content`, the theme's periwinkle, which on a
					bar that forces white over terrain reads as a stray colour, and its hover fills the
					square with the surface and takes the rule with it, so the mark loses the very thing
					it is. White at 60%, brightening to white on a wash of it — the same answer to the
					pointer the crumbs beside it give. -->
				<div class="flex items-center gap-2">
					<button
						type="button"
						class={squareClasses}
						aria-expanded={expanded}
						aria-label="Show the whole path"
						on:click={() => (expanded = !expanded)}
					>
						<svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
							<circle cx="12" cy="5" r="2" />
							<circle cx="12" cy="12" r="2" />
							<circle cx="12" cy="19" r="2" />
						</svg>
					</button>
					<!-- The one step kept, in whatever the button leaves of the row, and cut short with
						an ellipsis if even that is not enough: there is no longer path to fold away, so
						the alternative is a name running out under the search box beside it. The whole
						of it is a press away, in the column.
						Not kept at all under `dotsOnly`: the crumb it would print is the same tile and
						the same name the badge two inches away is already printing (see the prop). -->
					{#if dotsOnly}
						<!-- nothing beside the dots -->
					{:else if lastCrumb?.pressable}
						<button
							type="button"
							aria-current="page"
							class="-mx-1 min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-white/10"
							on:click={() => pick(lastCrumb?.key ?? null)}
						>
							<MapBreadcrumb
								label={lastCrumb.label}
								showName={lastCrumb.showName ?? null}
								showId={lastCrumb.showId ?? null}
								tileClasses={lastCrumb.tileClasses ?? null}
								current
								truncated
							/>
						</button>
					{:else}
						<div aria-current="page" class="min-w-0 flex-1">
							<MapBreadcrumb
								label={lastCrumb?.label ?? ''}
								showName={lastCrumb?.showName ?? null}
								showId={lastCrumb?.showId ?? null}
								tileClasses={lastCrumb?.tileClasses ?? null}
								current
								truncated
							/>
						</div>
					{/if}
				</div>
			{:else}
				<div class="breadcrumbs py-0 text-sm">
					<ul>
						{#each rungs as crumb}
							<li>
								{#if crumb.empty}
									<!-- A position with no region in it — a tier this place does not have, or one
										the map has not drilled to yet. The square stands where the crumb would have
										been, and pressing it takes the map to the zoom that tier is read at. -->
									<button
										type="button"
										class={squareClasses}
										title={crumb.tier ?? ''}
										aria-label={crumb.tier ? `Zoom to ${crumb.tier}` : 'Zoom to this tier'}
										on:click={() => zoomTo(crumb.tier ?? '')}
									>
										<MapGlyph />
									</button>
								{:else if crumb === lastCrumb && crumb.pressable}
									<!-- The step the map is on, pressed like the steps above it: the view can be
										taken off the place while the bar goes on naming it, so there is somewhere
										for it to go after all — back to what it names. It keeps `aria-current`,
										since it is still where you are, and it answers the pointer the way the
										crumbs above it do. -->
									<button
										type="button"
										aria-current="page"
										class="-mx-1 rounded-md px-1 py-0.5 hover:bg-white/10 hover:no-underline"
										on:click={() => pick(crumb.key)}
									>
										<MapBreadcrumb
											label={crumb.label}
											showName={crumb.showName ?? null}
											showId={crumb.showId ?? null}
											tileClasses={crumb.tileClasses ?? null}
											current
										/>
									</button>
								{:else if crumb === lastCrumb}
									<!-- The step the map is on. `aria-current` and not a control: it is where you
										already are, so there is nowhere for it to go — which is also why it undoes
										DaisyUI's `cursor: pointer`, put on every child of an `li` on the assumption
										that a crumb is a link. -->
									<span aria-current="page" class="cursor-default hover:no-underline">
										<MapBreadcrumb
											label={crumb.label}
											showName={crumb.showName ?? null}
											showId={crumb.showId ?? null}
											tileClasses={crumb.tileClasses ?? null}
											current
										/>
									</span>
								{:else}
									<!-- A step back up the path. Not underlined on hover, which is what DaisyUI does
										to a crumb and what the `link` class here used to add on top: an underline drawn
										across a tile and two lines of type reads as a rule struck through the crumb
										rather than as a word that can be pressed. What answers the pointer is the crumb
										lifting onto a surface of its own instead. -->
									<button
										type="button"
										class="-mx-1 rounded-md px-1 py-0.5 hover:bg-white/10 hover:no-underline"
										on:click={() => pick(crumb.key)}
									>
										<MapBreadcrumb
											label={crumb.label}
											showName={crumb.showName ?? null}
											showId={crumb.showId ?? null}
											tileClasses={crumb.tileClasses ?? null}
										/>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Never squeezed by the path: the crumbs are what gives way, since they collapse and
			an input cannot. -->
		{#if $$slots.end}
			<div class="flex-none">
				<slot name="end" />
			</div>
		{/if}
	</div>

	{#if collapsed && expanded}
		<!-- The path root first, down a single column: what a row could not hold in one line it
			holds in as many lines as there are steps — every step that names a place, and only
			those (see `dropped`). It slides out from under the bar — or out of the top of it, where
			the bar is stood on the map's own bottom edge and under it is off the page (see `dropUp`)
			— and stands over the map rather than pushing the plates around it aside: the column is
			the bar being read, not another plate in the stack, and the corner underneath it is
			where you were before you asked. Its own width, not the bar's: a column of place
			names is as wide as the longest of them. The one surface here not let through: the bar
			can be 80% of itself because a crumb or two is read against terrain, but a column of
			five is read against whatever plate it has come down on top of.
			The cap is the viewport's and NOT this element's own box, which is what `max-w-full`
			made it: that reads against the wrapper, and under `dotsOnly` the wrapper is one
			square — so a column of town names was being held to the width of the button that
			dropped it and coming down as a stack of two-letter shreds. Nothing about how wide the
			press is says anything about how wide a place name is. What a column of names must not
			do is run off the screen, so that is what is written down. -->
		<div
			transition:slide={{ duration: 200 }}
			class={classNames(
				'absolute left-0 z-10 flex w-max max-w-[75vw] flex-col gap-0.5 overflow-hidden rounded-lg bg-base-100 p-2 text-white shadow-xl',
				dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
			)}
		>
			{#each dropped as crumb}
				{#if crumb === lastCrumb && crumb.pressable}
					<button
						type="button"
						aria-current="page"
						class="rounded-md px-2 py-1 text-left hover:bg-white/10"
						on:click={() => pick(crumb.key)}
					>
						<MapBreadcrumb
							label={crumb.label}
							showName={crumb.showName ?? null}
							showId={crumb.showId ?? null}
							tileClasses={crumb.tileClasses ?? null}
							current
						/>
					</button>
				{:else if crumb === lastCrumb}
					<span aria-current="page" class="rounded-md px-2 py-1">
						<MapBreadcrumb
							label={crumb.label}
							showName={crumb.showName ?? null}
							showId={crumb.showId ?? null}
							tileClasses={crumb.tileClasses ?? null}
							current
						/>
					</span>
				{:else}
					<button
						type="button"
						class="rounded-md px-2 py-1 text-left hover:bg-white/10"
						on:click={() => pick(crumb.key)}
					>
						<MapBreadcrumb
							label={crumb.label}
							showName={crumb.showName ?? null}
							showId={crumb.showId ?? null}
							tileClasses={crumb.tileClasses ?? null}
						/>
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
