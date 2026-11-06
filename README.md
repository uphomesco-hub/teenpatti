# Teen Patti

Server-hosted Teen Patti built with React, Vite, Node, and WebSockets.

## What is implemented

- Private room creation and join flow with room-code invites
- Server-authoritative WebSocket transport, so rooms do not depend on the host browser tab
- Single-screen table UI
  - center felt table
  - pot, boot, stake, turn, and controller in the middle
  - all player chip counts visible
  - your hand fixed at the bottom
  - live log in the right rail
- Table rule configuration
  - boot amount
  - starting chips
  - cards dealt
  - side show toggle
  - show toggle
  - winner-controls-next-round toggle
- Presets
  - `Classic`
  - `AK47`
  - `Pick 4 Keep 3`
- Round engine support for
  - boot collection
  - blind and seen play
  - discard-to-3 flow when more than 3 cards are dealt
  - call / raise / pack
  - side show request and response
  - final show between 2 players
  - Teen Patti hand evaluation with wildcard joker ranks

## Notes

- The Node server is authoritative. If a player closes their tab, the room stays on the server and the player can reconnect with the stored token.
- Rooms are kept in memory. A process restart clears active tables.
- Players may go below zero during the current hand. Winning the pot first
  offsets their negative balance. Losing, packing, or timing out with less than
  the next boot removes them from play until they choose **Rejoin**. Rejoining
  gives them the configured starting chips and queues them for the next hand.
- Host chip allocations are allowed only between hands. Changing starting chips
  after play begins affects new joins/rejoins, preserving existing balances.
- Betting flow is implemented around a simplified Teen Patti stake model:
  - blind call = current stake
  - blind raise = 2x current stake
  - seen call = 2x current stake
  - seen raise = 4x current stake

## Local development

Run the WebSocket server in one terminal:

```bash
npm run dev:server
```

Run the Vite frontend in another terminal:

```bash
npm run dev
```

The development frontend connects to `ws://localhost:8787/ws` by default.

## Production

Build and run one server that serves both the frontend and WebSocket endpoint:

```bash
npm ci
npm run build
npm start
```

The server listens on `PORT` and exposes:

- `/` for the built React app
- `/ws` for WebSocket multiplayer
- `/health` for load balancer health checks

When the frontend is served from a separate host, set:

```bash
VITE_WS_URL=wss://your-game-domain.example.com/ws
```

## Hosting from your PC (macOS)

Permanent game link: **https://uphomesco-hub.github.io/teenpatti/**

GitHub Pages serves the game interface. The authoritative game server runs on
your PC, reached through a Cloudflare Quick Tunnel. Invite links keep the same
Pages address. The frontend discovers the current tunnel from the public
`server.json` on this repository's `pc-host` branch. No AWS service is required.

Install once, using Node 26 or newer, the GitHub CLI signed in to this repository, and cloudflared:

```bash
brew install cloudflared
npm ci
npm run build
npm run host:install
```

The login service `com.uphomes.teenpatti.pc-host` starts the server and tunnel at
login, restarts after a process failure, and publishes a new tunnel address when
needed. It binds Node to `127.0.0.1:8787` and uses `caffeinate` to prevent idle
sleep while hosting. The screen can still sleep normally. Keep the PC powered,
logged in, connected to the internet, and the laptop lid open. Shutdown, logout,
manual sleep, and lost internet interrupt games. Active rooms are not saved
across server restarts. Quick Tunnels have no uptime guarantee.

Logs are in `.pc-host.local/server.log` and `.pc-host.local/error.log`.
GitHub CLI credentials stay in the existing local credential store. Only the
public tunnel URL and its update time are published, never player data or tokens.

### PC protection

The game process runs inside a macOS deny-by-default sandbox. It can read only
the game runtime, public build and required system libraries; it cannot read
personal files, write files, launch a shell, contact other local services, or
make outbound network connections. Node's permission flags add a second layer,
and the game receives a clean environment without GitHub credentials or SSH
agents. Its V8 heap is capped at 256 MB. The address publisher runs separately.
Hosting refuses to start if the sandbox cannot be applied.

Node binds only to localhost. Cloudflare forwards only to that local game port;
no router port forwarding is needed. HTTP serves an allowlist of public build
assets and rejects filesystem escapes. WebSockets validate command types,
reject messages over 16 KB, limit commands/connections/rooms, and reject browser
origins other than the game origin and the permanent Pages origin. Room codes
use cryptographic randomness; host actions still require the host session.

These controls reduce risk, but cannot guarantee protection from every future
OS, runtime or tunnel vulnerability. Keep macOS, Node and cloudflared updated.
Run `npm audit` when updating the app. `npm run host:install` must be rerun if a
Node upgrade removes the executable path recorded in the login service.

After a code update, rebuild and restart the service between games:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.uphomes.teenpatti.pc-host
```

To stop hosting and disable login startup:

```bash
launchctl bootout gui/$(id -u)/com.uphomes.teenpatti.pc-host
```

To enable it again, run `npm run host:install`. For a foreground session, use
`npm run host:pc` with the login service stopped.

## Optional AWS hosting

Use one always-on Node runtime that supports WebSocket upgrades, such as EC2, ECS/Fargate, Lightsail containers, Elastic Beanstalk, or App Runner. Static-only services like S3 website hosting are not enough for multiplayer because `/ws` must stay connected.

Server rules:

- expose the app on `PORT` and forward HTTPS WebSocket upgrades to `/ws`
- use sticky sessions if you run more than one instance, or add shared room storage before horizontal scaling
- keep `/health` as the load balancer health check path
- run the process under a restart policy
- terminate TLS at the load balancer/reverse proxy so browsers use `wss://`

The included `Dockerfile` builds the Vite app and runs `npm start`, so it can be deployed directly to an AWS container service.

## Verification

```bash
npm run build
npm run lint
npm test
```
