/* Copyright(c) 2025 Philip Mulcahy. */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpack = require("webpack");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require("../webpack.config");

delete config.chromeExtensionBoilerplate;

webpack(
    config,
    function (err) { if (err) throw err; }
);
