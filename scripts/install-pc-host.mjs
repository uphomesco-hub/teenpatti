import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = 'com.uphomes.teenpatti.pc-host';
const agents = path.join(os.homedir(), 'Library/LaunchAgents');
const logs = path.join(root, '.pc-host.local');
const plist = path.join(agents, `${label}.plist`);
const domain = `gui/${process.getuid()}`;
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

if (process.platform !== 'darwin') throw new Error('This login service installer is for macOS.');
execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
execFileSync('cloudflared', ['--version'], { stdio: 'ignore' });
await mkdir(agents, { recursive: true });
await mkdir(logs, { recursive: true });
await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(root, 'scripts/pc-host.mjs'))}</string></array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${xml(`${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`)}</string>
    <key>HOME</key><string>${xml(os.homedir())}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(path.join(logs, 'server.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logs, 'error.log'))}</string>
</dict></plist>
`);
try { execFileSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' }); } catch { /* First installation. */ }
execFileSync('launchctl', ['bootstrap', domain, plist], { stdio: 'inherit' });
console.log('Installed PC game server. Starts now and automatically at login.');
console.log('Permanent game link: https://uphomesco-hub.github.io/teenpatti/');
console.log(`Logs: ${logs}`);
