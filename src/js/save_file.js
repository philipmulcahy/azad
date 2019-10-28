/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

"use strict";

function save(file_content_string, filename) {
    const blob = new Blob([file_content_string], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export default {
    save: save
};
