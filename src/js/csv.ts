/* Copyright(c) 2017-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

'use strict';

import * as save_file from './save_file';

function string_or_null(s: string | null | undefined) {
  if (s) {
    return s;
  }
  return '';
}

// Spreadsheets treat a cell that starts with = + - or @ as a formula, and
// some skip a leading tab, carriage return or line feed first. Item titles and other
// cells are sellers' text, so a title such as
// =HYPERLINK("https://example.com","Click me") would be live when the CSV is
// opened. An apostrophe in front makes such a cell plain text.
// Amounts such as "-16.92" or "-£16.92" are left alone, so they stay numbers.
export function neutraliseFormula(cell: string): string {
  if (!/^[=+\-@\t\r\n]/.test(cell)) {
    return cell;
  }

  const amount = /^[-+]?\s*(?:[£$€₹]|AUD|CAD|EUR|GBP|INR|USD)?\s*\d[\d.,\s]*$/;

  if (amount.test(cell)) {
    return cell;
  }

  return "'" + cell;
}

export async function download(
  table: HTMLTableElement,
  sums_for_spreadsheet: boolean,
  file_name: string = 'amazon_order_history.csv',
): Promise<void> {
  const csv_string = make_csv_string(table, sums_for_spreadsheet);
  await save_file.save(csv_string, file_name);
}

// The download's file name, after the table type and the period scraped
// (issue #398): amazon_orders_history_2025.csv,
// amazon_transactions_history_2026-07-08_to_2026-10-08.csv.
export function filename(tableType: string, period: string): string {
  const tidy = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '_')
                               .replace(/^_+|_+$/g, '');

  const parts = ['amazon', tidy(tableType) || 'order', 'history', tidy(period)];
  return parts.filter(p => p).join('_') + '.csv';
}

// "2025"; "2023-2025" for consecutive years; "2019_2023" otherwise.
export function yearsLabel(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);

  if (sorted.length == 0) {
    return '';
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (sorted.length > 1 && last - first == sorted.length - 1) {
    return `${first}-${last}`;
  }

  return sorted.join('_');
}

// Whole calendar years (1 January 00:00 to 31 December 23:59:59.999, local
// time, as iframe-worker builds them) give a yearsLabel; anything else is
// "2026-07-08_to_2026-10-08", in local dates.
export function periodLabel(start: Date, end: Date): string {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return '';
  }

  const wholeYears =
    start.getMonth() == 0 && start.getDate() == 1 &&
    start.getHours() == 0 && start.getMinutes() == 0 &&
    start.getSeconds() == 0 && start.getMilliseconds() == 0 &&
    end.getMonth() == 11 && end.getDate() == 31 &&
    end.getHours() == 23 && end.getMinutes() == 59 &&
    end.getSeconds() == 59 && end.getMilliseconds() == 999;

  if (wholeYears) {
    const years: number[] = [];

    for (let y = start.getFullYear(); y <= end.getFullYear(); ++y) {
      years.push(y);
    }

    return yearsLabel(years);
  }

  const ymd = (d: Date) => [
    d.getFullYear().toString(),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('-');

  return `${ymd(start)}_to_${ymd(end)}`;
}

export function make_csv_string(
  table: HTMLTableElement,
  sums_for_spreadsheet: boolean
): string {
  function tableToArrayOfArrays(table: HTMLTableElement): string[][] {
    const rows: HTMLTableRowElement[] = Array.prototype.slice.call(table.rows);
    const result: string[][] = [];
    for (let i = 0; i < rows.length + (sums_for_spreadsheet ? -1 : 0); ++i) {
      const cells = rows[i].cells;
      const cell_array: string[] = [];
      for (let j = 0; j < cells.length; ++j) {
        let x:
          | HTMLTableDataCellElement
          | HTMLTableHeaderCellElement
          | undefined
          | null
          | string = cells[j];
        if (x?.getAttribute('class')?.search('azad_numeric_no') == -1) {
          x = x?.textContent?.replace(/^([£$]|CAD|EUR|GBP) */, '');
        } else {
          x = x.textContent;
        }
        // Only cells from the table: the sums row below is meant to hold
        // formulas.
        cell_array.push(neutraliseFormula(string_or_null(x)));
      }
      result.push(cell_array);
    }
    if (sums_for_spreadsheet) {
      // replace last row for use in a spreadsheet
      const cells = rows[2].cells;
      const cell_array: string[] = [];
      let x: string = '';
      let y = true;
      for (let j = 0; j < cells.length; ++j) {
        if (cells[j]?.getAttribute('class')?.search('azad_numeric_no') == -1) {
          x = '=SUBTOTAL(109,{COL}2:{COL}{LAST})';
        } else {
          if (y) {
            x = '=SUBTOTAL(103, {COL}2:{COL}{LAST}) & " items"';
            y = false;
          } else {
            x = '';
          }
        }
        x = x
          .replace('{COL}', String.fromCharCode('A'.charCodeAt(0) + j))
          .replace('{COL}', String.fromCharCode('A'.charCodeAt(0) + j))
          .replace('{LAST}', (rows.length - 1).toString());
        cell_array.push(x);
      }
      result.push(cell_array);
    }
    return result;
  }
  function processRow(row: string[]): string {
    const processCell = function (cell: string): string {
      if (!cell) {
        return '';
      }
      let processed = cell.replace(/"/g, '""');
      if (processed.search(/("|,|\n)/g) >= 0) {
        processed = '"' + processed + '"';
      }
      return processed;
    };
    return row.map(processCell).join(',');
  }
  const cell_strings: string[][] = tableToArrayOfArrays(table);
  const row_strings = cell_strings.map(processRow);
  const csv_string = '\ufeff' + row_strings.join('\n');
  return csv_string;
}
