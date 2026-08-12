<script lang="ts">
	import MapScreen from '$components/core/MapScreen.svelte';

	// The map, and nothing else on the page.
	//
	// The very component the front door draws (see `/`), asked for without its chrome: no band
	// across the top with the game's name and the menu on it, and no column at the side holding
	// the side this player fields. What is left is the two boxes this address is for — the
	// terrain, and the block saying what is at the place it is open on — and they divide the
	// whole viewport between them: two thirds and one from `md` up, the map with the block under
	// it on a phone.
	//
	// Not a copy of either. Both are the same component reading the same tree, so the tiers, the
	// shows, the pins, the boxes, the sieges and the `region` param mean exactly what they mean
	// on the front door: `/map?region=...` and `/?region=...` open the same place, and a walk
	// down the map reads the same either way. Every press here does what it does there — a box
	// opens its pack, Challenge stages the fight and goes to the arena, a statue's side opens the
	// roster — since the sheets those raise are mounted by the component and by the layout above
	// it rather than by the front door.
	//
	// One thing is worth knowing before it is noticed: leaving a fight goes to `/` and not back
	// here, the arena having one map to return to (see MAP_ROUTE in $services/combat). The
	// roster does come back, because it remembers the page it was opened from.
</script>

<MapScreen chrome={false} />
