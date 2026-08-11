<script lang="ts">
	import classNames from 'classnames';
	import { slide } from 'svelte/transition';
	import { _ } from 'svelte-i18n';

	// The far end of the band across the top of the page, folded into one mark: three dots, and
	// under them a column of what the game can be asked — each line the glyph that stood on the
	// band and the name of the sheet it raises.
	//
	// They were two squares standing open on the row, a glyph each and nothing else. A glyph
	// alone is a thing a reader has to already know: a palette is not obviously the list of the
	// people who drew the fighters, and a square that says what it is only when pointed at says
	// nothing at all on a phone. The column is where the names fit, so the marks keep their
	// artwork and gain the words — and the band gets its far end back as one square, which is
	// what lets more be asked of the game later without the row growing a mark each time.
	//
	// A folded thing on this page is a dots button with a column under it — the map's own path
	// was drawn the same way, on the band along the bottom edge, until the path itself went — and
	// this is the one left, which is what a menu is. It comes down over the map instead
	// of pushing anything aside — `z-[1000]` clears the plates laid over the terrain, which sit
	// at 900 — and is closed by a press anywhere else, by Escape, and by picking a line.
	//
	// It holds no list of its own: what the game gets asked is the page's to say, and this is the
	// shape it is asked in. Nothing at all if it is handed nothing.
	//
	// Under the lines, and ruled off from them, whatever the page wants the column to close with
	// (`foot`). A slot rather than another kind of item, because what stands there is not a line
	// with a mark and a name that raises a sheet — today it is the row of marks saying where the
	// author is, which leaves the game entirely, and a menu that knew that about it would be a
	// menu with a list of its own after all.

	/** The lines, in the order they are read: the mark, the name, and what pressing it does. */
	export let items: { icon: string; label: string; onSelect: () => void }[] = [];
	export let classes: string = '';

	let open = false;
	let wrapperEl: HTMLElement | null = null;

	function pick(item: { onSelect: () => void }) {
		open = false;
		item.onSelect();
	}

	// The column stands over the map, so a press anywhere else is a press on something it is
	// covering: it closes rather than being clicked through.
	function handleWindowPointerDown(event: MouseEvent) {
		if (!open || !wrapperEl) return;
		if (!wrapperEl.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window
	on:pointerdown={handleWindowPointerDown}
	on:keydown={(event) => {
		if (event.key === 'Escape') open = false;
	}}
/>

{#if items.length || $$slots.foot}
	<!-- The wrapper is the square, not the button inside it: `aspect-square flex-none
		self-stretch` is exactly the box the two marks this replaces were, taking the row's height
		and reading its width off that. The box has to be settled HERE because it is the item the
		band lays out — an `aspect-square` on the button instead leaves the wrapper's own width to
		be guessed from a child whose height is not known until the row has already been laid out,
		and what came of that guess was a square wide enough to push itself off the end of the
		screen. The button simply fills whatever this is (`size-full`), which is a percentage and
		asks nothing.
		`relative` because the column hangs off it. -->
	<div
		bind:this={wrapperEl}
		class={classNames('relative flex aspect-square flex-none self-stretch', classes)}
	>
		<!-- The same square as everything else the band presses: the name plate's own fill, drawn
			to the row's height, with white artwork that needs no colour of its own on the primary.
			The dots are the mark this game folds things into — three of them down the square, as
			they were at the head of the map's own row while it had a path to fold. -->
		<button
			type="button"
			class="flex size-full cursor-pointer items-center justify-center rounded-lg bg-primary text-white shadow-xl"
			aria-expanded={open}
			aria-haspopup="menu"
			aria-label={open ? $_('menu.close') : $_('menu.open')}
			on:click={() => (open = !open)}
		>
			<svg viewBox="0 0 24 24" fill="currentColor" class="size-5" aria-hidden="true">
				<circle cx="12" cy="5" r="2" />
				<circle cx="12" cy="12" r="2" />
				<circle cx="12" cy="19" r="2" />
			</svg>
		</button>

		{#if open}
			<!-- Pinned to the far edge (`right-0`), because that is the edge the square it comes out
				of is held against and a column that opened inward would hang off nothing. Its own
				width — `w-max`, a column of names being as wide as the longest of them — capped
				against the viewport rather than against this wrapper, which is one square wide and
				would shred every name into a stack of two-letter lines.
				The one surface on this page not let through: a plate at 80% is for a crumb or two
				read against terrain, and a column of names is read against whatever it has come
				down on top of. -->
			<div
				transition:slide={{ duration: 200 }}
				role="menu"
				class="absolute right-0 top-full z-[1000] mt-2 flex w-max max-w-[75vw] flex-col gap-0.5 overflow-hidden rounded-lg bg-base-100 p-2 text-white shadow-xl"
			>
				{#each items as item}
					<!-- The mark and the name on one line, in that order: the glyph is what the reader
						knew this by when it stood on the band, so it is what they look for, and the
						name is what it was missing. Both are the press. -->
					<button
						type="button"
						role="menuitem"
						class="flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white/10"
						on:click={() => pick(item)}
					>
						<!-- Decorative: the line beside it says the same thing in words. -->
						<img src={item.icon} class="size-5 flex-none" alt="" />
						<span class="whitespace-nowrap text-sm font-medium">{item.label}</span>
					</button>
				{/each}

				<!-- What the column closes with, ruled off from the lines above it because it is not
					one of them: a hairline of the column's own ink, and the room a line would have
					had. Only drawn when the page has handed something over — a rule under the last
					line with nothing beneath it is a rule about nothing. -->
				{#if $$slots.foot}
					<div class="mt-1 border-t border-white/10 pt-1">
						<slot name="foot" />
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
