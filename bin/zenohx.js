#!/usr/bin/env node

/**
 * ZenohX NPM Launcher CLI
 * Enables running `npx zenohx` to download and launch the native ZenohX desktop application.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const pkg = require('../package.json');
const VERSION = pkg.version || '0.1.0';
const REPO = 'khanhdew/ZenohX';

function getBinaryInfo() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'linux') {
    return {
      name: 'zenohx',
      assetName: 'zenohx_amd64.AppImage',
      isAppImage: true,
    };
  } else if (platform === 'darwin') {
    return {
      name: 'ZenohX.app',
      assetName: arch === 'arm64' ? 'ZenohX_aarch64.app.tar.gz' : 'ZenohX_x64.app.tar.gz',
      isMacTar: true,
    };
  } else if (platform === 'win32') {
    return {
      name: 'ZenohX.exe',
      assetName: 'ZenohX_x64_en-US.msi.zip',
      isWinZip: true,
    };
  } else {
    throw new Error(`Unsupported OS platform: ${platform}`);
  }
}

function getCacheDir() {
  const home = os.homedir();
  const cacheDir = path.join(home, '.zenohx', `v${VERSION}`);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, { headers: { 'User-Agent': 'zenohx-npm-launcher' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Failed to download binary: HTTP ${res.statusCode} from ${url}`));
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

async function main() {
  try {
    const info = getBinaryInfo();
    const cacheDir = getCacheDir();
    const targetPath = path.join(cacheDir, info.assetName);

    console.log(`\x1b[36m[ZenohX]\x1b[0m Launching ZenohX v${VERSION} for ${os.platform()}-${os.arch()}...`);

    if (!fs.existsSync(targetPath)) {
      const downloadUrl = `https://github.com/${REPO}/releases/download/v${VERSION}/${info.assetName}`;
      console.log(`\x1b[33m[ZenohX]\x1b[0m Downloading binary from GitHub Releases...`);
      console.log(`         ${downloadUrl}`);
      await downloadFile(downloadUrl, targetPath);

      if (info.isAppImage) {
        fs.chmodSync(targetPath, 0o755);
      }
      console.log(`\x1b[32m[ZenohX]\x1b[0m Download complete.`);
    }

    // Launch binary
    let child;
    if (info.isAppImage) {
      child = spawn(targetPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: true,
      });
    } else if (os.platform() === 'darwin') {
      child = spawn('open', ['-a', targetPath, '--args', ...process.argv.slice(2)], {
        stdio: 'inherit',
        detached: true,
      });
    } else {
      child = spawn(targetPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: true,
      });
    }

    child.unref();
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31m[ZenohX Error]\x1b[0m ${err.message}`);
    console.error(`Download directly from: https://github.com/${REPO}/releases/latest`);
    process.exit(1);
  }
}

main();
