import { describe, it, expect } from 'vitest';
import { csvField, parseCsv, toCsv } from '$utils/csv/csv';

/**
 * The two characters a naive join gets wrong — a comma inside a field and a quote inside a
 * quoted one — plus the newline that is the same problem one step further. Everything here
 * is about a sentence surviving the trip out and back unchanged; a CSV that loses half a
 * line at the first comma would lose it silently.
 */

describe('csv fields', () => {
	it('leaves a plain field bare', () => {
		expect(csvField('exchange')).toBe('exchange');
	});

	it('quotes a field holding a comma', () => {
		expect(csvField('Xoc al mig, i prou')).toBe('"Xoc al mig, i prou"');
	});

	it('doubles a quote inside a quoted field', () => {
		expect(csvField('diu "prou"')).toBe('"diu ""prou"""');
	});

	it('quotes a field holding a newline', () => {
		expect(csvField('one\ntwo')).toBe('"one\ntwo"');
	});

	it('quotes padding, which a reader is otherwise free to strip', () => {
		expect(csvField(' lead')).toBe('" lead"');
		expect(csvField('trail ')).toBe('"trail "');
	});

	it('leaves an apostrophe alone — it is not a CSV quote', () => {
		expect(csvField("s'aturen")).toBe("s'aturen");
	});
});

describe('csv documents', () => {
	it('writes records CRLF-separated with a trailing one', () => {
		expect(toCsv([['a', 'b'], ['c']])).toBe('a,b\r\nc\r\n');
	});

	it('reads back exactly what it wrote, whatever is in the fields', () => {
		const rows = [
			['event', 'line'],
			['hit', 'El cop de {attacker} entra, i {target} cau: el carrer és seu.'],
			['blocked', 'Diu "prou" — i para de ple.'],
			['spent', "{target} ja estava tocat quan {attacker} hi ha arribat, tranquil·lament."],
			['bothLoad', 'una línia\namb un salt dins']
		];
		expect(parseCsv(toCsv(rows))).toEqual(rows);
	});

	it('takes LF, CRLF and CR alike as the end of a record', () => {
		expect(parseCsv('a,b\nc,d\r\ne,f\rg,h')).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f'],
			['g', 'h']
		]);
	});

	it('drops a leading BOM, which a spreadsheet writes', () => {
		expect(parseCsv('﻿event,line')).toEqual([['event', 'line']]);
	});

	it('does not invent a record after the trailing newline', () => {
		expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
	});

	it('keeps an empty field, and a record of nothing but one', () => {
		expect(parseCsv('a,,c\n\n')).toEqual([['a', '', 'c'], ['']]);
	});

	it('reads a quote in the middle of a bare field as the character it is', () => {
		expect(parseCsv('ab"cd,e')).toEqual([['ab"cd', 'e']]);
	});
});
