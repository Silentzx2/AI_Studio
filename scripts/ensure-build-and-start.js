#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
const buildIdPath = path.join(cwd, '.next', 'BUILD_ID');
const standaloneServerPath = path.join(cwd, '.next', 'standalone', 'server.js');
const nextBin = process.platform === 'win32'
  ? path.join(cwd, 'node_modules', '.bin', 'next.cmd')
  : path.join(cwd, 'node_modules', '.bin', 'next');

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  if (!fs.existsSync(buildIdPath)) {
    console.log('No production build found. Building the app first...');
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
  }

  if (fs.existsSync(standaloneServerPath)) {
    await runCommand(process.execPath, [standaloneServerPath]);
  } else {
    await runCommand(nextBin, ['start']);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
