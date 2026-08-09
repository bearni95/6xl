<script lang="ts">
	import classNames from 'classnames';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import { forShow } from '$utils/show/show-icon';
	import { showGlyphs } from '$services/shows.service';

	// The mark this map says a place with: a 32px tile in the place's own colour with the glyph
	// of the show it flies on it. The pins wear it, the crumbs wear it, the column beside the
	// map wears it down every row — one square, so that a place is recognisable wherever it is
	// drawn.
	//
	// Split out of MapBreadcrumb, back when the tile was not always inside the crumb: the row
	// naming the open place stood it outside the crumb's button so the radio's play/pause could
	// come up on it, a button inside a button not being markup. The radio is the last line of the
	// pin standing on the open place now (see TownRadio) and every crumb carries its own tile
	// again — but the split stays, because
	// the pins and the crumbs have to keep drawing the one square, and that is a component
	// rather than four lines copied into a second place.
	//
	// Decorative throughout: everywhere this stands, the show it names is written beside it.

	// The show whose glyph goes on it. Null, or a show with no glyph picked in the admin, leaves
	// the tile empty rather than reaching for a placeholder mark — there is deliberately none.
	export let showId: number | null = null;
	// The tile's fill plus the ink that reads on it — the place's own colour, in the same six the
	// pins, the cards and the town panel paint with. Null leaves it on the neutral surface, which
	// is what a tier with nothing rolled under it yet gets.
	export let tileClasses: string | null = null;
	export let classes: string = '';

	$: showIcon = forShow($showGlyphs, showId);
</script>

<!-- A span rather than a div: a crumb above the current one is wrapped in a `<button>`, whose
	content model is phrasing only, so everything a crumb is made of is spans throughout.
	Nothing at all when there is neither a colour to paint nor a glyph to carry — an empty
	square says nothing, and a row of them says it down the whole column. The glyph is sized
	through ShowIcon rather than from here, since that component wraps the svg in a span of its
	own that a rule aimed at this one's children would never reach; `currentColor` is what the
	tile's ink gives it. -->
{#if tileClasses || showIcon}
	<span
		class={classNames(
			'flex size-8 flex-none items-center justify-center rounded-md',
			tileClasses ?? 'bg-base-100 text-base-content',
			classes
		)}
		aria-hidden="true"
	>
		{#if showIcon}
			<ShowIcon markup={showIcon} classes="[&>svg]:size-5" />
		{/if}
	</span>
{/if}
