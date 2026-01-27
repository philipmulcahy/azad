/* Copyright(c) 2025 Philip Mulcahy. */

const subProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findJava() {
  // Strategy 1: Is it already in the PATH?
  try {
    const command = os.platform() === 'win32' ? 'where java' : 'which java';

    const stdout = subProcess.execSync(
      command, { stdio: 'pipe' }).toString().trim();

    if (stdout) {
      console.log(`✔ Found Java in PATH: ${stdout.split(os.EOL)[0]}`);
      return 'java';
    }
  } catch (e) { /* ignore and move to next strategy */ }

  // Strategy 2: Is JAVA_HOME set? (Checking bin/java or bin/java.exe)
  if (process.env.JAVA_HOME) {
    const suffix = os.platform() === 'win32' ? 'bin/java.exe' : 'bin/java';
    const javaPath = path.join(process.env.JAVA_HOME, suffix);

    if (fs.existsSync(javaPath)) {
      console.log(`✔ Found Java via JAVA_HOME: ${javaPath}`);
      return `"${javaPath}"`; // Quoted for spaces in paths
    }
  }

  // Strategy 3: macOS + Homebrew fallback
  if (os.platform() === 'darwin') {
    try {
      const brewPath = subProcess.execSync(
        'brew --prefix openjdk', { stdio: 'pipe' }).toString().trim();

      const javaPath = path.join(brewPath, 'bin', 'java');

      if (fs.existsSync(javaPath)) {
        console.log(`✔ Found Java via Homebrew: ${javaPath}`);
        return `"${javaPath}"`;
      }
    } catch (e) { /* brew not installed or openjdk not found */ }
  }

  console.error(
    '✘ Error: Java not found. Please install Java or set JAVA_HOME.');

  process.exit(1);
}

function generateParsers() {
  const javaExec = findJava();
  const jarPath = path.join(
    __dirname, '..', 'dev-lib', 'antlr-4.13.2-complete.jar');

  const grammarPath = path.join(
    __dirname, '..', 'src', 'grammar', 'transaction.g4');

  const outputPath = path.join(__dirname, '..', 'src', 'generated');

  console.log('Building ANTLR grammar...');

  const fullCommand = `${javaExec} -jar "${jarPath}" ` +
                      `-Dlanguage=TypeScript -o "${outputPath}" -visitor ` +
                      `-no-listener "${grammarPath}"`;

  console.log(fullCommand);

  try {
    subProcess.execSync(fullCommand, { stdio: 'inherit' });
    console.log('Successfully generated parser files!');
  } catch (err) {
    console.error('Grammar build failed.');
    process.exit(1);
  }
}

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

generateParsers();
updateGitHashFile();
