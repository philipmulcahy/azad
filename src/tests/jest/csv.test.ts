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

describe('csv file name (issue #398)', () => {
  test.each([
    ['orders', '2025', 'amazon_orders_history_2025.csv'],
    ['items', '2023-2025', 'amazon_items_history_2023-2025.csv'],
    ['shipments', '', 'amazon_shipments_history.csv'],
    ['transactions', '2026-07-08_to_2026-10-08',
     'amazon_transactions_history_2026-07-08_to_2026-10-08.csv'],
    ['orders', '2019, 2023', 'amazon_orders_history_2019_2023.csv'],
    ['', '', 'amazon_order_history.csv'],
  ])('%s %j', (tableType, period, expected) => {
    expect(csv.filename(tableType, period)).toEqual(expected);
  });

  test('yearsLabel', () => {
    expect(csv.yearsLabel([2025])).toEqual('2025');
    expect(csv.yearsLabel([2025, 2023, 2024])).toEqual('2023-2025');
    expect(csv.yearsLabel([2023, 2019])).toEqual('2019_2023');
    expect(csv.yearsLabel([2024, 2024])).toEqual('2024');
    expect(csv.yearsLabel([])).toEqual('');
  });

  test('periodLabel: whole years, as iframe-worker builds them', () => {
    expect(csv.periodLabel(
      new Date(2025, 0), new Date(2025, 11, 31, 23, 59, 59, 999),
    )).toEqual('2025');

    expect(csv.periodLabel(
      new Date(2023, 0), new Date(2025, 11, 31, 23, 59, 59, 999),
    )).toEqual('2023-2025');
  });

  test('periodLabel: a range of months', () => {
    expect(csv.periodLabel(
      new Date(2026, 6, 8, 14, 30), new Date(2026, 9, 8, 14, 30),
    )).toEqual('2026-07-08_to_2026-10-08');
  });

  test('periodLabel: invalid dates give no label', () => {
    expect(csv.periodLabel(new Date('x'), new Date())).toEqual('');
  });
});
