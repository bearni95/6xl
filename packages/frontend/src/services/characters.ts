import { characters, type CharacterOption } from '@3xl/data';

/**
 * The local character registry, read as a lookup.
 *
 * A character is called whatever the admin's `/characters` screen says it is called —
 * `label` on its own `definition.json`, carried into the generated registry — and that
 * is the one name the game letters anywhere: Cor Petit, not `piccolo`, and not the
 * `Piccolo` the MUGEN archive happened to ship under. Every surface that holds a card
 * holds a **character id** (a `character_spawns` row stores nothing else), so turning one
 * into a name is a thing the whole app does, and it is done here so there is one answer
 * to it rather than a `charactersById` built afresh in each screen that needs one.
 */
export const charactersById: ReadonlyMap<string, CharacterOption> = new Map(
	characters.map((character) => [character.id, character])
);

/**
 * A character's display name, falling back to its id: an archive that no longer holds a
 * character must not take the card off the screen with it — a cell lettered with an id is
 * ugly, and an empty one is a card the player owns and cannot see.
 */
export function characterLabel(id: string | null | undefined): string {
	if (!id) return '';
	return charactersById.get(id)?.label ?? id;
}
