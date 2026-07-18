/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getChromePath() {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (process.platform === 'win32') {
    const paths = [
      path.join(process.env['ProgramFiles'], 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['LocalAppData'], 'Google/Chrome/Application/chrome.exe')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'chrome.exe';
  } else {
    return 'google-chrome';
  }
}

function launch() {
  const configPath = path.resolve(__dirname, '../selenium.config.json');
  let userDataDir = '/Users/philip/Library/Application Support/Google/ChromeTest';
  let profileDir = 'Default';
  let site = 'amazon.com';

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.chromeUserDataDir) userDataDir = config.chromeUserDataDir;
      if (config.chromeProfileDir) profileDir = config.chromeProfileDir;
      if (config.amazonSite) site = config.amazonSite;
    } catch (e) {
      console.warn('Failed to parse config:', e);
    }
  }

  const chromePath = getChromePath();
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    '--use-mock-keychain',
    '--password-store=basic',
    `https://www.${site}/gp/css/order-history`
  ];

  console.log(`Launching Chrome: ${chromePath}`);
  console.log(`Using user-data-dir: ${userDataDir}`);
  console.log(`Using profile: ${profileDir}`);
  console.log('Please log into Amazon, check "Keep me signed in", complete 2FA, and then close the browser window.');

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

launch();
