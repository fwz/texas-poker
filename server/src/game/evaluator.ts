import { Hand } from 'pokersolver';
import { Card, Rank, Suit } from '../../../shared/types';

const RANK_MAP: Record<string, string> = {
  '10': 'T',
};

const REVERSE_RANK_MAP: Record<string, string> = { T: '10' };
const REVERSE_SUIT_MAP: Record<string, Suit> = {
  h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades',
};

function toPokersolverNotation(card: Card): string {
  const rank = RANK_MAP[card.rank] ?? card.rank;
  const suit = card.suit[0].toLowerCase();
  return `${rank}${suit}`;
}

function fromPokersolverCard(psCard: { value: string; suit: string }): Card {
  return {
    rank: (REVERSE_RANK_MAP[psCard.value] ?? psCard.value) as Rank,
    suit: REVERSE_SUIT_MAP[psCard.suit],
  };
}

export interface EvaluatedHand {
  name: string;
  rank: number;
  cards: Card[];
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const all = [...holeCards, ...communityCards];
  const hand = Hand.solve(all.map(toPokersolverNotation));
  return {
    name: hand.name as string,
    rank: hand.rank as number,
    cards: holeCards,
  };
}

export function pickWinners(
  hands: { playerId: string; holeCards: Card[] }[],
  communityCards: Card[]
): { playerId: string; handName: string; bestCards: Card[] }[] {
  const solved = hands.map(({ playerId, holeCards }) => ({
    playerId,
    hand: Hand.solve([...holeCards, ...communityCards].map(toPokersolverNotation)),
  }));

  const winners = Hand.winners(solved.map(s => s.hand));
  return solved
    .filter(s => winners.includes(s.hand))
    .map(s => ({
      playerId: s.playerId,
      handName: (s.hand as any).name as string,
      bestCards: ((s.hand as any).cards as { value: string; suit: string }[]).map(fromPokersolverCard),
    }));
}
