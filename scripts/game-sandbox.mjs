import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

export function sandboxProfile(root, executable, port) {
  const quote = (value) => JSON.stringify(value);
  const readDirectories = ['server', 'src/game', 'node_modules/ws', 'dist'].map((entry) => path.join(root, entry));
  return `(version 1)
(deny default)
(import "system.sb")
(allow sysctl-read)
(allow file-read-metadata)
(allow process-exec (literal ${quote(executable)}))
(allow file-read*
  (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share")
  (subpath "/opt/homebrew/Cellar")
  (literal "/dev/random") (literal "/dev/urandom") (literal "/dev/null")
  (literal ${quote(path.join(root, 'package.json'))})
  ${readDirectories.map((entry) => `(subpath ${quote(entry)})`).join('\n  ')})
(allow file-map-executable (subpath "/System") (subpath "/usr/lib") (subpath "/opt/homebrew/Cellar"))
(allow network-bind (local ip "localhost:${port}"))
(allow network-inbound (local ip "localhost:${port}"))
(deny network-outbound)
(deny mach-lookup)
(deny file-write*)
`;
}

export function gameEnvironment(port = 8787) {
  // Do not inherit GitHub credentials, HOME, SSH agents, NODE_OPTIONS or DYLD settings.
  return {
    HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
    PATH: '/usr/bin:/bin', OPENSSL_CONF: '/dev/null',
    WS_NO_BUFFER_UTIL: '1', WS_NO_UTF_8_VALIDATE: '1',
    LANG: 'en_US.UTF-8', TZ: 'UTC',
  };
}

export async function sandboxedGame(root, port = 8787) {
  if (process.platform !== 'darwin' || Number(process.versions.node.split('.')[0]) < 26) {
    throw new Error('PC hosting requires macOS sandbox-exec and Node 26 or newer. Refusing to start without isolation.');
  }
  const directory = path.join(root, '.pc-host.local');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const profile = path.join(directory, 'game.sb');
  await writeFile(profile, sandboxProfile(root, process.execPath, port), { mode: 0o600 });
  const readable = ['server', 'src/game', 'node_modules/ws', 'dist', 'package.json'];
  return {
    command: '/usr/bin/sandbox-exec',
    args: [
      '-f', profile, process.execPath,
      '--permission', '--allow-net', '--max-old-space-size=256', '--max-semi-space-size=8',
      ...readable.map((entry) => `--allow-fs-read=${path.join(root, entry)}`),
      path.join(root, 'server/index.js'),
    ],
    options: { cwd: '/', env: gameEnvironment(port) },
  };
}
