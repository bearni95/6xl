import { describe, it, expect, vi } from 'vitest';

/**
 * The switch that turns the visit counter off.
 *
 * It is drawn twice — under the storage note, and on the settings sheet — over one
 * store, so what matters is that the control and the browser agree in both directions:
 * a switch that opens already off for somebody who turned it off, and a press that
 * reaches localStorage rather than only the component's own state. The second is the
 * one worth a test, because the tracker never asks the component anything; it asks the
 * key.
 */

const KEY = 'umami.disabled';

/** Mount the switch against whatever localStorage currently says. */
async function mount() {
	vi.resetModules();
	// Cleanup belongs to the copy of the library that mounted, which a reset registry
	// has just replaced — so the page is cleared here rather than by an afterEach.
	document.body.innerHTML = '';
	// The catalogue has to be registered inside the reset registry too, or the copy of
	// svelte-i18n this mount reaches has no locale and refuses to format a word.
	const i18n = await import('svelte-i18n');
	const { default: ca } = await import('../../src/services/i18n/locales/ca.json');
	i18n.addMessages('ca', ca);
	i18n.init({ fallbackLocale: 'ca', initialLocale: 'ca' });
	await i18n.waitLocale('ca');
	const library = await import('@testing-library/svelte');
	const { default: AnalyticsOptOut } = await import('$components/core/AnalyticsOptOut.svelte');
	return {
		...library.render(AnalyticsOptOut, { props: {} }),
		fireEvent: library.fireEvent
	};
}

describe('AnalyticsOptOut', () => {
	it('opens on, for a browser that has never objected', async () => {
		const { getByRole } = await mount();
		expect((getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
	});

	it('opens off, for a browser that has', async () => {
		localStorage.setItem(KEY, '1');
		const { getByRole } = await mount();
		expect((getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
	});

	it('switching it off is what stops the counter, not what the component believes', async () => {
		const { getByRole, fireEvent } = await mount();
		const toggle = getByRole('checkbox') as HTMLInputElement;
		await fireEvent.click(toggle);
		expect(localStorage.getItem(KEY)).toBe('1');
	});

	it('switching it back on leaves nothing behind', async () => {
		localStorage.setItem(KEY, '1');
		const { getByRole, fireEvent } = await mount();
		await fireEvent.click(getByRole('checkbox'));
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});
