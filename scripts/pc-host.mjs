import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'uphomesco-hub/teenpatti';
const children = new Set();
let stopping = false;
let tunnel;
let tunnelUrl = '';
let publishedUrl = '';
let publishing = false;
let readyAt = 0;

function child(command, args, options = {}) {
  const process = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  children.add(process);
  process.once('exit', () => children.delete(process));
  return process;
}

async function github(endpoint, options = []) {
  const { stdout } = await exec('gh', ['api', `repos/${repository}/${endpoint}`, ...options], {
    cwd: root, timeout: 30_000,
  });
  return stdout ? JSON.parse(stdout) : null;
}

async function publishAddress() {
  if (stopping || publishing || !tunnelUrl || !readyAt || Date.now() < readyAt || tunnelUrl === publishedUrl) return;
  publishing = true;
  const url = tunnelUrl;
  try {
    // Do not advertise the address until both HTTP and WebSocket server are up.
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !(await response.json()).ok) throw new Error('Tunnel health check failed');
    try {
      await github('git/ref/heads/pc-host');
    } catch (error) {
      if (!error.message.includes('404')) throw error;
      const main = await github('git/ref/heads/main');
      await github('git/refs', ['--method', 'POST', '-f', 'ref=refs/heads/pc-host', '-f', `sha=${main.object.sha}`]);
    }
    let sha;
    try {
      sha = (await github('contents/server.json?ref=pc-host')).sha;
    } catch (error) {
      if (!error.message.includes('404')) throw error;
    }
    const content = Buffer.from(`${JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2)}\n`).toString('base64');
    await github('contents/server.json', [
      '--method', 'PUT', '-f', 'branch=pc-host', '-f', 'message=Update PC game server address',
      '-f', `content=${content}`, ...(sha ? ['-f', `sha=${sha}`] : []),
    ]);
    publishedUrl = url;
    console.log(`PC server published: ${url}`);
    console.log('Permanent game link: https://uphomesco-hub.github.io/teenpatti/');
  } catch (error) {
    console.error(`Server address publication will retry: ${error.message}`);
  } finally {
    publishing = false;
  }
}

function startTunnel() {
  if (stopping) return;
  tunnelUrl = '';
  publishedUrl = '';
  readyAt = 0;
  tunnel = child('cloudflared', [
    'tunnel', '--url', 'http://127.0.0.1:8787', '--protocol', 'http2', '--no-autoupdate',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '';
  const read = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    buffer = (buffer + text).slice(-12000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
    }
    // Looking up a fresh hostname before registration can cache NXDOMAIN locally.
    if (text.includes('Registered tunnel connection') && !readyAt) {
      readyAt = Date.now() + 15_000;
    }
  };
  tunnel.stdout.on('data', read);
  tunnel.stderr.on('data', read);
  tunnel.once('error', stop);
  tunnel.once('exit', () => {
    if (!stopping) setTimeout(startTunnel, 5000);
  });
}

function stop(error) {
  if (stopping) return;
  stopping = true;
  if (error instanceof Error) console.error(error.message);
  clearInterval(publishTimer);
  for (const process of children) process.kill('SIGTERM');
  setTimeout(() => process.exit(error instanceof Error ? 1 : 0), 3500);
}

const server = child(process.execPath, ['server/index.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '8787' },
});
server.once('error', stop);
server.once('exit', () => {
  if (!stopping) stop(new Error('Game server exited; login service will restart it.'));
});
// Keep the machine available while allowing the screen to sleep normally.
child('/usr/bin/caffeinate', ['-is', '-w', String(process.pid)]).once('error', stop);
const publishTimer = setInterval(() => void publishAddress(), 15_000);
startTunnel();
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
