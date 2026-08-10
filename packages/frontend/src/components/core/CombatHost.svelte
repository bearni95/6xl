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
	// Which end the picture is at. The face goes last where the reading fills its cell and is
	// set against the picture (the head's left-hand cell, whose far end is the middle of the
	// head and the town's plate across it) and first where it stands at the near edge of what
	// it is in, which is what the corner of the orders panel is: a picture reads as the start
	// of an account, so at the left it comes first and the name follows it.
	export let faceFirst: boolean = false;
	// What the reading is a reading of, said to a pointer resting on it. The caller's, because
	// only the caller knows: the same three facts are somebody else's account in the head of
	// the fight and the player's own in their panel. Null carries no tooltip at all, which is
	// the right answer for the one an account is looking at itself in.
	export let hint: string | null = null;
	export let classes: string = '';

	$: initial = (name || '?').charAt(0).toUpperCase();
</script>

<!-- In the head of the fight this is read the other way round from the town's plate beside
	it: the reading first and the face at the far end. That is the left-hand cell of the head,
	whose far end is the middle of it, so the picture goes onto the seam the town's tile stands
	on and the type is set against the picture — the two cells then read outwards from that
	middle, each with its own mark on it, rather than both pointing the same way and leaving the
	head with a face at one outer corner and a glyph at the other. `flex-1` on the reading is
	what pushes the avatar out there: the column takes whatever width the cell has spare, so the
	face is at the end of the cell and not merely after the name. Turned round (`faceFirst`)
	there is nothing to push against — the box is as wide as what is in it — so the reading takes
	its own width and the picture leads it.
	`min-w-0` either way is what lets a long username truncate rather than push the whole head
	wider: a flex item's floor is its content otherwise.
	The level's line is faded rather than tinted (`opacity-70` and not `text-white/70`), so it
	is seven tenths of whatever ink it is standing in — the plate's white in the head, and
	whatever the panel is set in where this carries no plate. -->
<div class={classNames(plated && PLATE_FLUSH_CLASSES, classes)} title={hint}>
	<div class="flex items-center gap-2">
		<div
			class={classNames(
				'flex min-w-0 flex-col leading-tight',
				faceFirst ? 'text-left' : 'flex-1 text-right'
			)}
		>
			<span class="truncate text-sm font-semibold">{name}</span>
			<span class="truncate text-xs font-medium opacity-70">
				{$_('profile.levelBadge', { values: { level } })}
			</span>
		</div>
		<PlayerAvatar
			{characterId}
			{color}
			{initial}
			ownColors={false}
			size="w-10"
			textClasses="text-base font-bold"
			classes={classNames('flex-none', faceFirst && 'order-first')}
		/>
	</div>
</div>
