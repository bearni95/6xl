<script lang="ts">
	import MapScreen from '$components/core/MapScreen.svelte';

	// The map, and nothing else on the page.
	//
	// The very component the front door draws (see `/`), asked for without the furniture that
	// stands around it: no column at the side holding the side this player fields, and no block
	// under the terrain saying what is at the open place. What is left is the terrain, at the
	// whole of whatever size the screen is — one cell of the grid at every width, where this
	// address used to give a phone a 1:1 square of the block and the map whatever was left of the
	// page after it.
	//
	// The band across the top is NOT dropped and is not drawn here either: it is MapScreen's own
	// first row on both addresses (see the band, and `chrome`). The game's name, the feed and the
	// menu with the account and the settings in it are things about the game rather than about
	// the terrain, and a map with no way out of it to the rest of the game is a page a reader is
	// stranded on. Drawn once, in the one component both addresses mount, so the row a reader
	// presses here is the row they pressed there — same stores, same menu, same items.
	//
	// Not a copy of either. Both are the same component reading the same tree, so the tiers, the
	// shows, the pins, the boxes, the sieges and the `region` param mean exactly what they mean
	// on the front door: `/map?region=...` and `/?region=...` open the same place, and a walk
	// down the map reads the same either way. Every press here does what it does there — a box
	// opens its pack, Challenge stages the fight and goes to the arena, a statue's side opens the
	// roster — since the sheets those raise are mounted by the component and by the layout above
	// it rather than by the front door. What the block held is read at the front door, on the same
	// tree and over the same open place; the globe between the map's two zoom presses is the way
	// here, and it stands on that address only (see MapZoomControls).
	//
	// One thing is worth knowing before it is noticed: leaving a fight goes to `/` and not back
	// here, the arena having one map to return to (see MAP_ROUTE in $services/combat). The
	// roster does come back, because it remembers the page it was opened from.
</script>

<MapScreen chrome={false} />
