import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import CharacterStatue from '$components/core/CharacterStatue.svelte';

// No art is fetched: what is under test is the word on the panel, and a statue with a
// character id but no frames folder draws no picture at all. The sprite's own loaders are
// stubbed for the same reason they are in `idle-sprite-ready` — this environment has no
// network worth reaching.
vi.mock('$utils/mugen/idle-clip', () => ({
	loadIdleClip: () => new Promise(() => {}),
	placeIdleClip: () => null
}));
vi.mock('$utils/mugen/character-render-scale', () => ({
	loadRenderScale: () => Promise.resolve(1),
	loadWidthCap: () => Promise.resolve(true)
}));

/**
 * What a card is lettered with. A character is called whatever the admin's `/characters`
 * screen says it is called — Cor Petit, not the `piccolo` a `character_spawns` row holds
 * and not the `Piccolo` the MUGEN archive shipped under — and the statue reads that off
 * the registry itself, so no surface can put the wrong one of the three on a card.
 */
describe('character statue: the name on the panel', () => {
	it('letters the registry name for the character id it is handed', () => {
		const { getByTitle } = render(CharacterStatue, {
			props: { characterId: 'piccolo', label: 'piccolo' }
		});
		expect(getByTitle('Cor Petit')).toBeTruthy();
	});

	it('falls back to the label for a character the registry no longer holds', () => {
		const { getByTitle } = render(CharacterStatue, {
			props: { characterId: 'nobody-at-all', label: 'Ningú' }
		});
		expect(getByTitle('Ningú')).toBeTruthy();
	});
});
