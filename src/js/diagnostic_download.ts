/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import * as save_file from './save_file';

export function save_json_to_file(obj: any, filename: string) {
    save_file.save(JSON.stringify(obj), filename);
}

