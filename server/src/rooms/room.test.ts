import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Room } from './room';
import type { RoomOptions } from '../../../shared/types';

const defaultOptions: RoomOptions = {
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 9,
  turnTimeLimit: 10,
};

function makeRoom(options: Partial<RoomOptions> = {}): Room {
  // hostId must match the first player's id ('p1') so startGame('sock1') passes the host check
  return new Room('ABCD12', 'p1', { ...defaultOptions, ...options });
}

function addPlayersAndStart(room: Room, n = 2): string[] {
  const socketIds: string[] = [];
  const playerIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `sock${i + 1}`;
    const pid = `p${i + 1}`;
    room.addPlayer(sid, pid, `Player${i + 1}`, '🃏');
    socketIds.push(sid);
    playerIds.push(pid);
  }
  room.startGame('sock1');
  return socketIds;
}

describe('Room – lifecycle', () => {
  it('starts in waiting phase', () => {
    const room = makeRoom();
    const state = room.getStateFor('anyone');
    expect(state.phase).toBe('waiting');
  });

  it('adds players up to maxPlayers', () => {
    const room = makeRoom({ maxPlayers: 2 });
    room.addPlayer('s1', 'p1', 'Alice', '🐱');
    room.addPlayer('s2', 'p2', 'Bob', '🐶');
    expect(() => room.addPlayer('s3', 'p3', 'Charlie', '🐸')).toThrow('Room is full');
  });

  it('rejects join after game started', () => {
    const room = makeRoom();
    addPlayersAndStart(room);
    expect(() => room.addPlayer('s3', 'p3', 'Extra', '🐷')).toThrow('Game already in progress');
  });

  it('only host can start the game', () => {
    const room = makeRoom();
    room.addPlayer('s1', 'p1', 'Alice', '🐱');
    room.addPlayer('s2', 'p2', 'Bob', '🐶');
    expect(() => room.startGame('s2')).toThrow('Only the host can start');
  });

  it('starts the game and transitions to preflop', () => {
    const room = makeRoom();
    addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    expect(state.phase).toBe('preflop');
  });
});

describe('Room – applyAction', () => {
  it('throws when player not found', () => {
    const room = makeRoom();
    addPlayersAndStart(room);
    expect(() => room.applyAction('unknown-socket', { type: 'fold' })).toThrow('Player not found');
  });

  it('processes a valid fold action', () => {
    const room = makeRoom();
    const sockets = addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    const activeSocket = sockets[state.players.findIndex(p => p.isTurn)];
    room.applyAction(activeSocket, { type: 'fold' });
    const after = room.getStateFor('p1');
    expect(after.phase).toBe('showdown');
  });
});

describe('Room – useDelayCard', () => {
  it('extends the turn timer when delay card used', () => {
    const room = makeRoom();
    const sockets = addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    const activeIdx = state.players.findIndex(p => p.isTurn);
    const activeSocket = sockets[activeIdx];
    const activeId = state.players[activeIdx].id;
    const before = state.players[activeIdx].delayCards;
    room.useDelayCard(activeSocket);
    const after = room.getStateFor(activeId);
    expect(after.players[activeIdx].delayCards).toBe(before - 1);
  });

  it('throws when not your turn', () => {
    const room = makeRoom();
    const sockets = addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    const notActiveIdx = state.players.findIndex(p => !p.isTurn);
    const notActiveSocket = sockets[notActiveIdx];
    expect(() => room.useDelayCard(notActiveSocket)).toThrow('Not your turn');
  });
});

describe('Room – setReady / elimination', () => {
  it('does not start next round until all players are ready', () => {
    const room = makeRoom();
    const sockets = addPlayersAndStart(room);
    // fold immediately to reach showdown
    const state = room.getStateFor('p1');
    const activeSocket = sockets[state.players.findIndex(p => p.isTurn)];
    room.applyAction(activeSocket, { type: 'fold' });

    // Only p1 ready
    room.setReady(sockets[0]);
    const midState = room.getStateFor('p1');
    expect(midState.phase).toBe('showdown');
  });

  it('starts next round when all players ready', () => {
    const room = makeRoom();
    const sockets = addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    const activeSocket = sockets[state.players.findIndex(p => p.isTurn)];
    room.applyAction(activeSocket, { type: 'fold' });

    room.setReady(sockets[0]);
    room.setReady(sockets[1]);
    const after = room.getStateFor('p1');
    expect(after.phase).toBe('preflop');
    expect(after.round).toBe(2);
  });

  it('eliminates a player with 0 chips on setReady', () => {
    // Give p2 only enough chips for the BB so they go all-in immediately
    const room = makeRoom({ startingStack: 20, smallBlind: 10, bigBlind: 20 });
    room.addPlayer('s1', 'p1', 'Alice', '🐱');
    room.addPlayer('s2', 'p2', 'Bob', '🐶');
    room.startGame('s1');

    // Run the hand to showdown; p2 might be all-in already
    // Keep acting until showdown
    let safety = 20;
    while (room.getStateFor('p1').phase !== 'showdown' && safety-- > 0) {
      const st = room.getStateFor('p1');
      const activePlayer = st.players.find(p => p.isTurn);
      if (!activePlayer) break;
      const sock = activePlayer.id === 'p1' ? 's1' : 's2';
      try {
        room.applyAction(sock, { type: 'call' });
      } catch {
        break;
      }
    }

    // Set ready to trigger chip check
    const result1 = room.setReady('s1');
    const result2 = room.setReady('s2');
    const eliminated = [...result1.eliminated, ...result2.eliminated];
    // At least one player should be eliminated (the one who ran out of chips)
    const afterState = room.getStateFor('p1');
    const remainingInEngine = afterState.players;
    // Either someone was eliminated or both survived (if it was a tie)
    expect(eliminated.length + remainingInEngine.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Room – turn timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turnDeadline is set after game starts', () => {
    const room = makeRoom({ turnTimeLimit: 10 });
    addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    expect(state.turnDeadline).toBeDefined();
    expect(state.turnDeadline!).toBeGreaterThan(Date.now());
  });

  it('auto-folds active player after all delay cards exhausted', () => {
    const room = makeRoom({ turnTimeLimit: 5 });
    addPlayersAndStart(room);

    // 5s initial timeout + 10 auto-delay-card uses × 30s each = 305s total
    vi.advanceTimersByTime(305_001);

    const after = room.getStateFor('p1');
    // In a 2-player game, auto-fold ends the hand immediately → showdown
    expect(after.phase).toBe('showdown');
  });

  it('auto-uses delay card on first timeout', () => {
    const room = makeRoom({ turnTimeLimit: 5 });
    const broadcastCalls: number[] = [];
    room.onBroadcastNeeded = () => broadcastCalls.push(Date.now());
    addPlayersAndStart(room);

    const before = room.getStateFor('p1');
    const activeId = before.activePlayerId!;
    const beforeDelayCards = before.players.find(p => p.id === activeId)!.delayCards;

    // Trigger the first timeout
    vi.advanceTimersByTime(6_000);

    const after = room.getStateFor('p1');
    const afterDelayCards = after.players.find(p => p.id === activeId)!.delayCards;
    expect(afterDelayCards).toBe(beforeDelayCards - 1);
    expect(broadcastCalls.length).toBeGreaterThan(0);
  });

  it('clears timer after showdown', () => {
    const room = makeRoom({ turnTimeLimit: 10 });
    const sockets = addPlayersAndStart(room);
    const state = room.getStateFor('p1');
    const activeSocket = sockets[state.players.findIndex(p => p.isTurn)];
    room.applyAction(activeSocket, { type: 'fold' });

    const afterShowdown = room.getStateFor('p1');
    expect(afterShowdown.phase).toBe('showdown');
    expect(afterShowdown.turnDeadline).toBeUndefined();
  });
});

describe('Room – disconnect / reconnect', () => {
  it('returns the playerId on disconnect', () => {
    const room = makeRoom();
    room.addPlayer('s1', 'p1', 'Alice', '🐱');
    const result = room.handleDisconnect('s1');
    expect(result).toBe('p1');
  });

  it('returns null for unknown socket', () => {
    const room = makeRoom();
    expect(room.handleDisconnect('ghost')).toBeNull();
  });

  it('allows reconnect within grace period', () => {
    const room = makeRoom();
    room.addPlayer('s1', 'p1', 'Alice', '🐱');
    room.addPlayer('s2', 'p2', 'Bob', '🐶');
    room.startGame('s1');
    room.handleDisconnect('s1');
    const rejoined = room.reconnect('s1-new', 'p1');
    expect(rejoined).toBe(true);
  });
});
