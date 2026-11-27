/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as jsdom from 'jsdom';
import * as csv from '../../js/csv';

// A table shaped like the one table.ts builds: a header row, data rows whose
// cells are classed azad_numeric_yes/no, and a footer row of totals.
function makeTable(rows: [string, string][]): HTMLTableElement {
  const doc = new jsdom.JSDOM('<html><body></body></html>').window.document;
  const table = doc.createElement('table');

  const addRow = (cells: [string, string], tag: string) => {
    const tr = table.insertRow();

    cells.forEach((text, i) => {
      const cell = doc.createElement(tag);
      cell.setAttribute(
        'class', i == 1 ? 'azad_numeric_yes' : 'azad_numeric_no');
      cell.textContent = text;
      tr.appendChild(cell);
    });
  };

  addRow(['description', 'total'], 'th');
  rows.forEach(r => addRow(r, 'td'));
  addRow(['', 'totals row'], 'td');
  return table;
}

function parseCsv(s: string): string[][] {
  // Good enough for these tests: no embedded newlines.
  return s.replace(/^\ufeff/, '').split('\n').map(line => {
    const cells: string[] = [];
    const re = /("(?:[^"]|"")*"|[^,]*)(,|$)/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(line)) !== null) {
      const raw = m[1];
      cells.push(
        raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw);

      if (m[2] === '') {
        break;
      }
    }

    return cells;
  });
}

describe('neutraliseFormula', () => {
  test.each([
    ['=HYPERLINK("https://example.com","Click me")'],
    ['+cmd|" /C calc"!A0'],
    ['-2+3+cmd|" /C calc"!A0'],
    ['@SUM(1+1)*cmd|" /C calc"!A0'],
    ['\t=1+1'],
    ['\r=1+1'],
    ['\n=1+1'],
    ['=1+1'],
  ])('makes %j plain text', (cell: string) => {
    expect(csv.neutraliseFormula(cell)).toEqual("'" + cell);
  });

  test.each([
    ['Kindle Paperwhite'],
    ['12.34'],
    ['-16.92'],
    ['-£16.92'],
    ['-$1,234.56'],
    ['+12.00'],
    ['- 3,50'],
    [''],
    ['a=b'],
  ])('leaves %j alone', (cell: string) => {
    expect(csv.neutraliseFormula(cell)).toEqual(cell);
  });
});

describe('make_csv_string', () => {
  const evil = '=HYPERLINK("https://example.com","Click me")';

  test('neutralises formula-looking cells from the table', () => {
    const table = makeTable([
      [evil, '12.34'],
      ['@SUM(A1:A2)', '-16.92'],
      ['Kindle Paperwhite', '-£1.00'],
    ]);

    const rows = parseCsv(csv.make_csv_string(table, false));

    expect(rows[1]).toEqual(["'" + evil, '12.34']);
    expect(rows[2]).toEqual(["'@SUM(A1:A2)", '-16.92']);
    expect(rows[3]).toEqual(['Kindle Paperwhite', '-£1.00']);
  });

  test('keeps the SUBTOTAL formulas it writes itself', () => {
    const table = makeTable([
      [evil, '12.34'],
      ['Kindle Paperwhite', '1.00'],
    ]);

    const rows = parseCsv(csv.make_csv_string(table, true));
    const last = rows[rows.length - 1];

    expect(rows[1][0]).toEqual("'" + evil);
    expect(last[0]).toEqual('=SUBTOTAL(103, A2:A3) & " items"');
    expect(last[1]).toEqual('=SUBTOTAL(109,B2:B3)');
  });
});
