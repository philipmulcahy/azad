/* jshint strict: true, esversion: 6 */
/* jslint node:true */
'use strict';

// tiny wrapper with default env vars
module.exports = {
    NODE_ENV: (process.env.NODE_ENV || "development"),
    PORT: (process.env.PORT || 3000)
};