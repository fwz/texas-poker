import { create } from 'zustand';
import type { GameStatePatch, HandHistoryEntry, PublicGameState } from '../../../shared/types';

const AVATARS = [
  '🐼','🦊','🐸','🐯','🦁','🐺','🐻','🦄',
  '🐨','🐹','🐙','🦖','🤖','👾','🦋','🐉',
];

const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

interface GameStore {
  playerId: string | null;
  roomCode: string | null;
  avatar: string;
  gameState: PublicGameState | null;
  setPlayerId: (id: string) => void;
  setRoomCode: (code: string) => void;
  setAvatar: (avatar: string) => void;
  setGameState: (state: PublicGameState) => void;
  applyGamePatch: (patch: GameStatePatch) => boolean;
  upsertHistoryEntry: (entry: HandHistoryEntry) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  playerId: null,
  roomCode: null,
  avatar: randomAvatar(),
  gameState: null,
  setPlayerId: (id) => set({ playerId: id }),
  setRoomCode: (code) => set({ roomCode: code }),
  setAvatar: (avatar) => set({ avatar }),
  setGameState: (state) => set({ gameState: state }),
  applyGamePatch: (patch) => {
    let applied = false;
    set(current => {
      const previous = current.gameState;
      if (!previous || patch.baseRevision !== previous.revision) return current;

      const { players: playerPatch, ...changes } = patch.changes;
      let players = previous.players;
      if (playerPatch) {
        const removed = new Set(playerPatch.removedIds);
        players = previous.players.filter(player => !removed.has(player.id));
        for (const delta of playerPatch.upserts) {
          const index = players.findIndex(player => player.id === delta.id);
          if (index === -1) {
            players = [...players, delta.changes as typeof players[number]];
          } else {
            players = players.map((player, i) => i === index ? { ...player, ...delta.changes } : player);
          }
        }
      }

      applied = true;
      return {
        gameState: {
          ...previous,
          ...changes,
          players,
          revision: patch.revision,
        },
      };
    });
    return applied;
  },
  upsertHistoryEntry: (entry) => set(current => {
    if (!current.gameState) return current;
    const history = current.gameState.history.filter(item => item.round !== entry.round);
    history.push(entry);
    history.sort((left, right) => left.round - right.round);
    return { gameState: { ...current.gameState, history } };
  }),
  reset: () => set({ playerId: null, roomCode: null, gameState: null }),
}));
