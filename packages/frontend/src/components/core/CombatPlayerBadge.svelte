<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { _ } from 'svelte-i18n';
	import CombatHost from '$components/core/CombatHost.svelte';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { authService } from '$services/auth.service';

	/**
	 * Whose side this is, standing in its own row under the head of the fight: the same
	 * three facts the head says about the player holding the town, said about the player
	 * playing — the face they wear, the name they chose and the level they have reached (see
	 * CombatHost, which both are). A fight has two accounts in it and the arena named exactly
	 * one of them, which is the half that is somebody else.
	 *
	 * Read off the session rather than off the fight: the fight knows a team and three
	 * fighters, and who is fielding them is the account, so it is `authService.profile` here
	 * exactly as it is at the map's own corner. The level is taken off that profile rather
	 * than worked out again — it is derived from the experience once, where the account is
	 * read (`levelForExp`) — and the nameless account is worded, never stored, as the
	 * catalogue words it everywhere else. Nothing is drawn at all where there is no account
	 * to name.
	 *
	 * **It is also the way out of the fight**, which is why the account and the pair of
	 * buttons it turns into are one component and not two: the press is on the account
	 * itself, and what it opens is the question of whether to give the fight up. They are
	 * stacked in a single grid cell (`col-start-1 row-start-1` on each) rather than swapped
	 * in and out, which is what makes the change a crossfade and not a cut — the two are over
	 * each other for the length of it, one coming up as the other goes down, and the cell
	 * stays as tall as the taller of them throughout so nothing under it shifts.
	 *
	 * It is opacity and nothing else: a Svelte transition would mount and unmount, which is
	 * the layout jump this is drawn to avoid, and the fade is a pair of Tailwind classes on
	 * boxes that are both always there. What is faded out is also taken out of reach —
	 * `pointer-events-none` for the pointer and `inert` for the keyboard — since a button at
	 * nought opacity is still a button otherwise, and the one thing that must not be
	 * reachable by accident is the way out of a fight.
	 *
	 * No plate: it stands on whatever it is put on — the sky at the top of the view standing
	 * up, the sidebar's own column lying down — and a card round three facts already drawn as
	 * a block would be an edge round a thing that reads as one without it.
	 */

	/** Whether giving up is a thing that can be done at this moment: between turns, in a
	 * fight that is still running. The fight's own question, so the arena answers it. */
	export let canConcede: boolean = false;
	/** The fight is decided. What closes the question rather than what disables it — a turn
	 * being carried out only holds the flag shut, since the reader asked to see it and a
	 * block that snapped back on the reveal would be answering for them. */
	export let over: boolean = false;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{ concede: void }>();

	const profile = authService.profile;

	/** Whether the account has been pressed and is showing the way out of the fight instead.
	 * It is this component's own: nothing outside it asks the question. */
	let conceding = false;
	// A fight that is over is not one to give up, so the question comes down with it rather
	// than standing open over a result.
	$: if (over) conceding = false;
</script>

{#if $profile}
	<div class={classNames('grid', classes)}>
		<!-- The account, and the press. The whole block is the target: there is one thing to do
		     here and the block is the thing to press, which is the same reading the map's own
		     row is pressed under. It says nothing about what the press does — the account is
		     what is drawn, and what it turns into is the answer. -->
		<button
			type="button"
			class={classNames(
				'col-start-1 row-start-1 w-full cursor-pointer text-left transition-opacity duration-200',
				conceding && 'pointer-events-none opacity-0'
			)}
			inert={conceding || undefined}
			on:click={() => (conceding = true)}
		>
			<CombatHost
				name={$profile.username || $_('profile.username.none')}
				characterId={$profile.avatarCharacterId}
				color={$profile.avatarColor}
				level={$profile.level}
				plated={false}
			/>
		</button>
		<!-- The way back from the question, and then the way out of the fight. In that order,
		     the harmless one nearest the edge the row is read from: this is a question the block
		     asked without being asked to, so the answer that undoes it is the one under the hand
		     first, and the destructive one is the one that has to be reached past it.
		     Two marks and no words. The flag is the head's own (`lorc/flying-flag`, white on
		     red), so giving up is one picture wherever the arena offers it — this is a second way
		     to reach that order and not a second control — and the cross is what this game closes
		     anything with. Both carry the catalogue's own wording as their label, said to a
		     screen reader and to a pointer resting on them, which is where the words went rather
		     than off the screen.
		     The way back is outlined and the way out is filled: one of the two is a thing that
		     happens and the other is the absence of it, and a filled shape beside an outlined one
		     says which is which before either is read. Yellow for it, the one colour here that is
		     neither the fight's two sides nor the red of the thing it undoes.
		     Between turns only for the flag, exactly as the head's is: a turn already being
		     carried out settles itself. The way back is never held shut — whatever the fight is
		     doing, a player who opened this by mistake may close it. -->
		<div
			class={classNames(
				'col-start-1 row-start-1 flex w-fit gap-2 transition-opacity duration-200',
				!conceding && 'pointer-events-none opacity-0'
			)}
			inert={!conceding || undefined}
		>
			<button
				type="button"
				class="btn btn-outline btn-warning btn-square btn-sm"
				title={$_('common.cancel')}
				aria-label={$_('common.cancel')}
				on:click={() => (conceding = false)}
			>
				<!-- An inline cross, drawn in the document like the panel's own arrows, so it takes
				     its colour from the button it stands in — which is the whole of what an outlined
				     button is: its own ink on nothing. -->
				<svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
					<path
						d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z"
					/>
				</svg>
			</button>
			<button
				type="button"
				class="btn border-red-500 bg-red-500 text-white btn-square btn-sm"
				disabled={!canConcede}
				title={$_('combat.concede')}
				aria-label={$_('combat.concede')}
				on:click={() => dispatch('concede')}
			>
				<GameGlyph name="lorc/flying-flag" classes="[&>svg]:size-5" />
			</button>
		</div>
	</div>
{/if}
