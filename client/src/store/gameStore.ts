import { create } from 'zustand';
import type { PublicGameState } from '../../../shared/types';

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
  reset: () => set({ playerId: null, roomCode: null, gameState: null }),
}));
