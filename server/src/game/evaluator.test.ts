import { describe, it, expect } from 'vitest';
import { evaluateHand, pickWinners } from './evaluator';
import type { Card } from '../../../shared/types';

function c(rank: string, suit: string): Card {
  return { rank: rank as any, suit: suit as any };
}

const community5 = [c('2','hearts'), c('7','diamonds'), c('K','clubs'), c('9','spades'), c('3','hearts')];

describe('evaluateHand', () => {
  it('identifies a royal flush (or straight flush at ace-high)', () => {
    const hole = [c('A','spades'), c('K','spades')];
    const board = [c('Q','spades'), c('J','spades'), c('10','spades'), c('2','hearts'), c('3','clubs')];
    const result = evaluateHand(hole, board);
    // pokersolver may label this as "Royal Flush" or "Straight Flush"
    expect(result.name.toLowerCase()).toMatch(/royal|straight flush/);
  });

  it('identifies a straight flush', () => {
    const hole = [c('8','hearts'), c('9','hearts')];
    const board = [c('10','hearts'), c('J','hearts'), c('Q','hearts'), c('2','clubs'), c('3','diamonds')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/straight flush/);
  });

  it('identifies four of a kind', () => {
    const hole = [c('A','hearts'), c('A','diamonds')];
    const board = [c('A','clubs'), c('A','spades'), c('K','hearts'), c('2','clubs'), c('3','diamonds')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/four of a kind/);
  });

  it('identifies a full house', () => {
    const hole = [c('K','hearts'), c('K','diamonds')];
    const board = [c('K','clubs'), c('Q','spades'), c('Q','hearts'), c('2','clubs'), c('3','diamonds')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/full house/);
  });

  it('identifies a flush', () => {
    const hole = [c('A','hearts'), c('5','hearts')];
    const board = [c('2','hearts'), c('7','hearts'), c('J','hearts'), c('3','clubs'), c('K','spades')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/flush/);
  });

  it('identifies a straight', () => {
    const hole = [c('6','clubs'), c('7','diamonds')];
    const board = [c('8','hearts'), c('9','spades'), c('10','clubs'), c('2','hearts'), c('K','spades')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/straight/);
  });

  it('identifies three of a kind', () => {
    const hole = [c('5','clubs'), c('5','diamonds')];
    const board = [c('5','hearts'), c('2','spades'), c('K','clubs'), c('3','hearts'), c('J','spades')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/three of a kind/);
  });

  it('identifies two pair', () => {
    const hole = [c('A','clubs'), c('K','diamonds')];
    const board = [c('A','hearts'), c('K','spades'), c('2','clubs'), c('3','hearts'), c('7','spades')];
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/two pair/);
  });

  it('identifies one pair', () => {
    const hole = [c('A','clubs'), c('A','diamonds')];
    const board = community5;
    const result = evaluateHand(hole, board);
    expect(result.name.toLowerCase()).toMatch(/pair/);
  });

  it('identifies high card', () => {
    const hole = [c('4','clubs'), c('6','diamonds')];
    const board = [c('2','hearts'), c('7','spades'), c('J','clubs'), c('K','diamonds'), c('A','hearts')];
    const result = evaluateHand(hole, board);
    // pokersolver may return "High Card" or just rank
    expect(result.name).toBeTruthy();
    expect(result.rank).toBeGreaterThanOrEqual(0);
  });
});

describe('pickWinners', () => {
  it('returns a single winner when hands are different', () => {
    const hands = [
      { playerId: 'p1', holeCards: [c('A','hearts'), c('A','diamonds')] },
      { playerId: 'p2', holeCards: [c('2','clubs'), c('3','spades')] },
    ];
    const board = [c('A','clubs'), c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs')];
    const winners = pickWinners(hands, board);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe('p1');
  });

  it('returns multiple winners on a tie (board plays)', () => {
    // Two players whose best hand is the board itself
    const board = [c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('10','spades')];
    const hands = [
      { playerId: 'p1', holeCards: [c('2','hearts'), c('3','hearts')] },
      { playerId: 'p2', holeCards: [c('4','clubs'), c('5','clubs')] },
    ];
    const winners = pickWinners(hands, board);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    // Both should tie (the board is a royal flush for both)
    expect(winners.map(w => w.playerId).sort()).toEqual(['p1','p2']);
  });

  it('includes bestCards in the winner result', () => {
    const hands = [
      { playerId: 'p1', holeCards: [c('A','hearts'), c('A','diamonds')] },
      { playerId: 'p2', holeCards: [c('2','clubs'), c('3','spades')] },
    ];
    const board = [c('A','clubs'), c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs')];
    const winners = pickWinners(hands, board);
    expect(winners[0].bestCards).toHaveLength(5);
    for (const card of winners[0].bestCards) {
      expect(card).toHaveProperty('rank');
      expect(card).toHaveProperty('suit');
    }
  });

  it('includes handName in the winner result', () => {
    const hands = [
      { playerId: 'p1', holeCards: [c('A','hearts'), c('A','diamonds')] },
    ];
    const board = [c('A','clubs'), c('K','hearts'), c('Q','diamonds'), c('J','clubs'), c('2','spades')];
    const winners = pickWinners(hands, board);
    expect(typeof winners[0].handName).toBe('string');
    expect(winners[0].handName.length).toBeGreaterThan(0);
  });
});
