import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import IdleSprite from '$components/core/IdleSprite.svelte';

// No art is fetched here: the clip never resolves, which is exactly the state the second
// case is about — a sprite with a character still to come. happy-dom has no network worth
// reaching and a real fetch would only add noise to the run.
vi.mock('$utils/mugen/idle-clip', () => ({
	loadIdleClip: () => new Promise(() => {}),
	placeIdleClip: () => null
}));
vi.mock('$utils/mugen/character-render-scale', () => ({
	loadRenderScale: () => Promise.resolve(1),
	loadWidthCap: () => Promise.resolve(true)
}));

/**
 * The one promise a surface that uncovers its own statues leans on: the sprite says when
 * there is nothing left to wait for. A pack's box holds itself crazed until every card it
 * gave has said it (see PackGrid), so a sprite that stays silent is a box that never comes
 * apart — which is why the case with nothing to load has to speak, and speak at once.
 *
 * The other half, a picture that does arrive, needs a frames manifest, decoded images and a
 * measured box, none of which this environment has. What is guarded here is the deadlock.
 */
describe('idle sprite: saying the picture is up', () => {
	it('says so at once when there is no character to draw', () => {
		const ready = vi.fn();
		render(IdleSprite, { props: { basePath: null, label: 'nobody' }, events: { ready } });
		expect(ready).toHaveBeenCalledTimes(1);
	});

	it('says nothing yet when there is art still to come', () => {
		const ready = vi.fn();
		render(IdleSprite, {
			props: { basePath: '/assets/somebody/frames', label: 'somebody' },
			events: { ready }
		});
		expect(ready).not.toHaveBeenCalled();
	});
});
