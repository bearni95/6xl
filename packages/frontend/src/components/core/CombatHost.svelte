<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { PLATE_FLUSH_CLASSES } from '$components/core/TownPlate.svelte';
	import type { SpawnColor } from '$types/character-spawn.type';

	// Whoever the fight is actually against: the player holding the town, read as an
	// account rather than as a line on the town's plate — the face they wear, the name
	// they chose and the level they have reached, which are the three things this game
	// says a player by anywhere else it names one (see PublicPlayerCard).
	//
	// It stands above the town's own plate in the arena's head, so a challenge over a
	// taken town reads whose it is first and what the place is second: the sitting team
	// is theirs, and a fight for a held town is a fight with somebody.
	//
	// A reading and never a way in — this is somebody else's account, and there is no
	// route from a fight to their page — so nothing here is pressable.
	//
	// The same plate surface the town's card carries, flush: the two are one block of
	// chrome at the top of the screen rather than two cards that happen to be stacked.

	// What to call them — already worded for a player who never chose a name, exactly as
	// the plate's own holder row takes it.
	export let name: string;
	// The two halves of the avatar being worn, which are only ever read together — both
	// null is the initial-letter avatar, drawn off the name beside it. Told not to fall
	// back to the reader's own team colour, for the reason TownHolder is: a stranger's
	// letter printed on the reader's colours says something untrue about that stranger.
	export let characterId: string | null = null;
	export let color: SpawnColor | null = null;
	// The level they have reached, worked out from their experience by whoever built the
	// plate — never stored, and never recomputed here.
	export let level: number;
	export let classes: string = '';

	$: initial = (name || '?').charAt(0).toUpperCase();
</script>

<!-- `min-w-0` on the reading is what lets a long username truncate inside the column
	rather than push the whole head wider: a flex item's floor is its content otherwise. -->
<div class={classNames(PLATE_FLUSH_CLASSES, classes)} title={$_('map.holder.title')}>
	<div class="flex items-center gap-2">
		<PlayerAvatar
			{characterId}
			{color}
			{initial}
			ownColors={false}
			size="w-10"
			textClasses="text-base font-bold"
			classes="flex-none"
		/>
		<div class="flex min-w-0 flex-col text-left leading-tight">
			<span class="truncate text-sm font-semibold">{name}</span>
			<span class="truncate text-xs font-medium text-white/70">
				{$_('profile.levelBadge', { values: { level } })}
			</span>
		</div>
	</div>
</div>
