/* Copyright(c) 2025 Philip Mulcahy. */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const subProcess = require('child_process');
const path = require('path');
const fs = require('fs');

try {
  const projectRoot = path.join(__dirname, '..');
  const hashFile = path.join(projectRoot, 'src', 'generated', 'git_hash.ts');

  const hash = subProcess.execSync('git rev-parse HEAD', {
    cwd: projectRoot,
    stdio: 'pipe',
  }).toString().trim();

  const dirt = subProcess.execSync('git status --porcelain=v2', {
    cwd: projectRoot,
    stdio: 'pipe',
  }).toString().trim();

  const isClean = !dirt;

  const lines = [
    '// THIS FILE IS MACHINE WRITTEN DURING BUILD TO GIVE THE EXTENSION\'S',
    '// CODE KNOWLEDGE OF THE GIT HASH OF THE BUILT REVISION, AND WHETHER',
    '// THE CLIENT WAS \'CLEAN\' (UN-ALTERED FROM THE COMMITTED REVISION.',
    '\'use strict\';',
    '',
  ];

  if (isClean) {
    lines.push(`export function isClean(): boolean { return true; }`);
    lines.push(`export function text(): string { return 'version id: ${hash}'; }`);
  } else {
    lines.push(`export function isClean(): boolean { return false; }`);
    lines.push(`export function text(): string { return 'version id: build included uncommitted changes'; }`);
  }

  lines.push(`export function hash(): string { return '${hash}'; }`);

  fs.mkdirSync(path.dirname(hashFile), { recursive: true });
  fs.writeFileSync(hashFile, lines.join('\n') + '\n', 'utf8');
  console.log(`Generated git hash file: ${hashFile}`);
} catch (err) {
  console.error('Failed to generate git hash file:', err.message);
  process.exit(1);
}
