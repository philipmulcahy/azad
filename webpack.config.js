/* Copyright(c) 2018 Philip Mulcahy. */

const webpack = require("webpack"),
    path = require("path"),
//    fileSystem = require("fs"),
    env = require("./utils/env"),
    CleanWebpackPlugin = require("clean-webpack-plugin"),
    CopyWebpackPlugin = require("copy-webpack-plugin"),
    WriteFilePlugin = require("write-file-webpack-plugin");

// load the secrets
const alias = {};

const fileExtensions = ["jpg", "jpeg", "png", "gif", "svg"];

const options = {
    mode: process.env.NODE_ENV || "development",
    entry: {
        inject: path.join(__dirname, "src", "js", "inject.js"),
        background: path.join(__dirname, "src", "js", "background.js"),
        control: path.join(__dirname, "src", "js", "control.js"),
        alltests: path.join(__dirname, "src", "tests", "all.js")
    },
    output: {
        path: path.join(__dirname, "build"),
        filename: "[name].bundle.js"
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader','css-loader']
            },
            {
                test: new RegExp('\.(' + fileExtensions.join('|') + ')$'),
                loader: "file-loader?name=[name].[ext]",
                exclude: /node_modules/
            },
            {
                test: /\.html$/,
                loader: "html-loader",
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        alias: alias
    },
    plugins: [
        // clean the build folder
        new CleanWebpackPlugin(["build"]),
        // expose and write the allowed env vars on the compiled bundle
        new webpack.EnvironmentPlugin(["NODE_ENV"]),
        new CopyWebpackPlugin([{
            from: "src/manifest.json",
            transform: function (content, path) {
                // generates the manifest file using the package.json informations
                return Buffer.from(
                    JSON.stringify({
                        description: process.env.npm_package_description,
                        version: process.env.npm_package_version,
                        ...JSON.parse(content.toString());
                    })
                )
            }
        }]),
        new CopyWebpackPlugin([{
            from: "src/img/icon48.png"
        }]),
        new CopyWebpackPlugin([{
            from: "src/img/icon128.png"
        }]),
        new CopyWebpackPlugin([{
            from: "src/html/popup.html"
        }]),
        new CopyWebpackPlugin([{
            from: "src/styles/popup.css"
        }]),
        new CopyWebpackPlugin([{
            from: "src/img/sort_asc.png"
        }]),
        new CopyWebpackPlugin([{
            from: "src/img/sort_both.png"
        }]),
        new CopyWebpackPlugin([{
            from: "src/img/sort_desc.png"
        }]),
        new CopyWebpackPlugin([{
            from: "node_modules/datatables/media/css/jquery.dataTables.min.css"
        }]),
        new CopyWebpackPlugin([{
            from: "src/styles/inject.css"
        }]),
        new CopyWebpackPlugin([{
            from: "src/styles/datatables_override.css"
        }])
    ]
};

if (env.NODE_ENV === "development") {
    options.devtool = "inline-source-map";
}

module.exports = options;
// console.log('Hello Webpack World');
