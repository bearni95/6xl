<script context="module" lang="ts">
	/**
	 * The board engine as one lazily-loaded chunk, asked for by name.
	 *
	 * It is imported dynamically because it must not run during SSR/prerender, and it now
	 * genuinely is one — nothing on the map imports a value out of it any more. Which means
	 * pressing Challenge is the first moment the browser hears about it, and none of the
	 * board's own artwork can start loading until it has arrived: one round trip at the
	 * front of a blank sheet, over a chunk that has nothing to do with which fight this is.
	 *
	 * So the two doors into the arena ask for it as they open — `challenge()` while the
	 * server is still opening the battle, the arena as it mounts — and whichever gets there
	 * first is the one request. The board's own `onMount` then finds it in hand. Calling it
	 * again costs nothing.
	 */
	let engine: Promise<typeof import('$utils/mugen/mugen-board')> | null = null;

	export function loadBoardEngine(): Promise<typeof import('$utils/mugen/mugen-board')> {
		engine ??= import('$utils/mugen/mugen-board');
		return engine;
	}
</script>

<script lang="ts">
	import classNames from 'classnames';
	import { onDestroy, onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import type { BoardGrid, MugenBoard } from '$utils/mugen/mugen-board';

	// The board's two halves, each with its colour and lead character.
	export let grids: [BoardGrid, BoardGrid];
	// Both mirror the engine's own defaults (see MugenBoardOptions), so the board looks
	// the same whether a host says anything about its size or not.
	export let cellSize: number = 219;
	export let padding: number = 40;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{ ready: MugenBoard; error: unknown }>();

	let host: HTMLDivElement;
	let board: MugenBoard | null = null;

	// A host that is exactly its canvas. The canvas caps itself on both axes and asserts
	// neither, so it comes out at whatever size fits inside both — and this box is left to
	// take that size rather than given one of its own, so anything a caller hangs off the
	// host (`classes`, and the absolutely-placed things a host puts beside it) lines up
	// with the board's own edges instead of with a row the board sits in the middle of.
	//
	// Square corners. It was `rounded-box`, which rounded the picture's four corners off —
	// a card's treatment on something that is not a card: the arena is one drawing running
	// to the edges of the room it is given, and the ground it draws does not stop short of
	// them. The document lays the same ground on past those edges (`CombatFlanks`,
	// `CombatGround`), which a curve cut across.
	$: wrapperClasses = classNames('flex overflow-hidden leading-none', classes);

	onMount(async () => {
		// Pixi only in the browser, so it never runs during SSR/prerender — and normally
		// already on its way by the time this mounts (see loadBoardEngine).
		const { MugenBoard } = await loadBoardEngine();
		board = new MugenBoard({ grids, cellSize, padding });
		try {
			await board.start(host);
			dispatch('ready', board);
		} catch (error) {
			dispatch('error', error);
		}
	});

	onDestroy(() => board?.destroy());
</script>

<div bind:this={host} class={wrapperClasses}></div>
