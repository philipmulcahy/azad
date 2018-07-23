/* Copyright(c) 2017 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_csv = (function(){
    "use strict";

    function download(table) {
        var tableToArrayOfArrays = function(table) {
            var rows = table.rows;
            var result = [];
            for(var i=0; i<rows.length; ++i) {
                var cells = rows[i].cells;
                var cell_array = [];
                for(var j=0; j<cells.length; ++j) {
                    cell_array.push(cells[j].textContent);
                }
                result.push(cell_array);
            }
            return result;
        };
        var processRow = function(row) {
            var processCell = function (cell) {
                if (cell === null) {
                    return '';
                }
                var processed = cell.replace(/"/g, '""');
                if (processed.search(/("|,|\n)/g) >= 0) {
                    processed = '"' + processed + '"';
                }
                return processed;
            };
            return row.map(processCell).join(',');
        };
        var csvFile = '\ufeff' + tableToArrayOfArrays(table).map(processRow).join('\n');
        var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", 'amazon_order_history.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return {
        download: download
    };
})();
