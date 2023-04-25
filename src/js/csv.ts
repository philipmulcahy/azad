/* Copyright(c) 2017-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

"use strict";

import * as save_file from './save_file';

function string_or_null(s: string | null | undefined) {
    if (s) {
        return s;
    }
    return '';
}

export async function download(
    table: HTMLTableElement,
    sums_for_spreadsheet: boolean,
): Promise<void> {
    const tableToArrayOfArrays
            = function(table: HTMLTableElement): (string[])[] {
        const rows: HTMLTableRowElement[]
            = Array.prototype.slice.call(table.rows);
        const result: string[][] = [];
        for(
            let i=0;
            i < rows.length + ( sums_for_spreadsheet ? -1 : 0 );
            ++i
        ) {
            let cells = rows[i].cells;
            let cell_array: string[] = [];
            for(let j=0; j<cells.length; ++j) {
                let x: HTMLTableDataCellElement |
                       HTMLTableHeaderCellElement |
                       undefined |
                       null |
                       string = cells[j];
                if (x?.getAttribute("class")?.search("azad_numeric_no") == -1) {
                    x = x?.textContent?.replace(/^([£$]|CAD|EUR|GBP) */, '');
                } else {
                    x = x.textContent;
                }
                cell_array.push(string_or_null(x));
            }
            result.push(cell_array);
        }
        if (sums_for_spreadsheet) {
            // replace last row for use in a spreadsheet
            let cells = rows[2].cells;
            let cell_array: string[] = [];
            let x: string = '';
            let y = true;
            for(let j=0; j<cells.length; ++j) {
                if (cells[j]?.getAttribute("class")
                            ?.search("azad_numeric_no") == -1) {
                    x = '=SUBTOTAL(109,{COL}2:{COL}{LAST})';
                } else {
                    if (y) {
                        x = '=SUBTOTAL(103, {COL}2:{COL}{LAST}) & " items"';
                        y = false;
                    } else { x = ''; }
                }
                x = x.replace(
                    "{COL}",String.fromCharCode("A".charCodeAt(0) + j)
                ).replace(
                    "{COL}",String.fromCharCode("A".charCodeAt(0) + j)
                ).replace("{LAST}", (rows.length-1).toString());
                cell_array.push(x);
            }
            result.push(cell_array);
        }
        return result;
    };
    const processRow = function(row: string[]): string {
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
    };
    const cell_strings: string[][] = tableToArrayOfArrays(table);
    const row_strings = cell_strings.map(processRow);
    const csvFile = '\ufeff' + row_strings.join('\n');
    await save_file.save(csvFile, 'amazon_order_history.csv');
}
