/* Copyright(c) 2017 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

function download(table) {
    const tableToArrayOfArrays = function(table) {
        const rows = table.rows;
        const result = [];
        for(let i=0; i<rows.length; ++i) {
            let cells = rows[i].cells;
            let cell_array = [];
            for(let j=0; j<cells.length; ++j) {
                cell_array.push(cells[j].textContent);
            }
            result.push(cell_array);
        }
        return result;
    };
    const processRow = function(row) {
        const processCell = function (cell) {
            if (cell === null) {
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
    const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", 'amazon_order_history.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export default {
    download: download
};
