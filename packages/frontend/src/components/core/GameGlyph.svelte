<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { loadIconMarkup } from '$services/icons.service';

	// One vendored mark, named the way the icon sets store it: `<folder>/<slug>`,
	// e.g. `delapouite/truce`.
	//
	// Where a show's glyph is authored and therefore arrives through the `showGlyphs`
	// store, this is for the marks the app itself picks — a control whose whole label
	// is a picture. Same loader underneath, so a mark drawn here and the same mark
	// drawn on a show are one fetch.
	//
	// Inlined and not an `<img>`: the game-icons.net set is vendored as white artwork
	// for a canvas to tint (see CLAUDE.md), which inside an `<img>` on a dark plate is
	// white on white. `loadIconMarkup` turns that white into `currentColor`, so the
	// mark is painted in the colour of whatever it sits in — which is what lets the
	// caller colour it with a text class like any other piece of type.
	export let name: string;
	export let classes: string = '';

	let markup: string | null = null;

	// The fetch is the browser's, so it is asked for on mount rather than at first
	// render; nothing is drawn until it lands, exactly as an unpicked glyph is not.
	onMount(() => {
		let live = true;
		void loadIconMarkup(name).then((loaded) => {
			if (live) markup = loaded;
		});
		return () => {
			live = false;
		};
	});

	// Sized in `em` by the rewrite, so it tracks the type it stands in unless the
	// caller says otherwise through `classes` (e.g. `[&>svg]:size-6`) — a CSS rule
	// outranks the svg's own presentation attributes.
	$: computedClasses = classNames('inline-flex flex-none items-center text-current', classes);
</script>

<!-- Decorative: a mark used as a label is announced by the control that carries it,
	which names itself for a screen reader in words. -->
{#if markup}
	<span class={computedClasses} aria-hidden="true">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html markup}
	</span>
{/if}
