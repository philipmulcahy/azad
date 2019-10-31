/* jshint strict: true, esversion: 6 */
/* jslint node:true */
'use strict';

const webpack = require("webpack");
const config = require("../webpack.config");

delete config.chromeExtensionBoilerplate;

webpack(
    config,
    function (err) { if (err) throw err; }
);
