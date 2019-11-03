/* Copyright(c) 2017 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import save_file from './save_file';

function download(table) {
    const tableToArrayOfArrays = function(table) {
        const rows = table.rows;
        const result = [];
        for(let i=0; i<(rows.length-1); ++i) {
            let cells = rows[i].cells;
            let cell_array = [];
            for(let j=0; j<cells.length; ++j) {
                cell_array.push(cells[j].textContent.replace('$',''));
            }
            result.push(cell_array);
        }
        const cells = [
            '=SUBTOTAL(103,A2:A{LAST}) & " items"',
            '',
            '',
            '',
            '=SUBTOTAL(109,E2:E{LAST})',
            '=SUBTOTAL(109,F2:F{LAST})',
            '=SUBTOTAL(109,G2:G{LAST})',
            '=SUBTOTAL(109,H2:H{LAST})',
            '=SUBTOTAL(109,I2:I{LAST})',
        ]
        let cell_array = [];
        for (let j=0; j<cells.length; j++) {
            cell_array.push(cells[j].replace(/{LAST}/g, cells.length+1));
        }
        result.push(cell_array);
        return result;
    };
    const processRow = function(row) {
        const processCell = function (cell) {
            if ( !cell ) {
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
    const csvFile = '\ufeff' + tableToArrayOfArrays(table).map(processRow).join('\n');
    save_file.save(csvFile, 'amazon_order_history.csv');
}

export default {
    download: download
};
