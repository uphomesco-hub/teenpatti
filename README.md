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

## AWS hosting notes

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
```
