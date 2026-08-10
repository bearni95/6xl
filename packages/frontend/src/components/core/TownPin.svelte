<script lang="ts">
	import classNames from 'classnames';
	import TeamLineup from '$components/core/TeamLineup.svelte';
	import TownPlate from '$components/core/TownPlate.svelte';
	import TownChallenge from '$components/core/TownChallenge.svelte';
	import BoosterBox from '$components/core/pack/BoosterBox.svelte';
	import type { MapBoosterBox, MapMarker } from '$types/map.type';

	// A pin's whole column, drawn declaratively for everywhere that is not the map — the same
	// relation TownPlate has to the plate inside it. The map builds its marks imperatively
	// because Leaflet hands out DOM rather than templates (see WorldMap's markerElement), and
	// a second hand-written arrangement of the same three blocks is how one mark comes to be
	// two marks; this takes the very `MapMarker` that pin was built from and stands the same
	// column up in a document.
	//
	// The order is the pin's, and it is the order the blocks are read in: the side holding the
	// place, the plate saying what the place is, and what the town has waiting. Which of them
	// appear is decided nowhere here — a pin carries the side only where the caller gave it
	// one, and a standing only where there is something to take. Whose the town is is not one
	// of the blocks: the band over the side wears the holder's face (see TeamLineup's `owner`),
	// and the plate no longer prints a row of it under them (see TownPlate).
	//
	// One thing is arranged differently from the mark on the terrain, and only where the town
	// has both: the standing comes off the plate and stands as a row of its own directly under
	// the side. On a pin the plate is the only surface there is and the standing rides at the
	// foot of it; here the side and the standing are one statement — these are the three who
	// hold the place, this is how far taking it has got and the way to get further — and a plate
	// naming whose the town is has no business between the two halves of it. The blocks are the
	// same blocks either way round (see underTheSide).
	export let marker: MapMarker;
	// The town's booster mark, where the window has one for it. Always the whole box and never
	// the disc: a disc is a dot on a town nobody has picked, and this column is only ever
	// drawn for the place being looked at (see markKindForBox).
	export let box: MapBoosterBox | null = null;
	// Whether the plate names the place (see TownPlate). Handed on rather than decided here:
	// whether the name has already been said is a fact about wherever this column is stood
	// up, not about the column.
	export let named: boolean = true;
	// Passed straight through to the side (see TeamLineup): veil these three even where the
	// session has already watched them arrive. Decided by whoever stands this column up, since
	// whether a reveal is worth spending is a fact about the surface and not about the pin.
	export let alwaysReveal: boolean = false;
	export let classes: string = '';

	// Who is standing on the town, said as a string — the members in the order they are
	// fielded, each by the three things that make one of them this card and not another.
	// It is what the side is keyed on below, so it must change when the side does and
	// stay put when nothing but the marker's identity has been rebuilt: the pin is
	// recomputed whenever anything the map knows about the town moves (a holder, a glyph
	// landing), and a key taken off the marker object would remount the row every time.
	$: sideKey = (marker.team ?? [])
		.map((member) => `${member.basePath ?? ''}|${member.label}|${member.color}`)
		.join(',');

	// Whether the standing stands UNDER the side as a row of its own rather than at the foot of
	// the plate: only where there is both a side to stand and something to be done about it.
	// Where either is missing there is no pair to keep together — a town with nobody standing on
	// it puts its standing back on the plate where a pin has always carried it, and a town with
	// nothing to be done about it is the side alone.
	$: underTheSide = Boolean(marker.team?.length && marker.challenge);
</script>

<div class={classNames('flex flex-col items-center gap-1', classes)}>
	{#if marker.team?.length}
		<!-- The side sitting on the town, as the roster and the pin both stand a team up. The
			pin gives the row a fixed 500px because it hangs off a point with nothing to measure;
			here it takes the width of the column it is laid in, which is the same rule the
			statues follow everywhere they are placed rather than dropped.
			`flipped={false}`: a town's team is somebody else's side, so it faces the viewer
			unmirrored, as a rival side does on the board.
			`seeded` is read off the holder and not off the team: a town with nobody on it is a
			town still fielding the three its own seed rolled, so its banner flies the map's grey
			rather than the colour that roll happened to give the lead — the same rule the terrain
			under it is painted by.
			`owner` is the same fact said the other way round, and it is now the only place a pin
			says it: the face on the banner is whoever is standing here. The plate under this row
			printed the same face and their username a second time, which is why that row came off
			it (see TownPlate). A town nobody holds hands over nothing and the band draws the
			robot, which is what its grey already meant. -->
		<!-- Keyed on the side itself, so a column that comes to hold three different characters
			stands three new statues up rather than swapping the pictures inside the ones already
			there. That is what lets the row arrive: a statue keeps its veil down once its own
			character is up, and a member who happens to sit in the same slot as the last side's
			would otherwise never be covered again — so a change of side would half-animate, only
			the slots whose character actually changed playing anything. Remounting all three puts
			every one of them back behind a veil at once, and the row appears as the one thing it
			is. It costs nothing when the side has not changed: the key is the members themselves
			and not the marker, which is rebuilt whenever anything at all about the town moves. -->
		{#key sideKey}
			<div class="w-full drop-shadow-lg">
				<TeamLineup
					members={marker.team}
					owner={marker.holder ?? null}
					flipped={false}
					seeded={!marker.holder}
					{alwaysReveal}
					classes="gap-1"
				/>
			</div>
		{/key}
	{/if}

	{#if underTheSide}
		<!-- The standing as its own row directly under the statues, at the full width of the
			column: the bar in the first of three cells and the control in the two beside it, which
			is the row TownChallenge draws anywhere it is not squeezed into a plate. It is the same
			ratio the plate gives it, so the block reads the same here as on every other mark — a
			third to the reading and two thirds to the doing, a bar being a picture that fills
			whatever it is given and a button being words that need enough of one. -->
		<TownChallenge
			siege={marker.challenge!.siege}
			button={marker.challenge!.button}
			unlocksAt={marker.challenge!.unlocksAt}
			onUnlock={marker.challenge!.onUnlock}
			classes="w-full"
		/>
	{/if}

	<!-- Flush, because this is a column and not a point: the plate takes the width it is laid
		in and squares its corners against what it is stacked with (see TownPlate).
		Only where there is anything for it to hold: a plate that is not naming the place and has
		no standing to print is a bare band of surface with nothing written on it, which is a
		mark about a town that says nothing about the town.
		The standing is the plate's only where it is not already standing under the side: a pin
		carries it there by default (which is what the arena's plate and the map's own marks
		draw), and handing it over twice would print the same bar and the same button in two
		places on one mark. -->
	{#if named || (marker.challenge && !underTheSide)}
		<TownPlate
			iconSvg={marker.iconSvg ?? null}
			frameClasses={marker.frameClasses ?? null}
			title={marker.title}
			subtitle={marker.subtitle}
			challenge={underTheSide ? null : marker.challenge}
			{named}
			flush
		/>
	{/if}

	{#if box}
		<!-- What the town is offering, at the box's own 200px — the last block of the column,
			exactly as it is on a pin with no side to stand it behind. Its click is the box's own
			(the pack), which is why it is a button and not a div with a handler: it is the one
			thing in this column that is pressed rather than read, apart from the controls the
			plate carries inside itself. -->
		<button type="button" class="mt-1 w-[200px]" on:click={() => box?.onClick?.()}>
			<BoosterBox
				coverUrl={box.coverUrl ?? null}
				logoUrl={box.logoUrl ?? null}
				showId={box.showId ?? null}
				locationName={box.locationName ?? null}
				light={box.light ?? false}
			/>
		</button>
	{/if}
</div>
