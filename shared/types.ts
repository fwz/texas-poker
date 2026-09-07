export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type HandStreet = 'preflop' | 'flop' | 'turn' | 'river';

export interface HandActionRecord {
  playerId: string;
  playerName: string;
  avatar: string;
  actionType: 'fold' | 'call' | 'check' | 'raise';
  amount?: number;
  street: HandStreet;
}

export interface HandPlayerRecord {
  playerId: string;
  name: string;
  avatar: string;
  position: 'dealer' | 'sb' | 'bb' | 'other';
  holeCards: Card[] | null;
  chipDelta: number;
  endChips: number;
}

export interface HandHistoryEntry {
  round: number;
  communityCards: Card[];
  totalPot: number;
  wasShowdown: boolean;
  actions: HandActionRecord[];
  players: HandPlayerRecord[];
  winners: { playerId: string; name: string; avatar: string; amount: number; handName: string }[];
}
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number };

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  chips: number;
  bet: number;
  totalBetThisRound: number;
  isActive: boolean;
  isConnected: boolean;
  isTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isAllIn: boolean;
  holeCards: Card[] | null;
  seatIndex: number;
  delayCards: number;
  positionLabel: string;
}

export interface RoomListEntry {
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}

export interface PublicGameState {
  phase: GamePhase;
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  activePlayerId: string | null;
  players: PublicPlayer[];
  myCards: Card[];
  blinds: { small: number; big: number };
  round: number;
  minRaise: number;
  roomCode: string;
  hostId: string;
  winners?: { playerId: string; amount: number; handName: string; bestCards?: Card[] }[];
  turnDeadline?: number;
  history: HandHistoryEntry[];
}

export interface RoomOptions {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  turnTimeLimit: number;
}

export interface ClientToServerEvents {
  create_room: (
    payload: { playerName: string; avatar: string; options: RoomOptions },
    callback: (res: { roomCode: string; playerId: string } | { error: string }) => void
  ) => void;
  join_room: (
    payload: { roomCode: string; playerName: string; avatar: string },
    callback: (res: { playerId: string; gameState: PublicGameState } | { error: string }) => void
  ) => void;
  list_rooms: (callback: (rooms: RoomListEntry[]) => void) => void;
  start_game: (
    callback: (res: { ok: boolean } | { error: string }) => void
  ) => void;
  player_action: (
    action: PlayerAction,
    callback: (res: { ok: boolean } | { error: string }) => void
  ) => void;
  ready: () => void;
  use_delay_card: (callback: (res: { ok: boolean } | { error: string }) => void) => void;
}

export interface ServerToClientEvents {
  game_state_update: (state: PublicGameState) => void;
  action_error: (payload: { message: string }) => void;
  player_disconnected: (payload: { playerId: string }) => void;
  player_reconnected: (payload: { playerId: string }) => void;
  player_eliminated: (payload: { playerId: string }) => void;
}
