import { Card, GamePhase, PlayerAction, PublicGameState, PublicPlayer, SidePot } from '../../../shared/types';
import { freshShuffledDeck } from './deck';
import { pickWinners } from './evaluator';

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  chips: number;
  holeCards: Card[];
  bet: number;
  totalBetThisRound: number;
  isActive: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  seatIndex: number;
  hasActedThisRound: boolean;
  delayCards: number;
}

export interface GameEngineState {
  phase: GamePhase;
  players: PlayerState[];
  deck: Card[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  activePlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  round: number;
  minRaise: number;
  winners?: { playerId: string; amount: number; handName: string; bestCards?: Card[] }[];
}

export function createEngine(smallBlind: number, bigBlind: number): GameEngineState {
  return {
    phase: 'waiting',
    players: [],
    deck: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    activePlayerIndex: 0,
    dealerIndex: 0,
    smallBlind,
    bigBlind,
    round: 0,
    minRaise: bigBlind,
  };
}

export function addPlayer(state: GameEngineState, id: string, name: string, avatar: string, chips: number): GameEngineState {
  const seatIndex = state.players.length;
  return {
    ...state,
    players: [
      ...state.players,
      {
        id, name, avatar, chips, holeCards: [], bet: 0, totalBetThisRound: 0,
        isActive: false, isAllIn: false, isConnected: true,
        seatIndex, hasActedThisRound: false, delayCards: 10,
      },
    ],
  };
}

export function useDelayCard(state: GameEngineState, playerId: string): GameEngineState {
  const s = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = s.players.find(p => p.id === playerId);
  if (player && player.delayCards > 0) player.delayCards--;
  return s;
}

export function removePlayer(state: GameEngineState, playerId: string): GameEngineState {
  return {
    ...state,
    players: state.players.filter(p => p.id !== playerId),
  };
}

export function startRound(state: GameEngineState): GameEngineState {
  if (state.players.filter(p => p.isConnected && p.chips > 0).length < 2) {
    throw new Error('Need at least 2 players with chips to start');
  }

  let s = { ...state };
  s.deck = freshShuffledDeck();
  s.communityCards = [];
  s.pot = 0;
  s.sidePots = [];
  s.currentBet = s.bigBlind;
  s.minRaise = s.bigBlind;
  s.round += 1;
  s.winners = undefined;

  const eligible = s.players.filter(p => p.isConnected && p.chips > 0);

  // Advance the dealer among eligible players, then convert back to an index in
  // the canonical players array.  Mixing these two index spaces breaks after a
  // player disconnects or is removed.
  const previousDealerId = s.players[s.dealerIndex]?.id;
  const previousDealerEligibleIndex = eligible.findIndex(p => p.id === previousDealerId);
  const dealerEligibleIndex = (previousDealerEligibleIndex + 1 + eligible.length) % eligible.length;
  const dealerId = eligible[dealerEligibleIndex].id;
  s.dealerIndex = s.players.findIndex(p => p.id === dealerId);

  // Heads-up is the one exception: the button posts the small blind and acts
  // first preflop.  In every other game the blinds are left of the button.
  const sbIndex = eligible.length === 2
    ? dealerEligibleIndex
    : (dealerEligibleIndex + 1) % eligible.length;
  const bbIndex = eligible.length === 2
    ? (dealerEligibleIndex + 1) % eligible.length
    : (dealerEligibleIndex + 2) % eligible.length;

  s.players = s.players.map(p => ({
    ...p,
    holeCards: [],
    bet: 0,
    totalBetThisRound: 0,
    isActive: eligible.some(e => e.id === p.id),
    isAllIn: false,
    hasActedThisRound: false,
  }));

  // Deal hole cards
  for (const p of s.players.filter(p => p.isActive)) {
    p.holeCards = [s.deck.pop()!, s.deck.pop()!];
  }

  // Post blinds
  s = placeBet(s, eligible[sbIndex].id, s.smallBlind);
  s = placeBet(s, eligible[bbIndex].id, s.bigBlind);
  s.players.find(p => p.id === eligible[bbIndex].id)!.hasActedThisRound = false;

  s.phase = 'preflop';

  // In heads-up the button/small blind acts first preflop; otherwise action
  // starts left of the big blind.
  const utg = eligible.length === 2
    ? dealerEligibleIndex
    : (bbIndex + 1) % eligible.length;
  s.activePlayerIndex = s.players.findIndex(p => p.id === eligible[utg].id);
  s.sidePots = buildSidePots(s);

  return s;
}

function placeBet(state: GameEngineState, playerId: string, amount: number): GameEngineState {
  const s = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = s.players.find(p => p.id === playerId)!;
  const actual = Math.min(amount, player.chips);
  player.chips -= actual;
  player.bet += actual;
  player.totalBetThisRound += actual;
  s.pot += actual;
  if (player.chips === 0) player.isAllIn = true;
  return s;
}

export function applyAction(state: GameEngineState, playerId: string, action: PlayerAction): GameEngineState {
  let s = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = s.players.find(p => p.id === playerId);

  if (!['preflop', 'flop', 'turn', 'river'].includes(s.phase)) {
    throw new Error('No action is allowed in the current phase');
  }
  if (!action || typeof action !== 'object' || !['fold', 'check', 'call', 'raise'].includes(action.type)) {
    throw new Error('Invalid player action');
  }
  if (!player) throw new Error('Player not found');
  if (s.players[s.activePlayerIndex]?.id !== playerId) throw new Error('Not your turn');
  if (!player.isActive) throw new Error('You are not active in this hand');

  switch (action.type) {
    case 'fold':
      player.isActive = false;
      break;

    case 'check':
      if (player.bet < s.currentBet) throw new Error('Cannot check, must call or raise');
      player.hasActedThisRound = true;
      break;

    case 'call': {
      const callAmount = s.currentBet - player.bet;
      if (callAmount <= 0) throw new Error('Nothing to call, use check');
      s = placeBet(s, playerId, callAmount);
      s.players.find(p => p.id === playerId)!.hasActedThisRound = true;
      break;
    }

    case 'raise': {
      if (!Number.isSafeInteger(action.amount) || action.amount <= 0) {
        throw new Error('Raise amount must be a positive whole number');
      }
      const minTotal = s.currentBet + s.minRaise;
      const maxTotal = player.chips + player.bet;
      if (action.amount > maxTotal) throw new Error('Raise exceeds available chips');
      if (action.amount <= s.currentBet) throw new Error('Raise must exceed the current bet');

      const isAllInShort = action.amount === maxTotal;
      if (action.amount < minTotal && !isAllInShort) {
        throw new Error(`Minimum raise to ${minTotal}`);
      }
      if (player.hasActedThisRound) {
        throw new Error('Betting is not reopened after an incomplete all-in raise');
      }
      const raiseBy = action.amount - player.bet;
      const isFullRaise = action.amount >= minTotal;
      if (action.amount > s.currentBet) {
        s.minRaise = Math.max(s.bigBlind, action.amount - s.currentBet);
        s.currentBet = action.amount;
        if (isFullRaise) {
          s.players.forEach(p => {
            if (p.id !== playerId && p.isActive && !p.isAllIn) {
              p.hasActedThisRound = false;
            }
          });
        }
      }
      s = placeBet(s, playerId, raiseBy);
      s.players.find(p => p.id === playerId)!.hasActedThisRound = true;
      break;
    }
  }

  s.sidePots = buildSidePots(s);
  s = advanceTurn(s);
  return s;
}

/**
 * Derive side pots from each player's total contribution for this hand. Folded
 * players fund pots but are never eligible to win them.
 */
function buildSidePots(state: GameEngineState): SidePot[] {
  const levels = [...new Set(
    state.players
      .map(player => player.totalBetThisRound)
      .filter(amount => amount > 0)
  )].sort((a, b) => a - b);

  let previousLevel = 0;
  return levels.map(level => {
    const contributors = state.players.filter(player => player.totalBetThisRound >= level);
    const pot: SidePot = {
      amount: (level - previousLevel) * contributors.length,
      eligiblePlayerIds: contributors.filter(player => player.isActive).map(player => player.id),
    };
    previousLevel = level;
    return pot;
  }).filter(pot => pot.amount > 0);
}

function activePlayers(state: GameEngineState): PlayerState[] {
  return state.players.filter(p => p.isActive && !p.isAllIn);
}

function allActed(state: GameEngineState): boolean {
  const active = activePlayers(state);
  return active.every(p => p.hasActedThisRound && p.bet === state.currentBet);
}

function advanceTurn(state: GameEngineState): GameEngineState {
  let s = { ...state };

  const stillIn = s.players.filter(p => p.isActive);

  // Only one player left — they win
  if (stillIn.length === 1) {
    return resolveWinner(s);
  }

  // All remaining are all-in or everyone has acted at the same level
  const canAct = activePlayers(s);
  if (canAct.length === 0 || allActed(s)) {
    return advancePhase(s);
  }

  // Find next active non-all-in player
  let next = (s.activePlayerIndex + 1) % s.players.length;
  let tries = 0;
  while (tries < s.players.length) {
    const p = s.players[next];
    if (p.isActive && !p.isAllIn) break;
    next = (next + 1) % s.players.length;
    tries++;
  }
  s.activePlayerIndex = next;
  return s;
}

function advancePhase(state: GameEngineState): GameEngineState {
  let s = { ...state, players: state.players.map(p => ({ ...p, bet: 0, hasActedThisRound: false })) };
  s.currentBet = 0;
  s.minRaise = s.bigBlind;

  const nextPhase: Record<GamePhase, GamePhase> = {
    waiting: 'preflop',
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
    river: 'showdown',
    showdown: 'waiting',
  };

  s.phase = nextPhase[s.phase];

  if (s.phase === 'flop') {
    s.deck.pop(); // burn
    s.communityCards = [s.deck.pop()!, s.deck.pop()!, s.deck.pop()!];
  } else if (s.phase === 'turn' || s.phase === 'river') {
    s.deck.pop(); // burn
    s.communityCards = [...s.communityCards, s.deck.pop()!];
  } else if (s.phase === 'showdown') {
    return resolveShowdown(s);
  }

  // Auto-run board only when ALL active players are all-in (nobody can act)
  const canAct = s.players.filter(p => p.isActive && !p.isAllIn);
  if (canAct.length === 0) {
    return advancePhase(s);
  }
  // Every postflop street starts with the first actionable seat left of the
  // button, not with whichever player happens to be first in the array.
  s.activePlayerIndex = firstActionableAfter(s, s.dealerIndex);
  return s;
}

function firstActionableAfter(state: GameEngineState, seatIndex: number): number {
  for (let offset = 1; offset <= state.players.length; offset++) {
    const index = (seatIndex + offset) % state.players.length;
    const player = state.players[index];
    if (player.isActive && !player.isAllIn) return index;
  }
  throw new Error('No actionable player found');
}

function resolveWinner(state: GameEngineState): GameEngineState {
  const winner = state.players.find(p => p.isActive)!;
  const s = { ...state, players: state.players.map(p => ({ ...p })) };
  s.players.find(p => p.id === winner.id)!.chips += s.pot;
  s.winners = [{ playerId: winner.id, amount: s.pot, handName: '' }];
  s.pot = 0;
  s.phase = 'showdown';
  return s;
}

function resolveShowdown(state: GameEngineState): GameEngineState {
  const s = { ...state, players: state.players.map(p => ({ ...p })) };
  s.sidePots = buildSidePots(s);
  const payouts = new Map<string, { amount: number; handName: string; bestCards: Card[] }>();

  for (const sidePot of s.sidePots) {
    const contenders = s.players.filter(player => sidePot.eligiblePlayerIds.includes(player.id));
    if (contenders.length === 0) throw new Error('Side pot has no eligible players');
    const results = pickWinners(
      contenders.map(player => ({ playerId: player.id, holeCards: player.holeCards })),
      s.communityCards,
    );
    const perWinner = Math.floor(sidePot.amount / results.length);
    let remainder = sidePot.amount % results.length;
    const winnersInOddChipOrder = [...results].sort((a, b) => oddChipOrder(s, a.playerId) - oddChipOrder(s, b.playerId));

    for (const result of winnersInOddChipOrder) {
      const amount = perWinner + (remainder-- > 0 ? 1 : 0);
      const payout = payouts.get(result.playerId) ?? {
        amount: 0,
        handName: result.handName,
        bestCards: result.bestCards,
      };
      payout.amount += amount;
      payouts.set(result.playerId, payout);
    }
  }

  s.winners = [...payouts.entries()].map(([playerId, payout]) => ({ playerId, ...payout }));
  for (const winner of s.winners) {
    s.players.find(player => player.id === winner.playerId)!.chips += winner.amount;
  }

  s.pot = 0;
  return s;
}

function oddChipOrder(state: GameEngineState, playerId: string): number {
  const index = state.players.findIndex(player => player.id === playerId);
  // Odd chips are assigned clockwise from the first occupied seat left of the button.
  return (index - state.dealerIndex - 1 + state.players.length) % state.players.length;
}

const POSITION_NAMES: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
};

export function toPublicState(
  state: GameEngineState,
  forPlayerId: string,
  roomCode: string,
  hostId: string
): PublicGameState {
  const isShowdown = state.phase === 'showdown';
  // A real showdown = cards go to 5th street (resolveShowdown sets non-empty handName).
  // A fold win = resolveWinner, handName is '', cards must NOT be revealed.
  const isRealShowdown = isShowdown && (state.winners ?? []).some(w => w.handName.length > 0);

  const eligible = state.players.filter(pl => pl.isConnected);
  const dealer = state.players[state.dealerIndex];
  const dealerEligIdx = dealer ? eligible.indexOf(dealer) : 0;
  const n = eligible.length;
  const posNames = POSITION_NAMES[Math.min(n, 9)] ?? [];
  const positionLabelMap = new Map<string, string>();
  eligible.forEach((p, eligIdx) => {
    const offset = (eligIdx - dealerEligIdx + n) % n;
    positionLabelMap.set(p.id, posNames[offset] ?? '');
  });

  const sbIdx = eligible.length > 0
    ? state.players.indexOf(eligible[eligible.length === 2 ? dealerEligIdx : (dealerEligIdx + 1) % eligible.length])
    : -1;
  const bbIdx = eligible.length > 0
    ? state.players.indexOf(eligible[
      eligible.length === 2
        ? (dealerEligIdx + 1) % eligible.length
        : (dealerEligIdx + 2) % eligible.length
    ])
    : -1;

  const players: PublicPlayer[] = state.players.map((p, i) => {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      bet: p.bet,
      totalBetThisRound: p.totalBetThisRound,
      isActive: p.isActive,
      isConnected: p.isConnected,
      isTurn: i === state.activePlayerIndex && state.phase !== 'showdown' && state.phase !== 'waiting',
      isDealer: i === state.dealerIndex,
      isSmallBlind: i === sbIdx,
      isBigBlind: i === bbIdx,
      isAllIn: p.isAllIn,
      // Reveal opponent cards only when it was a real showdown (not a fold win)
      holeCards: p.id === forPlayerId || (isRealShowdown && p.isActive) ? p.holeCards : null,
      seatIndex: p.seatIndex,
      delayCards: p.delayCards,
      positionLabel: positionLabelMap.get(p.id) ?? '',
    };
  });

  const me = state.players.find(p => p.id === forPlayerId);

  return {
    phase: state.phase,
    communityCards: state.communityCards,
    pot: state.pot,
    sidePots: state.sidePots,
    currentBet: state.currentBet,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
    players,
    myCards: me?.holeCards ?? [],
    blinds: { small: state.smallBlind, big: state.bigBlind },
    round: state.round,
    minRaise: state.minRaise,
    roomCode,
    hostId,
    winners: state.winners,
    history: [], // populated by Room.getStateFor
    revision: 0, // populated by Room.getStateFor
  };
}
