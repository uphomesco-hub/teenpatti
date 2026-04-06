# Teen Patti

Peer-hosted Teen Patti prototype built with React, Vite, and PeerJS.

## What is implemented

- Private room creation and join flow with room-code invites
- Host-authoritative WebRTC transport inspired by the `monopoly deal` reference app
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

- The host tab is authoritative. If the host closes the tab, the room closes.
- This is a strong first pass, not a finished production game.
- Betting flow is implemented around a simplified Teen Patti stake model:
  - blind call = current stake
  - blind raise = 2x current stake
  - seen call = 2x current stake
  - seen raise = 4x current stake

## Local development

```bash
npm install
npm run dev
```

Open the Vite URL from the terminal.

## Verification

```bash
npm run build
npm run lint
```
