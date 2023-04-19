/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";


// Philip here, reading this in 2023 - WTF?
// I hope that I spent a good amount of time researching this before alighting
// on such skullduggery as you see below.
// In its defense, at least it seems _relatively_ encapsulated, if you ignore
// the ephemeral tampering with document.
// What if there's no document?
// What about concurrency if we're not in a browser?
// Is this the kind of thing https://www.quirksmode was good for in the noughties?
export async function save(file_content_string: string, filename: string): Promise<void> {
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
