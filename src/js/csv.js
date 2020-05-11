/* Copyright(c) 2017-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

"use strict";

import save_file from './save_file';

function download(table, type) {
    const tableToArrayOfArrays = function(table) {
        const rows = table.rows;
        const result = [];
        for(let i=0; i<rows.length + ( type  ?  -1  :  0 ); ++i) {
            let cells = rows[i].cells;
            let cell_array = [];
            for(let j=0; j<cells.length; ++j) {
                let x = cells[j];
                if (x.getAttribute("class").search("azad_numeric_no") == -1) {
                    x = x.textContent.replace(/^([£$]|CAD|EUR|GBP) */, '');
                } else {
                    x = x.textContent;
                }
                cell_array.push(x);
            }
            result.push(cell_array);
        }
// If type==true, replace last row for use in a spreadsheet
        if ( type ) {
            let cells = rows[2].cells;
            let cell_array = [];
            let x = '';
            let y = true;
            for(let j=0; j<cells.length; ++j) {
                if (cells[j].getAttribute("class").search("azad_numeric_no") == -1) {
                    x = '=SUBTOTAL(109,{COL}2:{COL}{LAST})';
                } else {
                    if ( y ) {
                        x = '=SUBTOTAL(103, {COL}2:{COL}{LAST}) & " items"';
                        y = false;
                    } else { x = ''; }
                }
                x = x.replace("{COL}",String.fromCharCode("A".charCodeAt(0) + j))
                     .replace("{COL}",String.fromCharCode("A".charCodeAt(0) + j))
                     .replace("{LAST}", rows.length -1);
                cell_array.push(x);
            }
            result.push(cell_array);
        }
        return result;
    };
    const processRow = function(row) {
        const processCell = function (cell) {
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
