import { describe, it, expect } from 'vitest';
import { Card } from '../src/types';
import {
  getCardWeight,
  isWildCard,
  sortCards,
  evaluateNormalHand,
  canPlay,
  HAND_TYPES,
  formatCard,
  formatHand
} from '../src/rules';

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

    it('should evaluate Joker pairs with correct power hierarchy (Double Red Joker: 18 > Red+Black: 17 > Double Black Joker: 16)', () => {
      const doubleRed = evaluateNormalHand(
        [
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'red_joker' }
        ],
        '2'
      );
      const redBlack = evaluateNormalHand(
        [
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'black_joker' }
        ],
        '2'
      );
      const doubleBlack = evaluateNormalHand(
        [
          { suit: 'J', rank: 'black_joker' },
          { suit: 'J', rank: 'black_joker' }
        ],
        '2'
      );

      expect(doubleRed.type).toBe(HAND_TYPES.PAIR);
      expect(doubleRed.power).toBe(18);

      expect(redBlack.type).toBe(HAND_TYPES.PAIR);
      expect(redBlack.power).toBe(17);

      expect(doubleBlack.type).toBe(HAND_TYPES.PAIR);
      expect(doubleBlack.power).toBe(16);

      // Verify canPlay: Double Red Joker beats Red+Black Joker
      const comboRedBlack = canPlay(
        [
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'black_joker' }
        ],
        null,
        '2'
      )!;
      const doubleRedPlay = canPlay(
        [
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'red_joker' }
        ],
        comboRedBlack,
        '2'
      );
      expect(doubleRedPlay).not.toBeNull();
      expect(doubleRedPlay?.power).toBe(18);
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

    it('should forbid hard level cards (硬主) from participating in straight, double straight, and steel plate', () => {
      // currentRank = '8'. Hard level card: Spades 8
      const straightWithHardWild: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '6' },
        { suit: 'C', rank: '7' },
        { suit: 'S', rank: '8' }, // Hard level card
        { suit: 'S', rank: '9' }
      ];
      expect(canPlay(straightWithHardWild, null, '8')).toBeNull();

      const doubleStraightWithHardWild: Card[] = [
        { suit: 'S', rank: '7' },
        { suit: 'D', rank: '7' },
        { suit: 'S', rank: '8' }, // Hard level card
        { suit: 'D', rank: '8' }, // Hard level card
        { suit: 'S', rank: '9' },
        { suit: 'D', rank: '9' }
      ];
      expect(canPlay(doubleStraightWithHardWild, null, '8')).toBeNull();

      const steelPlateWithHardWild: Card[] = [
        { suit: 'S', rank: '7' },
        { suit: 'D', rank: '7' },
        { suit: 'C', rank: '7' },
        { suit: 'S', rank: '8' }, // Hard level card
        { suit: 'D', rank: '8' }, // Hard level card
        { suit: 'C', rank: '8' } // Hard level card
      ];
      expect(canPlay(steelPlateWithHardWild, null, '8')).toBeNull();
    });

    it('should correctly evaluate A-2-3-4-5 straight', () => {
      const cards: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: '2' },
        { suit: 'C', rank: '3' },
        { suit: 'S', rank: '4' },
        { suit: 'H', rank: '5' }
      ];
      const result = evaluateNormalHand(cards, '10');
      expect(result.type).toBe(HAND_TYPES.STRAIGHT);
      expect(result.power).toBe(5);
    });
  });

  describe('formatCard and formatHand', () => {
    it('should correctly format individual cards', () => {
      expect(formatCard({ suit: 'H', rank: 'A' })).toBe('红桃A');
      expect(formatCard({ suit: 'D', rank: '10' })).toBe('方块10');
      expect(formatCard({ suit: 'C', rank: 'K' })).toBe('梅花K');
      expect(formatCard({ suit: 'S', rank: '2' })).toBe('黑桃2');
      expect(formatCard({ suit: 'J', rank: 'red_joker' })).toBe('大王');
      expect(formatCard({ suit: 'J', rank: 'black_joker' })).toBe('小王');
    });

    it('should correctly format hand list', () => {
      expect(formatHand([])).toBe('已出完');
      expect(
        formatHand([
          { suit: 'H', rank: 'A' },
          { suit: 'S', rank: '10' },
          { suit: 'J', rank: 'red_joker' }
        ])
      ).toBe('红桃A, 黑桃10, 大王');
    });
  });
});
