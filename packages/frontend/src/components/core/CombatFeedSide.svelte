<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import type { CombatFeedPlayer } from '$types/combat-feed.type';

	/**
	 * One of the two sides of a fight in the feed: the face they wear, the name they chose
	 * and the level they have reached — the same three facts this game says about a player
	 * wherever it says one (see CombatHost, which is the same reading inside the arena).
	 *
	 * It is its own file because a fight has **two** of them and they are not two different
	 * things: the winner and the defeated are read the same way, and the only difference
	 * between the two is which end of the row each faces and which of them is dimmed. A
	 * second copy of the markup would be a second answer to what a player looks like in a
	 * list.
	 *
	 * A null player is a town still on its seeded house team, which belongs to nobody: it
	 * draws no face and no level, and is named in the catalogue's own words rather than
	 * with a blank or a dash. Somebody did fight somebody there — it simply was not an
	 * account.
	 */
	export let player: CombatFeedPlayer | null = null;
	/** Set against the far end of the row, face outermost: the second side of a duel is
	 * read back towards the middle, as the head of the fight lays its two cells out. */
	export let reversed: boolean = false;
	/** The side that lost. Faded rather than marked: which of the two won is said between
	 * them in words, and this is only what keeps the eye on the one that did. */
	export let dimmed: boolean = false;
</script>

<div
	class={classNames('flex min-w-0 flex-1 items-center gap-2', {
		'flex-row-reverse': reversed,
		'opacity-60': dimmed
	})}
>
	{#if player}
		<PlayerAvatar
			characterId={player.characterId}
			color={player.color}
			initial={(player.name ?? '?').slice(0, 1).toUpperCase()}
			size="w-10"
			textClasses="text-base"
			ownColors={false}
		/>
	{/if}
	<div class={classNames('flex min-w-0 flex-col', reversed && 'items-end text-right')}>
		<span class="truncate font-semibold">
			{player ? (player.name ?? $_('combat.feed.anonymous')) : $_('combat.feed.house')}
		</span>
		{#if player}
			<span class="truncate text-xs opacity-60">
				{$_('profile.levelBadge', { values: { level: player.level } })}
			</span>
		{/if}
	</div>
</div>
