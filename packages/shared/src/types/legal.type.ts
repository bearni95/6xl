/**
 * The game's legal documents: which ones there are, what version each is at, and
 * which of them a player is asked to accept before an account exists.
 *
 * The *wording* is not here — it is Catalan prose and lives in the frontend's one
 * catalogue like every other word the player reads (`legal.documents.<id>` in
 * `services/i18n/locales/ca.json`). What lives here is the part code has to agree
 * on across the browser and Postgres: the ids, and the version each document is
 * at. A version is what makes an acceptance mean something — "they accepted the
 * terms" is not a record, "they accepted the terms as they stood on 2026-07-31"
 * is — and it is what tells a returning player the document has moved under them.
 *
 * **Bump the version whenever the text changes in substance.** A typo fixed is not
 * a new version; a new purpose for personal data, a new restriction on the player,
 * or a new recipient is. Bumping it puts every existing player back through the
 * acceptance gate on their next visit (see `services/legal.service.ts`), which is
 * the whole point: consent to a document nobody has read is not consent.
 */

/** The documents the game publishes. */
export enum LegalDocumentId {
	/** The contract between the player and the game. */
	Terms = 'terms',
	/** What personal data is processed, why, on what basis, and by whom. */
	Privacy = 'privacy',
	/** What is kept in the browser's own storage, and why none of it needs a banner. */
	Cookies = 'cookies',
	/** Whose artwork, music, data and characters this is built out of. */
	Attributions = 'attributions'
}

/** Every document, in the order they are offered and read. */
export const LEGAL_DOCUMENTS: readonly LegalDocumentId[] = [
	LegalDocumentId.Terms,
	LegalDocumentId.Privacy,
	LegalDocumentId.Cookies,
	LegalDocumentId.Attributions
] as const;

/**
 * The version each document currently stands at, as the date it was last changed
 * in substance. A date rather than a number because it is also what the reader is
 * shown at the head of the document — one string, so the version a player accepted
 * and the date printed above what they read can never disagree.
 */
export const LEGAL_VERSIONS: Record<LegalDocumentId, string> = {
	[LegalDocumentId.Terms]: '2026-07-31',
	[LegalDocumentId.Privacy]: '2026-08-10',
	[LegalDocumentId.Cookies]: '2026-08-10',
	[LegalDocumentId.Attributions]: '2026-08-10'
};

/**
 * The documents acceptance is actually asked for, and therefore the ones whose
 * version being behind puts a player back through the gate.
 *
 * Only two of the four. The terms are a contract and are *agreed to*. The privacy
 * policy is notice rather than a bargain — the lawful basis for running the game
 * on someone's data is the contract itself (GDPR art. 6(1)(b)), not their consent
 * — but the player is asked to confirm they have read it, and that confirmation is
 * recorded, because "we told them" is a thing a controller has to be able to show
 * (art. 5(2)). The storage note and the attributions are information and nothing
 * else: they are published, linked and versioned, and nobody is asked to sign them.
 */
export const CONSENT_DOCUMENTS: readonly LegalDocumentId[] = [
	LegalDocumentId.Terms,
	LegalDocumentId.Privacy
] as const;

/**
 * How old a player has to say they are.
 *
 * Sixteen, which is not a number about this game — it is the highest floor any of
 * the jurisdictions it can be played from sets. COPPA (US) draws its line at 13;
 * GDPR art. 8 lets each member state pick between 13 and 16 for information
 * society services, and the strictest of them (Germany, the Netherlands, Ireland,
 * Croatia and others) took 16. Asking for the highest is what lets one gate stand
 * everywhere rather than one per country, and it means the game never has to
 * verify a parent — there is no under-16 flow to verify one *for*.
 *
 * It is an attestation, not an age check: nothing here can tell whether it is
 * true. What it does is make an under-16 account a breach of the terms rather than
 * something the game invited, and give the operator a way to act on a report.
 */
export const MINIMUM_AGE = 16;

/**
 * One document accepted, as the acceptance ledger records it — the document, the
 * version of it that was on screen, and when.
 */
export interface LegalAcceptance {
	document: LegalDocumentId;
	version: string;
	acceptedAt: string;
}

/**
 * An acceptance made before there was an account to hang it on.
 *
 * Sign-in leaves the page for Google's consent screen, so the boxes are ticked by
 * somebody the game has no id for yet. This is what is held in the browser across
 * that round trip, and it carries the age attestation too — the one thing the
 * player asserts that is not a document version.
 */
export interface PendingLegalConsent {
	/** The version accepted per document, keyed by id. */
	versions: Partial<Record<LegalDocumentId, string>>;
	/** That they said they were at least {@link MINIMUM_AGE}. */
	ageConfirmed: boolean;
	/** When the boxes were ticked, ISO-8601. */
	at: string;
}

/** Whether `accepted` covers every consent document at its current version. */
export function consentIsCurrent(accepted: Partial<Record<LegalDocumentId, string>>): boolean {
	return CONSENT_DOCUMENTS.every((id) => accepted[id] === LEGAL_VERSIONS[id]);
}

/** The consent documents `accepted` is missing or behind on, in reading order. */
export function outstandingDocuments(
	accepted: Partial<Record<LegalDocumentId, string>>
): LegalDocumentId[] {
	return CONSENT_DOCUMENTS.filter((id) => accepted[id] !== LEGAL_VERSIONS[id]);
}
