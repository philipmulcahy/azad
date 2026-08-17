/* Copyright(c) 2025 Philip Mulcahy. */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed: ${dirPath}`);
  }
}

function removePattern(pattern) {
  const dir = path.dirname(pattern);
  const glob = path.basename(pattern);

  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  const regex = new RegExp('^' + glob.replace(/\*/g, '.*') + '$');

  files.forEach(file => {
    if (regex.test(file)) {
      const filePath = path.join(dir, file);
      fs.rmSync(filePath, { recursive: true, force: true });
      console.log(`Removed: ${filePath}`);
    }
  });
}

const projectRoot = path.join(__dirname, '..');

removePattern(path.join(projectRoot, 'azad*.zip'));
removeDir(path.join(projectRoot, 'build'));
removeDir(path.join(projectRoot, 'build-node'));
removeDir(path.join(projectRoot, 'src', 'generated'));

console.log('Clean complete!');
