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
	// Whether the reading carries a plate of its own. It does in the head of the fight, where
	// it is one cell of a block of chrome laid over the board and has to be read off its own
	// surface. It does not where it stands *inside* something already printed on one — the
	// player's own account at the corner of their orders panel — since a plate on a plate is a
	// second edge drawn round a thing that already has one.
	export let plated: boolean = true;
	// What the reading is a reading of, said to a pointer resting on it. The caller's, because
	// only the caller knows: the same three facts are somebody else's account in the head of
	// the fight and the player's own in their panel. Null carries no tooltip at all, which is
	// the right answer for the one an account is looking at itself in.
	export let hint: string | null = null;
	export let classes: string = '';

	$: initial = (name || '?').charAt(0).toUpperCase();
</script>

<!-- One arrangement, and both places it stands want it: the picture at the near end and the
	reading after it, which is how an account is read anywhere. In the head of the fight that
	near end is the middle of the head — this is its right-hand cell, and the town's plate across
	the seam is mirrored to bring its own tile to the same place — so the two marks meet there and
	each reading runs outwards from its own. In the corner of the orders panel it is the corner
	itself. The reading took the spare width and was set right for a while, to push the avatar out
	to the outer edge of the head; that is what put a face in one far corner of the block and a
	glyph in the other, and the mirror on the plate is what replaced it.
	`min-w-0` is what lets a long username truncate rather than push the whole head wider: a flex
	item's floor is its content otherwise.
	The level's line is faded rather than tinted (`opacity-70` and not `text-white/70`), so it
	is seven tenths of whatever ink it is standing in — the plate's white in the head, and
	whatever the panel is set in where this carries no plate. -->
<div class={classNames(plated && PLATE_FLUSH_CLASSES, classes)} title={hint}>
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
			<span class="truncate text-xs font-medium opacity-70">
				{$_('profile.levelBadge', { values: { level } })}
			</span>
		</div>
	</div>
</div>
