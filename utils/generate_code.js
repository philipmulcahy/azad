/* Copyright(c) 2025 Philip Mulcahy. */

const subProcess = require('child_process');

function updateGitHashFile() {
  subProcess.exec('sh utils/updateGitHashFile.sh', (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      console.log(`stdout: ${stdout.toString()}`);
      console.log(`stderr: ${stderr.toString()}`);
    }
  });
}

updateGitHashFile();

