/* Copyright(c) 2017 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import * as save_file from './save_file';

export function download(table: any) {
    const tableToArrayOfArrays = function(table: { rows: any; }) {
        const rows = table.rows;
        const result = [];
        for (let i=0; i<rows.length; ++i) {
            const cells = rows[i].cells;
            const cell_array = [];
            for (let j=0; j<cells.length; ++j) {
                cell_array.push(cells[j].textContent);
            }
            result.push(cell_array);
        }
        return result;
    };
    const processRow = function(row: any[]) {
        const processCell = function (cell: string) {
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
    const csvFile = '\ufeff' + tableToArrayOfArrays(table).map(processRow)
                                                          .join('\n');
    save_file.save(csvFile, 'amazon_order_history.csv');
}

export default {
    download: download
};
