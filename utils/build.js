const webpack = require("webpack");
const config = require("../webpack.config");
const subProcess = require('child_process');

function updateGitHashFile() {
  subProcess.exec('sh utils/updateGitHashFile.sh', (err, stdout, stderr) => {
    if (err) {
      console.error(err)
      process.exit(1)
    } else {
      console.log(`stdout: ${stdout.toString()}`)
      console.log(`stderr: ${stderr.toString()}`)
    }
  });
}

delete config.chromeExtensionBoilerplate;

updateGitHashFile();

webpack(
    config,
    function (err) { if (err) throw err; }
);
