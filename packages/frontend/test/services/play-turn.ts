import { get } from 'svelte/store';
import { vi } from 'vitest';
import type { CombatController } from '$services/combat.controller';

/**
 * Play a committed turn out to its end.
 *
 * A turn is **walked through an encounter at a time**: each row is played out on the canvas,
 * said over the panel, and then the fight stands still until the player presses on
 * (`CombatController.next`). So playing a turn out is no longer a matter of running the clock
 * — the clock reaches the first row and stops — it is running it and then pressing on from
 * every row the turn holds at, which is what this does.
 *
 * The timers are still run because a turn holds one fixed beat that is nobody's encounter:
 * the reveal, which is one instant for everybody at once with nothing to press on from.
 *
 * Every combat suite plays turns through here, so what "a turn played out" means is written
 * down once. A press on a fight that is not waiting is ignored by the controller, so the loop
 * ends where the turn does rather than needing to know how many rows were in it.
 */
export async function settleTurn(controller: CombatController): Promise<void> {
	await vi.runAllTimersAsync();
	// A bound, not a rule: three lanes cannot make more than three encounters, and a turn
	// still holding after far more presses than that is a fight that would hang on screen —
	// better a test that stops and says so than one that runs forever.
	for (let presses = 0; get(controller).awaiting && presses < 16; presses++) {
		controller.next();
		await vi.runAllTimersAsync();
	}
}

/** Commit the orders as they stand and play the turn out. */
export async function playTurn(controller: CombatController): Promise<void> {
	controller.commit();
	await settleTurn(controller);
}
