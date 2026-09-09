import {
  HandActionRecord, HandHistoryEntry, HandPlayerRecord,
  PlayerAction, PublicGameState, RoomListEntry, RoomOptions,
} from '../../../shared/types';
import {
  addPlayer, applyAction, createEngine, GameEngineState,
  removePlayer, startRound, toPublicState, useDelayCard,
} from '../game/engine';

const RECONNECT_GRACE_MS = 30_000;
const DELAY_CARD_EXTENSION_MS = 30_000;

interface RoomPlayer {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  disconnectedAt?: number;
}

interface HandLog {
  round: number;
  actions: HandActionRecord[];
  startingChips: Map<string, number>;
  positions: Map<string, 'dealer' | 'sb' | 'bb' | 'other'>;
  peakPot: number;
}

export class Room {
  readonly code: string;
  readonly options: RoomOptions;
  hostId: string;
  players: RoomPlayer[] = [];
  onBroadcastNeeded?: () => void;

  private engine: GameEngineState;
  private readySet = new Set<string>();
  private turnTimer?: ReturnType<typeof setTimeout>;
  private turnDeadline?: number;
  private history: HandHistoryEntry[] = [];
  private currentHandLog: HandLog | null = null;

  constructor(code: string, hostId: string, options: RoomOptions) {
    this.code = code;
    this.hostId = hostId;
    this.options = options;
    this.engine = createEngine(options.smallBlind, options.bigBlind);
  }

  private startTurnTimer(): void {
    clearTimeout(this.turnTimer);
    const limitMs = (this.options.turnTimeLimit ?? 20) * 1000;
    this.turnDeadline = Date.now() + limitMs;
    this.turnTimer = setTimeout(() => this.handleTurnTimeout(), limitMs);
  }

  private clearTurnTimer(): void {
    clearTimeout(this.turnTimer);
    this.turnTimer = undefined;
    this.turnDeadline = undefined;
  }

  private maybeRestartTimer(prev: GameEngineState): void {
    const curr = this.engine;
    if (curr.phase === 'waiting' || curr.phase === 'showdown') {
      this.clearTurnTimer();
      return;
    }
    if (curr.phase !== prev.phase || curr.activePlayerIndex !== prev.activePlayerIndex) {
      this.startTurnTimer();
    }
  }

  private handleTurnTimeout(): void {
    if (this.engine.phase === 'waiting' || this.engine.phase === 'showdown') return;
    const active = this.engine.players[this.engine.activePlayerIndex];
    if (!active?.isActive) return;

    if (active.delayCards > 0) {
      this.engine = useDelayCard(this.engine, active.id);
      this.turnDeadline = Date.now() + DELAY_CARD_EXTENSION_MS;
      this.turnTimer = setTimeout(() => this.handleTurnTimeout(), DELAY_CARD_EXTENSION_MS);
      this.onBroadcastNeeded?.();
      return;
    }

    const canCheck = active.bet >= this.engine.currentBet;
    const autoAction: PlayerAction = canCheck ? { type: 'check' } : { type: 'fold' };
    try {
      const prev = this.engine;
      this.recordAction(active.id, autoAction, prev);
      this.engine = applyAction(this.engine, active.id, autoAction);
      this.maybeRestartTimer(prev);
      if (this.engine.phase === 'showdown') {
        this.finalizeHandLog();
        this.readySet.clear();
      }
    } catch { /* ignore edge cases */ }
    this.onBroadcastNeeded?.();
  }

  // ── History tracking ──────────────────────────────────────────────

  private startHandLog(): void {
    const startingChips = new Map<string, number>();
    const positions = new Map<string, 'dealer' | 'sb' | 'bb' | 'other'>();

    // Use toPublicState to get position info
    const anyId = this.players[0]?.id ?? '';
    const pub = toPublicState(this.engine, anyId, this.code, this.hostId);
    for (const p of pub.players) {
      if (!p.isActive) continue;
      const ep = this.engine.players.find(e => e.id === p.id)!;
      startingChips.set(p.id, ep.chips + ep.totalBetThisRound);
      positions.set(
        p.id,
        p.isDealer ? 'dealer' : p.isSmallBlind ? 'sb' : p.isBigBlind ? 'bb' : 'other',
      );
    }

    this.currentHandLog = {
      round: this.engine.round,
      actions: [],
      startingChips,
      positions,
      peakPot: this.engine.pot,
    };
  }

  private recordAction(playerId: string, action: PlayerAction, stateBefore: GameEngineState): void {
    if (!this.currentHandLog) return;
    if (stateBefore.phase === 'showdown' || stateBefore.phase === 'waiting') return;
    const street = stateBefore.phase as HandActionRecord['street'];

    const ep = stateBefore.players.find(p => p.id === playerId);
    if (!ep) return;

    let amount: number | undefined;
    if (action.type === 'call') {
      amount = Math.min(stateBefore.currentBet - ep.bet, ep.chips);
    } else if (action.type === 'raise') {
      amount = action.amount;
    }

    this.currentHandLog.actions.push({
      playerId,
      playerName: ep.name,
      avatar: ep.avatar,
      actionType: action.type,
      amount,
      street,
    });

    // Track peak pot (pot grows after each call/raise)
    this.currentHandLog.peakPot = Math.max(this.currentHandLog.peakPot, stateBefore.pot);
  }

  private finalizeHandLog(): void {
    if (!this.currentHandLog) return;

    const totalPot = (this.engine.winners ?? []).reduce((s, w) => s + w.amount, 0)
      || this.currentHandLog.peakPot;

    // A real showdown means multiple players made it to 5th street (hand names are set)
    const wasShowdown = (this.engine.winners ?? []).some(w => w.handName.length > 0);

    const players: HandPlayerRecord[] = [];
    for (const ep of this.engine.players) {
      if (!this.currentHandLog.startingChips.has(ep.id)) continue;
      const startChips = this.currentHandLog.startingChips.get(ep.id)!;
      players.push({
        playerId: ep.id,
        name: ep.name,
        avatar: ep.avatar,
        position: this.currentHandLog.positions.get(ep.id) ?? 'other',
        // Only reveal hole cards when there was an actual showdown
        holeCards: (ep.isActive && wasShowdown) ? ep.holeCards : null,
        chipDelta: ep.chips - startChips,
        endChips: ep.chips,
      });
    }

    const winners = (this.engine.winners ?? []).map(w => {
      const ep = this.engine.players.find(p => p.id === w.playerId)!;
      return { playerId: w.playerId, name: ep.name, avatar: ep.avatar, amount: w.amount, handName: w.handName };
    });

    this.history.push({
      round: this.currentHandLog.round,
      communityCards: [...this.engine.communityCards],
      totalPot,
      wasShowdown,
      actions: this.currentHandLog.actions,
      players,
      winners,
    });

    this.currentHandLog = null;
  }

  // ── Public API ────────────────────────────────────────────────────

  addPlayer(socketId: string, playerId: string, name: string, avatar: string): void {
    if (this.players.length >= this.options.maxPlayers) throw new Error('Room is full');
    if (this.engine.phase !== 'waiting') throw new Error('Game already in progress');
    this.players.push({ id: playerId, socketId, name, avatar });
    this.engine = addPlayer(this.engine, playerId, name, avatar, this.options.startingStack);
  }

  reconnect(socketId: string, playerId: string): boolean {
    const p = this.players.find(rp => rp.id === playerId);
    if (!p || !p.disconnectedAt) return false;
    if (Date.now() - p.disconnectedAt > RECONNECT_GRACE_MS) return false;
    p.socketId = socketId;
    p.disconnectedAt = undefined;
    this.engine = {
      ...this.engine,
      players: this.engine.players.map(ep =>
        ep.id === playerId ? { ...ep, isConnected: true } : ep
      ),
    };
    return true;
  }

  leave(socketId: string): string | null {
    const p = this.players.find(rp => rp.socketId === socketId);
    if (!p) return null;

    // If it's their turn mid-game, fold immediately
    if (this.engine.phase !== 'waiting' && this.engine.phase !== 'showdown') {
      const active = this.engine.players[this.engine.activePlayerIndex];
      if (active?.id === p.id && active.isActive) {
        try {
          const prev = this.engine;
          this.recordAction(p.id, { type: 'fold' }, prev);
          this.engine = applyAction(this.engine, p.id, { type: 'fold' });
          this.maybeRestartTimer(prev);
          if (this.engine.phase === 'showdown') this.finalizeHandLog();
        } catch { /* ignore */ }
      }
    }

    // Remove immediately (no grace period)
    this.engine = removePlayer(this.engine, p.id);
    this.players = this.players.filter(rp => rp.id !== p.id);
    if (this.hostId === p.id && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }

    return p.id;
  }

  handleDisconnect(socketId: string): string | null {
    const p = this.players.find(rp => rp.socketId === socketId);
    if (!p) return null;
    p.disconnectedAt = Date.now();
    this.engine = {
      ...this.engine,
      players: this.engine.players.map(ep =>
        ep.id === p.id ? { ...ep, isConnected: false } : ep
      ),
    };

    if (this.engine.phase !== 'waiting' && this.engine.phase !== 'showdown') {
      const active = this.engine.players[this.engine.activePlayerIndex];
      if (active?.id === p.id && active.isActive) {
        try {
          const prev = this.engine;
          this.recordAction(p.id, { type: 'fold' }, prev);
          this.engine = applyAction(this.engine, p.id, { type: 'fold' });
          this.maybeRestartTimer(prev);
          if (this.engine.phase === 'showdown') {
            this.finalizeHandLog();
          }
        } catch { /* ignore */ }
      }
    }

    setTimeout(() => {
      const still = this.players.find(rp => rp.id === p.id);
      if (still?.disconnectedAt && Date.now() - still.disconnectedAt >= RECONNECT_GRACE_MS) {
        this.engine = removePlayer(this.engine, p.id);
        this.players = this.players.filter(rp => rp.id !== p.id);
        if (this.hostId === p.id && this.players.length > 0) {
          this.hostId = this.players[0].id;
        }
      }
    }, RECONNECT_GRACE_MS);

    return p.id;
  }

  startGame(requestingSocketId: string): void {
    const p = this.players.find(rp => rp.socketId === requestingSocketId);
    if (!p || p.id !== this.hostId) throw new Error('Only the host can start the game');
    const prev = this.engine;
    this.engine = startRound(this.engine);
    this.readySet.clear();
    this.startHandLog();
    this.maybeRestartTimer(prev);
  }

  applyAction(socketId: string, action: PlayerAction): void {
    const p = this.players.find(rp => rp.socketId === socketId);
    if (!p) throw new Error('Player not found');
    const prev = this.engine;
    this.engine = applyAction(this.engine, p.id, action);
    this.recordAction(p.id, action, prev);
    this.maybeRestartTimer(prev);
    if (this.engine.phase === 'showdown') {
      this.finalizeHandLog();
      this.readySet.clear();
    }
  }

  useDelayCard(socketId: string): void {
    const p = this.players.find(rp => rp.socketId === socketId);
    if (!p) throw new Error('Player not found');
    const active = this.engine.players[this.engine.activePlayerIndex];
    if (active?.id !== p.id) throw new Error('Not your turn');
    if ((active.delayCards ?? 0) <= 0) throw new Error('No delay cards remaining');
    this.engine = useDelayCard(this.engine, p.id);
    clearTimeout(this.turnTimer);
    const now = Date.now();
    this.turnDeadline = Math.max(now, this.turnDeadline ?? now) + DELAY_CARD_EXTENSION_MS;
    this.turnTimer = setTimeout(() => this.handleTurnTimeout(), this.turnDeadline - now);
  }

  setReady(socketId: string): { eliminated: { playerId: string; socketId: string }[] } {
    const p = this.players.find(rp => rp.socketId === socketId);
    if (!p) return { eliminated: [] };
    this.readySet.add(p.id);

    const eliminated = this.players
      .filter(rp => this.engine.players.find(ep => ep.id === rp.id && ep.chips === 0))
      .map(rp => ({ playerId: rp.id, socketId: rp.socketId }));

    for (const { playerId } of eliminated) {
      this.engine = removePlayer(this.engine, playerId);
      this.players = this.players.filter(rp => rp.id !== playerId);
      if (this.hostId === playerId && this.players.length > 0) {
        this.hostId = this.players[0].id;
      }
    }

    const eligible = this.players.filter(rp =>
      this.engine.players.find(ep => ep.id === rp.id && ep.chips > 0 && ep.isConnected)
    );

    if (this.readySet.size >= eligible.length && eligible.length >= 2) {
      const prev = this.engine;
      this.engine = startRound(this.engine);
      this.readySet.clear();
      this.startHandLog();
      this.maybeRestartTimer(prev);
    }

    return { eliminated };
  }

  getStateFor(playerId: string): PublicGameState {
    const state = toPublicState(this.engine, playerId, this.code, this.hostId);
    state.turnDeadline = this.turnDeadline;
    state.history = this.history;
    return state;
  }

  getPlayerIdBySocket(socketId: string): string | undefined {
    return this.players.find(p => p.socketId === socketId)?.id;
  }

  isEmpty(): boolean {
    return this.players.length === 0;
  }

  getRoomInfo(): RoomListEntry {
    return {
      roomCode: this.code,
      playerCount: this.players.length,
      maxPlayers: this.options.maxPlayers,
      phase: this.engine.phase,
    };
  }
}
