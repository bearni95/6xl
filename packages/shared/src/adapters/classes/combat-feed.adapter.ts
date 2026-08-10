import { AdapterClass } from './adapter.class';
import { isSpawnColor } from '../../utils/spawn/color';
import type { CombatFeedEntry, CombatFeedPlayer } from '../../types/combat-feed.type';
import type { CombatOutcome } from '../../types/combat.type';

const OUTCOMES: CombatOutcome[] = ['win', 'lose', 'draw'];

/**
 * Reads a finished fight off the broadcast channel (`combat-feed.type`) into the
 * internal model.
 *
 * The payload is `jsonb` built in Postgres and delivered through a socket, so it arrives
 * as `unknown` and is parsed defensively — the same posture as `battle.adapter`, and for a
 * stronger reason: this is a **public** topic, and a public topic is something anybody
 * holding the anon key can publish onto. Nothing here trusts what it is handed. A message
 * without the two things a feed line cannot be drawn without — the record it names and the
 * town it was over — is not a fight anybody can show, and comes back null rather than as a
 * half-read entry with blanks in it.
 *
 * Everything else is bounded rather than refused: a count that is not a number reads as
 * zero, an outcome that is not one of the three reads as a draw, a colour that is not a
 * spawn colour reads as no colour. A line drawn from a nonsense message says something
 * dull; it never says something wrong about a player.
 */
export class CombatFeedAdapter extends AdapterClass {
	constructor() {
		super('combat-feed');
	}

	/** One broadcast payload as a feed entry, or null when it is not one. */
	fromBroadcast(payload: unknown): CombatFeedEntry | null {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
		const record = payload as Record<string, unknown>;

		const id = this.text(record.id);
		const locationId = this.text(record.town);
		if (!id || !locationId) return null;

		return {
			id,
			// A message with no time on it is one that has just arrived, which is the only
			// honest thing to say about it — and keeps it in order with the rest.
			at: this.text(record.at) || new Date().toISOString(),
			outcome: OUTCOMES.includes(record.outcome as CombatOutcome)
				? (record.outcome as CombatOutcome)
				: 'draw',
			exp: this.count(record.exp),
			survivors: this.count(record.survivors),
			fielded: this.count(record.fielded),
			rivals: this.count(record.rivals),
			locationId,
			captured: record.captured === true,
			stale: record.stale === true,
			player: this.playerFromJson(record.player)
		};
	}

	/** The player a fight is announced under. Anonymous where the account has never named
	 * itself — which the feed letters in its own words rather than inventing one here. */
	private playerFromJson(value: unknown): CombatFeedPlayer {
		const record =
			value && typeof value === 'object' && !Array.isArray(value)
				? (value as Record<string, unknown>)
				: {};
		return {
			id: this.text(record.id) || null,
			name: this.text(record.name) || null,
			characterId: this.text(record.character_id) || null,
			color: isSpawnColor(record.color) ? record.color : null,
			level: Math.max(1, this.count(record.level) || 1)
		};
	}

	private text(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	private count(value: unknown): number {
		const parsed = Math.trunc(Number(value ?? 0));
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	}
}

export const combatFeedAdapter = new CombatFeedAdapter();
