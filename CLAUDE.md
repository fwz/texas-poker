# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A mobile-first, real-time Texas Hold'em Poker web game for playing with friends. Players create or join a room via a shareable link/code and play together in real-time. No accounts required — players enter a name and join a room.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast HMR, strong typing, wide ecosystem |
| Styling | Tailwind CSS | Mobile-first utility classes, no custom CSS overhead |
| Real-time | Socket.io (client + server) | Rooms, reconnection, fallback transports built-in |
| Backend | Node.js + Express + Socket.io | Same language on both sides, low latency |
| State (server) | In-memory (Map of rooms) | Simple; no DB needed for ephemeral game sessions |
| Deployment | Railway or Fly.io (single service) | WebSocket support, free tier available |

---

## Commands

```bash
# Install all dependencies (run from repo root)
npm install

# Start dev server (frontend + backend concurrently)
npm run dev

# Build for production
npm run build

# Run backend only
npm run server

# Run frontend only (Vite dev server)
npm run client

# Type-check without emitting
npm run typecheck

# Lint
npm run lint
```

The project uses an npm workspace or `concurrently` to run both frontend (`/client`) and backend (`/server`) from the repo root.

---

## Repository Structure

```
texas-poker/
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components (Table, Hand, Chip, ActionBar, etc.)
│   │   ├── hooks/        # useSocket, useGameState, useSound
│   │   ├── pages/        # Home (join/create room), Game
│   │   ├── store/        # Zustand or React context for local client state
│   │   └── types/        # Shared type imports from /shared
│   └── index.html
├── server/               # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── game/         # Core poker engine (deck, hand evaluator, game FSM)
│   │   ├── rooms/        # Room lifecycle, player join/leave/reconnect
│   │   └── index.ts      # Express + Socket.io setup
└── shared/               # Types shared between client and server
    └── types.ts          # GameState, PlayerState, GameAction, SocketEvents
```

---

## Architecture

### Game State Authority

**The server is the sole source of truth.** Clients send actions (fold, call, raise, check); the server validates them, updates game state, and broadcasts the new state to all players in the room. Clients never mutate game state locally.

### Socket Event Contract (defined in `shared/types.ts`)

Client → Server:
- `join_room` `{ roomCode, playerName }`
- `create_room` `{ playerName, options: RoomOptions }`
- `player_action` `{ type: 'fold' | 'call' | 'check' | 'raise', amount?: number }`
- `start_game` (host only)
- `ready` (each player signals ready between rounds)

Server → Client:
- `room_joined` `{ roomCode, playerId, gameState: PublicGameState }`
- `game_state_update` `{ gameState: PublicGameState }`
- `action_error` `{ message: string }`
- `player_disconnected` `{ playerId }` / `player_reconnected` `{ playerId }`

### PublicGameState Shape

The server sends a **sanitized** view — hole cards for other players are hidden (`null`) until showdown:

```ts
interface PublicGameState {
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
  communityCards: Card[]
  pot: number
  currentBet: number
  activePlayerId: string  // whose turn it is
  players: PublicPlayer[]
  myCards: Card[]         // only populated for the receiving player (server sends per-player)
  blinds: { small: number; big: number }
  round: number
}
```

### Poker Engine (`server/src/game/`)

- `deck.ts` — 52-card deck, shuffle (Fisher-Yates), deal
- `evaluator.ts` — 7-card hand ranking (use `pokersolver` or `hand-rank` npm package; do not implement from scratch)
- `engine.ts` — Game finite state machine: manages phases, betting rounds, side pots, all-in logic, winner determination
- `room.ts` — Wraps the engine; handles player seat assignment, reconnection (30s grace period), host transfer on host disconnect

### Mobile UI Priorities

- Poker table rendered as a **centered oval** using CSS (`border-radius: 50%`) or SVG, with player seats arranged around it
- Player seats are positioned absolutely around the oval — calculate positions from seat index and total seat count
- Action bar (Fold / Check / Call / Raise slider) is pinned to the bottom of the viewport
- Pot and community cards are centered on the table
- Minimum tap target: 44×44px for all interactive elements
- No horizontal scroll on 375px viewport width (iPhone SE)
- Landscape mode optional; portrait-first

### Room Codes

- 6-character alphanumeric codes (e.g. `A3KZ91`), generated server-side
- Shareable join URL: `https://<host>/?room=A3KZ91`
- On load, if `?room=` query param is present, auto-populate the room code field

### Reconnection

- Server holds a `disconnectedAt` timestamp per player; if they reconnect within 30s, they resume with the same seat and cards
- After 30s, their hand is auto-folded and their chips are retained (they can rejoin as spectator or a new player takes the seat)

---

## Game Rules Scope (MVP)

- No-Limit Texas Hold'em only
- 2–9 players per room
- Configurable starting stack and blind levels (set by host before game starts)
- Blind escalation: optional, off by default
- Side pots when players are all-in
- Muck vs. show at showdown: winner may muck unless called
- No tournament mode in MVP — cash game style (rebuy not in MVP either)

## Out of Scope for MVP

- User accounts / persistent stats
- Spectator mode
- Chat
- Sound (add as enhancement)
- AI bots
- Pot-Limit or Fixed-Limit variants
