/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */
/* jslint node:true */
'use strict';

import save_file from './save_file';

function save_json_to_file(obj, filename) {
    save_file.save(JSON.stringify(obj), filename);
}

export default {
    save_json_to_file: save_json_to_file
};
