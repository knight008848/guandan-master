import { describe, it, expect } from 'vitest';
import { Card } from '../src/types';
import { getCardWeight, isWildCard, sortCards, evaluateNormalHand, canPlay, HAND_TYPES } from '../src/rules';

describe('Guandan Rules Unit Tests', () => {
  describe('getCardWeight', () => {
    it('should return correct weights for normal cards', () => {
      expect(getCardWeight('2', '2')).toBe(15); // currentRank rank
      expect(getCardWeight('2', '10')).toBe(2);
      expect(getCardWeight('10', '10')).toBe(15); // currentRank
      expect(getCardWeight('K', '2')).toBe(13);
      expect(getCardWeight('A', '2')).toBe(14);
    });

    it('should return correct weights for special cards', () => {
      expect(getCardWeight('black_joker', '2')).toBe(16);
      expect(getCardWeight('red_joker', '2')).toBe(17);
    });
  });

  describe('isWildCard', () => {
    it('should identify red heart of current rank as wild card', () => {
      const heartsWild: Card = { suit: 'H', rank: '10' };
      expect(isWildCard(heartsWild, '10')).toBe(true);
    });

    it('should not identify other suits of current rank as wild card', () => {
      const spadesTen: Card = { suit: 'S', rank: '10' };
      expect(isWildCard(spadesTen, '10')).toBe(false);
    });

    it('should not identify other ranks of hearts as wild card', () => {
      const heartsNine: Card = { suit: 'H', rank: '9' };
      expect(isWildCard(heartsNine, '10')).toBe(false);
    });
  });

  describe('sortCards', () => {
    it('should sort cards in correct hierarchy: wild card -> weight descending -> suit descending', () => {
      const cards: Card[] = [
        { suit: 'D', rank: 'A' }, // weight 14
        { suit: 'H', rank: '2' }, // wild card (current rank 2)
        { suit: 'S', rank: 'K' }, // weight 13
        { suit: 'C', rank: 'A' }, // weight 14
        { suit: 'J', rank: 'red_joker' } // weight 17
      ];

      const sorted = sortCards(cards, '2');

      // Expected order:
      // 1. H2 (wild card)
      // 2. red_joker
      // 3. A (suit S/H/C/D order: C is H>S>C>D)
      // 4. A (suit D)
      // 5. K (suit S)
      expect(sorted[0]).toEqual({ suit: 'H', rank: '2' });
      expect(sorted[1]).toEqual({ suit: 'J', rank: 'red_joker' });
      expect(sorted[2]).toEqual({ suit: 'C', rank: 'A' });
      expect(sorted[3]).toEqual({ suit: 'D', rank: 'A' });
      expect(sorted[4]).toEqual({ suit: 'S', rank: 'K' });
    });
  });

  describe('evaluateNormalHand', () => {
    it('should detect SINGLE', () => {
      const result = evaluateNormalHand([{ suit: 'S', rank: 'A' }], '2');
      expect(result.type).toBe(HAND_TYPES.SINGLE);
      expect(result.power).toBe(14);
    });

    it('should detect PAIR', () => {
      const result = evaluateNormalHand(
        [
          { suit: 'S', rank: 'K' },
          { suit: 'D', rank: 'K' }
        ],
        '2'
      );
      expect(result.type).toBe(HAND_TYPES.PAIR);
      expect(result.power).toBe(13);
    });

    it('should detect BOMB', () => {
      const result = evaluateNormalHand(
        [
          { suit: 'S', rank: '8' },
          { suit: 'D', rank: '8' },
          { suit: 'C', rank: '8' },
          { suit: 'H', rank: '8' }
        ],
        '2'
      );
      expect(result.type).toBe(HAND_TYPES.BOMB);
      expect(result.power).toBe(108); // BOMB power has base weight (100 + rankWeight)
    });
  });

  describe('canPlay', () => {
    it('should allow playing a higher card of the same type', () => {
      const lastPlay = { type: HAND_TYPES.SINGLE, power: 10, cardCount: 1 };
      const currentCards: Card[] = [{ suit: 'S', rank: 'J' }]; // weight 11
      const result = canPlay(currentCards, lastPlay, '2');
      expect(result).not.toBeNull();
      expect(result?.type).toBe(HAND_TYPES.SINGLE);
    });

    it('should not allow playing a lower card of the same type', () => {
      const lastPlay = { type: HAND_TYPES.SINGLE, power: 12, cardCount: 1 }; // Queen
      const currentCards: Card[] = [{ suit: 'S', rank: 'J' }]; // Jack
      const result = canPlay(currentCards, lastPlay, '2');
      expect(result).toBeNull();
    });

    it('should allow a bomb to beat a normal type', () => {
      const lastPlay = { type: HAND_TYPES.PAIR, power: 14, cardCount: 2 }; // Pair of Aces
      const bomb: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '5' }
      ];
      const result = canPlay(bomb, lastPlay, '2');
      expect(result).not.toBeNull();
      expect(result?.type).toBe(HAND_TYPES.BOMB);
    });

    it('should respect the new hierarchy: 6+ bomb > straight flush > 5 bomb > 4 bomb', () => {
      // 4-card bomb of Jacks (weight 11, power 111)
      const bomb4: Card[] = [
        { suit: 'S', rank: 'J' },
        { suit: 'D', rank: 'J' },
        { suit: 'C', rank: 'J' },
        { suit: 'H', rank: 'J' }
      ];

      // 5-card bomb of 4s (weight 4, power 204)
      const bomb5: Card[] = [
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' },
        { suit: 'D', rank: '4' }
      ];

      // Straight flush (同花顺) 2-3-4-5-6 of Spades (straightVal 6, power 306)
      const straightFlush: Card[] = [
        { suit: 'S', rank: '2' },
        { suit: 'S', rank: '3' },
        { suit: 'S', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' }
      ];

      // 6-card bomb of 3s (weight 3, power 403)
      const bomb6: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '3' },
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' }
      ];

      // 1. 5-card bomb beats 4-card bomb
      const combo4 = canPlay(bomb4, null, '10')!;
      expect(canPlay(bomb5, combo4, '10')).not.toBeNull();

      // 2. Straight flush beats 5-card bomb
      const combo5 = canPlay(bomb5, null, '10')!;
      const comboSF = canPlay(straightFlush, combo5, '10');
      expect(comboSF).not.toBeNull();
      expect(comboSF?.name).toBe('同花顺');

      // 3. 5-card bomb does not beat straight flush
      expect(canPlay(bomb5, comboSF, '10')).toBeNull();

      // 4. 6-card bomb beats straight flush
      const combo6 = canPlay(bomb6, comboSF, '10');
      expect(combo6).not.toBeNull();
      expect(combo6?.name).toBe('6张炸弹');

      // 5. Straight flush does not beat 6-card bomb
      expect(canPlay(straightFlush, combo6, '10')).toBeNull();
    });

    it('should detect straight flush with wild card', () => {
      // currentRank = '10'
      // Hand: Spades 5, Spades 6, Spades 7, Spades 8, Hearts 10 (wild card)
      const cards: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' },
        { suit: 'S', rank: '8' },
        { suit: 'H', rank: '10' } // Wild card
      ];
      const result = canPlay(cards, null, '10');
      expect(result).not.toBeNull();
      expect(result?.type).toBe(HAND_TYPES.BOMB);
      expect(result?.name).toBe('同花顺');
    });

    it('should allow normal level cards to be included in a straight', () => {
      // currentRank = '8'
      // Hand: Spades 5, Diamonds 6, Clubs 7, Spades 8 (normal 8), Spades 9 (mixed suits)
      const cards: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '6' },
        { suit: 'C', rank: '7' },
        { suit: 'S', rank: '8' }, // level card
        { suit: 'S', rank: '9' }
      ];
      const result = canPlay(cards, null, '8');
      expect(result).not.toBeNull();
      expect(result?.type).toBe(HAND_TYPES.STRAIGHT);
      expect(result?.power).toBe(9); // 9 is max weight
    });
  });
});
