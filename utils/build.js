/* Copyright(c) 2025 Philip Mulcahy. */

const webpack = require("webpack");
const config = require("../webpack.config");

delete config.chromeExtensionBoilerplate;

webpack(
    config,
    function (err) { if (err) throw err; }
);
