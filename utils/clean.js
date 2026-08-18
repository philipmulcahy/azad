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

const projectRoot = path.join(__dirname, '..');

// Clean up old zip files
if (fs.existsSync(projectRoot)) {
  const files = fs.readdirSync(projectRoot);
  files.forEach(file => {
    if (/^azad.*\.zip$/.test(file)) {
      const filePath = path.join(projectRoot, file);
      fs.rmSync(filePath, { force: true });
      console.log(`Removed: ${filePath}`);
    }
  });
}

// Clean up build directories
removeDir(path.join(projectRoot, 'build'));
removeDir(path.join(projectRoot, 'build-node'));
removeDir(path.join(projectRoot, 'src', 'generated'));

console.log('Clean complete!');
