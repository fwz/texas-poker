import { describe, it, expect } from 'vitest';
import {
  createEngine, addPlayer, startRound, applyAction, useDelayCard,
  toPublicState, GameEngineState,
} from './engine';

function makeEngine(numPlayers = 2, chips = 1000): GameEngineState {
  let state = createEngine(10, 20);
  for (let i = 0; i < numPlayers; i++) {
    state = addPlayer(state, `p${i + 1}`, `Player${i + 1}`, '🃏', chips);
  }
  return state;
}

function startedEngine(numPlayers = 2, chips = 1000): GameEngineState {
  return startRound(makeEngine(numPlayers, chips));
}

describe('createEngine', () => {
  it('starts in waiting phase', () => {
    const s = createEngine(10, 20);
    expect(s.phase).toBe('waiting');
    expect(s.players).toHaveLength(0);
  });

  it('stores blinds correctly', () => {
    const s = createEngine(5, 10);
    expect(s.smallBlind).toBe(5);
    expect(s.bigBlind).toBe(10);
  });
});

describe('addPlayer', () => {
  it('adds players with correct chip count', () => {
    const s = addPlayer(createEngine(10, 20), 'p1', 'Alice', '🐱', 500);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].chips).toBe(500);
    expect(s.players[0].delayCards).toBe(10);
  });

  it('assigns incrementing seatIndex', () => {
    let s = createEngine(10, 20);
    s = addPlayer(s, 'p1', 'Alice', '🐱', 500);
    s = addPlayer(s, 'p2', 'Bob', '🐶', 500);
    expect(s.players[0].seatIndex).toBe(0);
    expect(s.players[1].seatIndex).toBe(1);
  });
});

describe('startRound', () => {
  it('throws with fewer than 2 players', () => {
    const s = addPlayer(createEngine(10, 20), 'p1', 'Alice', '🐱', 500);
    expect(() => startRound(s)).toThrow();
  });

  it('transitions to preflop', () => {
    const s = startedEngine();
    expect(s.phase).toBe('preflop');
  });

  it('deals 2 hole cards to each active player', () => {
    const s = startedEngine();
    for (const p of s.players) {
      expect(p.holeCards).toHaveLength(2);
    }
  });

  it('posts small and big blind automatically', () => {
    const s = startedEngine();
    const bets = s.players.map(p => p.bet);
    expect(bets).toContain(10); // small blind
    expect(bets).toContain(20); // big blind
  });

  it('sets currentBet to big blind', () => {
    const s = startedEngine();
    expect(s.currentBet).toBe(20);
  });

  it('increments round counter', () => {
    const s = startedEngine();
    expect(s.round).toBe(1);
  });

  it('collects blinds into the pot', () => {
    const s = startedEngine();
    expect(s.pot).toBe(30); // SB 10 + BB 20
  });

  it('uses the button as the small blind and first preflop actor heads-up', () => {
    const s = startedEngine(2);
    const dealer = s.players.find(player => player.isActive && player.seatIndex === s.dealerIndex)!;
    const bigBlind = s.players.find(player => player.bet === s.bigBlind)!;

    expect(dealer.bet).toBe(s.smallBlind);
    expect(dealer.id).not.toBe(bigBlind.id);
    expect(s.players[s.activePlayerIndex].id).toBe(dealer.id);
  });
});

describe('applyAction – fold', () => {
  it('marks the player inactive', () => {
    const s = startedEngine();
    const active = s.players[s.activePlayerIndex];
    const next = applyAction(s, active.id, { type: 'fold' });
    const folded = next.players.find(p => p.id === active.id)!;
    expect(folded.isActive).toBe(false);
  });

  it('ends the round immediately when only one player remains', () => {
    const s = startedEngine(2);
    const active = s.players[s.activePlayerIndex];
    const next = applyAction(s, active.id, { type: 'fold' });
    expect(next.phase).toBe('showdown');
    expect(next.winners).toHaveLength(1);
  });

  it('throws when it is not your turn', () => {
    const s = startedEngine();
    const notActive = s.players.find(p => p.id !== s.players[s.activePlayerIndex].id)!;
    expect(() => applyAction(s, notActive.id, { type: 'fold' })).toThrow('Not your turn');
  });
});

describe('applyAction – check', () => {
  it('allows check when bet matches currentBet', () => {
    // BB is last to act preflop and can check if no raise
    let s = startedEngine(2);
    // p1 is UTG (after BB in HU), calls or raises; here the BB can check after UTG calls
    const active = s.players[s.activePlayerIndex];
    // UTG calls
    s = applyAction(s, active.id, { type: 'call' });
    // Now BB can check
    const bb = s.players[s.activePlayerIndex];
    const next = applyAction(s, bb.id, { type: 'check' });
    expect(next.phase).toBe('flop');
  });

  it('throws when player owes a bet', () => {
    const s = startedEngine(2);
    // UTG must call or raise, not check (big blind is 20, UTG bet is 0)
    const active = s.players[s.activePlayerIndex];
    expect(() => applyAction(s, active.id, { type: 'check' })).toThrow();
  });
});

describe('applyAction – call', () => {
  it('moves chips from player to pot', () => {
    const s = startedEngine(2);
    const active = s.players[s.activePlayerIndex];
    const beforeChips = active.chips;
    const toCall = s.currentBet - active.bet;
    const next = applyAction(s, active.id, { type: 'call' });
    const after = next.players.find(p => p.id === active.id)!;
    expect(after.chips).toBe(beforeChips - toCall);
  });

  it('throws when callAmount is 0 (stale or duplicate call)', () => {
    // Advance to flop where currentBet resets to 0
    let s = startedEngine(2);
    // Call preflop to reach flop
    while (s.phase === 'preflop') {
      const active = s.players[s.activePlayerIndex];
      try { s = applyAction(s, active.id, { type: 'check' }); }
      catch { s = applyAction(s, active.id, { type: 'call' }); }
    }
    expect(s.phase).toBe('flop');
    expect(s.currentBet).toBe(0);
    // A 'call' with currentBet=0 and bet=0 should be rejected
    const active = s.players[s.activePlayerIndex];
    expect(() => applyAction(s, active.id, { type: 'call' })).toThrow('Nothing to call');
  });
});

describe('applyAction – raise', () => {
  it('increases currentBet', () => {
    const s = startedEngine(2);
    const active = s.players[s.activePlayerIndex];
    const next = applyAction(s, active.id, { type: 'raise', amount: 60 });
    expect(next.currentBet).toBe(60);
  });

  it('throws on sub-minimum raise', () => {
    const s = startedEngine(2);
    const active = s.players[s.activePlayerIndex];
    // minRaiseTotal = currentBet(20) + minRaise(20) = 40; raising to 30 is invalid
    expect(() => applyAction(s, active.id, { type: 'raise', amount: 30 })).toThrow();
  });

  it('rejects non-finite and over-stack raise amounts before mutating state', () => {
    const s = startedEngine(2, 100);
    const active = s.players[s.activePlayerIndex];

    expect(() => applyAction(s, active.id, { type: 'raise', amount: Infinity })).toThrow('positive whole number');
    expect(() => applyAction(s, active.id, { type: 'raise', amount: active.chips + active.bet + 1 })).toThrow('exceeds available chips');
    expect(s.currentBet).toBe(20);
  });

  it('re-opens action for other players', () => {
    const s = startedEngine(3);
    const active = s.players[s.activePlayerIndex];
    const next = applyAction(s, active.id, { type: 'raise', amount: 60 });
    // After a full raise, the other active non-all-in players should have hasActedThisRound = false
    const others = next.players.filter(p => p.id !== active.id && p.isActive && !p.isAllIn);
    expect(others.every(p => !p.hasActedThisRound)).toBe(true);
  });
});

describe('phase transitions', () => {
  function fullBettingRound(state: GameEngineState): GameEngineState {
    let s = state;
    let safety = 20;
    while (s.phase === state.phase && safety-- > 0) {
      const active = s.players[s.activePlayerIndex];
      try {
        s = applyAction(s, active.id, { type: 'check' });
      } catch {
        s = applyAction(s, active.id, { type: 'call' });
      }
    }
    return s;
  }

  it('advances from preflop to flop after all call', () => {
    const s = fullBettingRound(startedEngine(2));
    expect(s.phase).toBe('flop');
    expect(s.communityCards).toHaveLength(3);
  });

  it('starts postflop action with the first active seat left of the button', () => {
    let s = fullBettingRound(startedEngine(3));
    const firstLeftOfButton = () => [1, 2, 3]
      .map(offset => (s.dealerIndex + offset) % s.players.length)
      .find(index => s.players[index].isActive && !s.players[index].isAllIn);

    expect(s.phase).toBe('flop');
    expect(s.activePlayerIndex).toBe(firstLeftOfButton());

    s = fullBettingRound(s);
    expect(s.phase).toBe('turn');
    expect(s.activePlayerIndex).toBe(firstLeftOfButton());

    s = fullBettingRound(s);
    expect(s.phase).toBe('river');
    expect(s.activePlayerIndex).toBe(firstLeftOfButton());
  });

  it('advances from flop to turn', () => {
    let s = fullBettingRound(startedEngine(2)); // flop
    s = fullBettingRound(s); // turn
    expect(s.phase).toBe('turn');
    expect(s.communityCards).toHaveLength(4);
  });

  it('advances from turn to river', () => {
    let s = fullBettingRound(startedEngine(2));
    s = fullBettingRound(s);
    s = fullBettingRound(s);
    expect(s.phase).toBe('river');
    expect(s.communityCards).toHaveLength(5);
  });

  it('reaches showdown after river betting', () => {
    let s = fullBettingRound(startedEngine(2));
    s = fullBettingRound(s);
    s = fullBettingRound(s);
    s = fullBettingRound(s);
    expect(s.phase).toBe('showdown');
  });

  it('sets winners at showdown', () => {
    let s = fullBettingRound(startedEngine(2));
    s = fullBettingRound(s);
    s = fullBettingRound(s);
    s = fullBettingRound(s);
    expect(s.winners).toBeDefined();
    expect(s.winners!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('all-in auto-runout', () => {
  it('non-all-in player gets to act on each street when others are all-in', () => {
    // 3 players: A and B have plenty of chips, C has only enough for BB (goes all-in preflop)
    let s = createEngine(10, 20);
    s = addPlayer(s, 'p1', 'Alice', '🐱', 1000);
    s = addPlayer(s, 'p2', 'Bob', '🐶', 1000);
    s = addPlayer(s, 'p3', 'Carol', '🐭', 20); // will go all-in posting BB or calling
    s = startRound(s);

    // Run through preflop: everyone calls/checks until phase changes
    let safety = 20;
    while (s.phase === 'preflop' && safety-- > 0) {
      const active = s.players[s.activePlayerIndex];
      try { s = applyAction(s, active.id, { type: 'check' }); }
      catch { s = applyAction(s, active.id, { type: 'call' }); }
    }

    // At least one non-all-in player (p1 or p2) should still be on flop
    expect(s.phase).toBe('flop');

    // Now: only non-all-in players act. The flop should require their action.
    const firstActor = s.players[s.activePlayerIndex];
    expect(firstActor.isAllIn).toBe(false);

    // After first player checks, we should still be on flop (not jump to river)
    s = applyAction(s, firstActor.id, { type: 'check' });
    expect(s.phase).toBe('flop');
  });

  it('deals all 5 community cards automatically when both players all-in', () => {
    // Give each player just enough chips so they go all-in preflop
    let s = createEngine(10, 20);
    s = addPlayer(s, 'p1', 'Alice', '🐱', 20);
    s = addPlayer(s, 'p2', 'Bob', '🐶', 20);
    s = startRound(s);
    // Both players are posting blinds and go all-in immediately
    // SB = 10, BB = 20; p1 has 20, p2 has 20
    // After posting blinds, p1 (SB) has 10 chips, p2 (BB) has 0 chips (all-in)
    // The game should auto-run
    // If we still need to act, the remaining active player calls/goes all-in
    if (s.phase !== 'showdown') {
      const active = s.players[s.activePlayerIndex];
      if (active.isActive && !active.isAllIn) {
        s = applyAction(s, active.id, { type: 'call' });
      }
    }
    // After the all-in, board should auto-run to showdown
    expect(s.phase).toBe('showdown');
    expect(s.communityCards).toHaveLength(5);
  });
});

describe('side pots', () => {
  it('awards the main pot and side pot to independently eligible winners', () => {
    let s = createEngine(10, 20);
    s = addPlayer(s, 'p1', 'Alice', '🐱', 50);
    s = addPlayer(s, 'p2', 'Bob', '🐶', 100);
    s = addPlayer(s, 'p3', 'Carol', '🐭', 100);
    s = startRound(s);

    // Force p1 to win the 50-chip main-pot tier with a wheel, while p2 wins
    // the 100-chip side pot with three kings.
    s = {
      ...s,
      players: s.players.map(player => ({
        ...player,
        holeCards: player.id === 'p1'
          ? [{ rank: 'A', suit: 'spades' }, { rank: '2', suit: 'clubs' }]
          : player.id === 'p2'
          ? [{ rank: 'K', suit: 'clubs' }, { rank: 'K', suit: 'spades' }]
          : [{ rank: 'J', suit: 'clubs' }, { rank: '10', suit: 'clubs' }],
      })),
      // pop order: burn, 3♥ 4♦ 5♣, burn, K♥, burn, Q♦
      deck: [
        { rank: 'Q', suit: 'diamonds' }, { rank: '2', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' }, { rank: '3', suit: 'spades' },
        { rank: '5', suit: 'clubs' }, { rank: '4', suit: 'diamonds' },
        { rank: '3', suit: 'hearts' }, { rank: '6', suit: 'spades' },
      ],
    };

    // UTG (p2) jams, SB (p3) calls, and short BB (p1) calls all-in.
    s = applyAction(s, s.players[s.activePlayerIndex].id, { type: 'raise', amount: 100 });
    s = applyAction(s, s.players[s.activePlayerIndex].id, { type: 'call' });
    s = applyAction(s, s.players[s.activePlayerIndex].id, { type: 'call' });

    expect(s.phase).toBe('showdown');
    expect(s.sidePots).toEqual([
      { amount: 150, eligiblePlayerIds: ['p1', 'p2', 'p3'] },
      { amount: 100, eligiblePlayerIds: ['p2', 'p3'] },
    ]);
    expect(s.winners).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: 'p1', amount: 150 }),
      expect.objectContaining({ playerId: 'p2', amount: 100 }),
    ]));
    expect(s.winners!.reduce((sum, winner) => sum + winner.amount, 0)).toBe(250);
  });
});

describe('useDelayCard', () => {
  it('decrements the player\'s delay card count', () => {
    const s = makeEngine();
    const before = s.players[0].delayCards;
    const next = useDelayCard(s, 'p1');
    expect(next.players[0].delayCards).toBe(before - 1);
  });

  it('does not go below 0', () => {
    let s = makeEngine();
    s = { ...s, players: s.players.map(p => ({ ...p, delayCards: 0 })) };
    const next = useDelayCard(s, 'p1');
    expect(next.players[0].delayCards).toBe(0);
  });
});

function runToShowdown(initial: GameEngineState): GameEngineState {
  let s = initial;
  let safety = 150;
  while (s.phase !== 'showdown' && safety-- > 0) {
    const active = s.players[s.activePlayerIndex];
    try {
      s = applyAction(s, active.id, { type: 'check' });
    } catch {
      s = applyAction(s, active.id, { type: 'call' });
    }
  }
  return s;
}

describe('profit calculation', () => {
  it('profit = amount won minus totalBetThisRound for the winner', () => {
    // 2 players, 1000 chips each, blinds 10/20
    // After startRound: UTG calls (matches 20), BB checks → pot = 40, both bet 20 total
    let s = startedEngine(2, 1000);
    // UTG calls the big blind
    s = applyAction(s, s.players[s.activePlayerIndex].id, { type: 'call' });
    // BB checks
    s = applyAction(s, s.players[s.activePlayerIndex].id, { type: 'check' });
    // Now check all remaining streets
    let safety = 100;
    while (s.phase !== 'showdown' && safety-- > 0) {
      const active = s.players[s.activePlayerIndex];
      try {
        s = applyAction(s, active.id, { type: 'check' });
      } catch {
        s = applyAction(s, active.id, { type: 'call' });
      }
    }

    expect(s.phase).toBe('showdown');
    expect(s.winners).toBeDefined();
    expect(s.winners!.length).toBeGreaterThanOrEqual(1);

    const winner = s.winners![0];
    const winnerPlayer = s.players.find(p => p.id === winner.playerId)!;

    expect(winner.amount).toBe(40);
    expect(winnerPlayer.totalBetThisRound).toBe(20);
    const profit = winner.amount - winnerPlayer.totalBetThisRound;
    expect(profit).toBe(20);
  });

  it('winner profit is non-negative', () => {
    // 3 players, all calling through to showdown
    const s = runToShowdown(startedEngine(3, 1000));

    expect(s.phase).toBe('showdown');
    expect(s.winners).toBeDefined();

    for (const winner of s.winners!) {
      const winnerPlayer = s.players.find(p => p.id === winner.playerId)!;
      expect(winner.amount).toBeGreaterThanOrEqual(winnerPlayer.totalBetThisRound);
    }
  });
});

describe('card privacy', () => {
  it('hides winner hole cards from opponent when hand ends by fold (no showdown)', () => {
    // p1=SB, p2=BB (2-player: dealer=SB). UTG = p1, so p1 acts first preflop.
    let s = startedEngine(2, 1000);
    const activePlayer = s.players[s.activePlayerIndex];
    // Active player folds — the other player wins without showdown
    s = applyAction(s, activePlayer.id, { type: 'fold' });

    expect(s.phase).toBe('showdown');
    const winner = s.winners![0];
    // handName must be empty (fold win, not real showdown)
    expect(winner.handName).toBe('');

    const loserId = activePlayer.id;
    const winnerId = winner.playerId;

    // Loser's view: winner's hole cards must be hidden
    const stateForLoser = toPublicState(s, loserId, 'TEST01', winnerId);
    const winnerAsSeenByLoser = stateForLoser.players.find(p => p.id === winnerId)!;
    expect(winnerAsSeenByLoser.holeCards).toBeNull();

    // Winner's own view: sees own cards
    const stateForWinner = toPublicState(s, winnerId, 'TEST01', winnerId);
    const winnerAsSeenBySelf = stateForWinner.players.find(p => p.id === winnerId)!;
    expect(winnerAsSeenBySelf.holeCards).not.toBeNull();
    expect(winnerAsSeenBySelf.holeCards).toHaveLength(2);
  });

  it('reveals active players hole cards to all on real showdown', () => {
    let s = startedEngine(2, 1000);
    // Run all streets with everyone checking/calling to force a real showdown
    s = runToShowdown(s);

    expect(s.phase).toBe('showdown');
    const winner = s.winners![0];
    expect(winner.handName.length).toBeGreaterThan(0); // real showdown

    const winnerId = winner.playerId;
    const loserId = s.players.find(p => p.id !== winnerId)!.id;

    // Loser's view: winner's cards ARE visible
    const stateForLoser = toPublicState(s, loserId, 'TEST01', winnerId);
    const winnerAsSeenByLoser = stateForLoser.players.find(p => p.id === winnerId)!;
    expect(winnerAsSeenByLoser.holeCards).not.toBeNull();
    expect(winnerAsSeenByLoser.holeCards).toHaveLength(2);
  });

  it('isRealShowdown false means handName is empty string', () => {
    let s = startedEngine(2, 1000);
    const activePlayer = s.players[s.activePlayerIndex];
    s = applyAction(s, activePlayer.id, { type: 'fold' });

    // resolveWinner sets handName to ''
    expect(s.winners).toBeDefined();
    expect(s.winners![0].handName).toBe('');
  });
});
