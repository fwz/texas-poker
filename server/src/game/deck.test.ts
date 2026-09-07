import { describe, it, expect } from 'vitest';
import { buildDeck, shuffle, freshShuffledDeck } from './deck';

describe('buildDeck', () => {
  it('produces exactly 52 cards', () => {
    expect(buildDeck()).toHaveLength(52);
  });

  it('contains all 4 suits × 13 ranks (no duplicates)', () => {
    const deck = buildDeck();
    const keys = deck.map(c => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });

  it('contains all expected ranks', () => {
    const deck = buildDeck();
    const ranks = new Set(deck.map(c => c.rank));
    for (const r of ['2','3','4','5','6','7','8','9','10','J','Q','K','A']) {
      expect(ranks.has(r as any)).toBe(true);
    }
  });

  it('contains all expected suits', () => {
    const deck = buildDeck();
    const suits = new Set(deck.map(c => c.suit));
    for (const s of ['hearts','diamonds','clubs','spades']) {
      expect(suits.has(s as any)).toBe(true);
    }
  });
});

describe('shuffle', () => {
  it('returns a deck with the same 52 cards', () => {
    const deck = buildDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
    const origKeys = new Set(deck.map(c => `${c.rank}-${c.suit}`));
    for (const c of shuffled) {
      expect(origKeys.has(`${c.rank}-${c.suit}`)).toBe(true);
    }
  });

  it('does not mutate the original deck', () => {
    const deck = buildDeck();
    const first = deck[0];
    shuffle(deck);
    expect(deck[0]).toBe(first);
  });
});

describe('freshShuffledDeck', () => {
  it('returns 52 unique cards', () => {
    const deck = freshShuffledDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => `${c.rank}-${c.suit}`)).size).toBe(52);
  });
});
