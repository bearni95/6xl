/**
 * CSV, read and written to RFC 4180.
 *
 * A table of strings goes out and a table of strings comes back, and nothing here knows
 * what any of them mean — what makes a column an event or a sentence is decided by whoever
 * calls this (see `narration-csv`).
 *
 * The whole point of the file is the two characters a naive `join(',')` gets wrong: a comma
 * inside a field and a quote inside a quoted field. Both are ordinary in authored prose —
 * `Ni {attacker} ni {target}: els dos cops s'aturen` has the first, and a line quoting
 * somebody has the second — so a serializer that could not carry them would silently cut a
 * sentence in half on the way back in. A newline inside a field is the same problem one step
 * further, and is quoted the same way.
 */

/** A field must be quoted when it holds one of the delimiters, a quote of its own, or
 * whitespace at either end — the last because a reader is free to strip unquoted padding,
 * and a sentence that ends in a space is a sentence that ends in a space. */
function needsQuoting(field: string): boolean {
	return (
		field.includes('"') ||
		field.includes(',') ||
		field.includes('\n') ||
		field.includes('\r') ||
		field !== field.trim()
	);
}

/** One field as it is written: bare when it can be, quoted with its own quotes doubled
 * when it cannot. */
export function csvField(field: string): string {
	return needsQuoting(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * A table as a CSV document, CRLF between records and a trailing one.
 *
 * CRLF because that is what RFC 4180 says and what the spreadsheets an author is likely to
 * open this in write themselves; {@link parseCsv} takes either, so a file edited on any
 * machine comes back in.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
	return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * A CSV document as a table of strings.
 *
 * Deliberately forgiving about everything that is not ambiguous, because the file may have
 * been round-tripped through a spreadsheet before it comes back: a leading BOM is dropped
 * (Excel writes one), CR, LF and CRLF all end a record, and a quote that turns up in the
 * middle of an unquoted field is read as the character it is rather than being refused.
 * A blank record comes back as `['']` and is the caller's to ignore — this cannot know
 * whether an empty row is padding or a row of empty fields.
 *
 * The one thing it will not guess at is an unterminated quote: the rest of the file is read
 * as that one field, which is what the format says and what makes the mistake visible where
 * it was made rather than shifting every column after it.
 */
export function parseCsv(text: string): string[][] {
	const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	// Whether anything has been read into the current record at all — separately from the
	// field, because a record of one empty field is a record and a trailing newline is not.
	let open = false;

	const endField = (): void => {
		row.push(field);
		field = '';
	};
	const endRow = (): void => {
		endField();
		rows.push(row);
		row = [];
		open = false;
	};

	for (let at = 0; at < source.length; at++) {
		const char = source[at];

		if (quoted) {
			if (char !== '"') {
				field += char;
			} else if (source[at + 1] === '"') {
				// A doubled quote inside a quoted field is one quote.
				field += '"';
				at++;
			} else {
				quoted = false;
			}
			continue;
		}

		if (char === '"' && field === '') {
			quoted = true;
			open = true;
			continue;
		}
		if (char === ',') {
			endField();
			open = true;
			continue;
		}
		if (char === '\r' || char === '\n') {
			if (char === '\r' && source[at + 1] === '\n') at++;
			endRow();
			continue;
		}
		field += char;
		open = true;
	}

	if (open || field !== '') endRow();
	return rows;
}
