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
  describe('Basic utilities (getCardWeight, isWildCard, sortCards, formatCard)', () => {
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

    it('should identify substituted wild card as wild card even if suit is changed', () => {
      const substitutedCard: Card = {
        suit: 'S',
        rank: '2',
        isSubstituted: true,
        original: { suit: 'H', rank: '2' }
      };
      expect(isWildCard(substitutedCard, '2')).toBe(true);
    });

    it('should sort cards in correct hierarchy: wild card -> weight descending -> suit descending', () => {
      const cards: Card[] = [
        { suit: 'D', rank: 'A' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: 'K' },
        { suit: 'C', rank: 'A' },
        { suit: 'J', rank: 'red_joker' }
      ];
      const sorted = sortCards(cards, '2');
      expect(sorted[0]).toEqual({ suit: 'H', rank: '2' });
      expect(sorted[1]).toEqual({ suit: 'J', rank: 'red_joker' });
      expect(sorted[2]).toEqual({ suit: 'C', rank: 'A' });
      expect(sorted[3]).toEqual({ suit: 'D', rank: 'A' });
      expect(sorted[4]).toEqual({ suit: 'S', rank: 'K' });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 1. 炸弹与同花顺威力阶梯 (Rules §1.1 & §1.9)                                 */
  /* -------------------------------------------------------------------------- */
  describe('Rule 1: Bomb and Straight Flush Power Hierarchy (Rules §1.1 & §1.9)', () => {
    it('should follow hierarchy: King Bomb (4 Jokers) > 10-card Bomb > 8-card Bomb > 7-card Bomb > 6-card Bomb > Straight Flush > 5-card Bomb > 4-card Bomb > Normal Combo', () => {
      const currentRank = '10';

      // 4-card Bomb of 9s
      const bomb4: Card[] = [
        { suit: 'S', rank: '9' },
        { suit: 'D', rank: '9' },
        { suit: 'C', rank: '9' },
        { suit: 'H', rank: '9' }
      ];

      // 5-card Bomb of 4s
      const bomb5: Card[] = [
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '4' }
      ];

      // Straight Flush (同花顺 3-4-5-6-7 Spades)
      const straightFlush: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'S', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' }
      ];

      // 6-card Bomb of 3s
      const bomb6: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '3' },
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' }
      ];

      // 7-card Bomb of 3s
      const bomb7: Card[] = [...bomb6, { suit: 'C', rank: '3' }];

      // 8-card Bomb of 3s
      const bomb8: Card[] = [...bomb7, { suit: 'H', rank: '3' }];

      // King Bomb (4 Jokers)
      const kingBomb: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];

      const combo4 = canPlay(bomb4, null, currentRank)!;
      const combo5 = canPlay(bomb5, null, currentRank)!;
      const comboSF = canPlay(straightFlush, null, currentRank)!;
      const combo6 = canPlay(bomb6, null, currentRank)!;
      const combo7 = canPlay(bomb7, null, currentRank)!;
      const combo8 = canPlay(bomb8, null, currentRank)!;
      const comboKing = canPlay(kingBomb, null, currentRank)!;

      // Check power values
      expect(combo4.power).toBe(409);
      expect(combo5.power).toBe(504);
      expect(comboSF.power).toBe(557);
      expect(combo6.power).toBe(603);
      expect(combo7.power).toBe(703);
      expect(combo8.power).toBe(803);
      expect(comboKing.power).toBe(2000);

      // Verify hierarchy sequence
      expect(canPlay(bomb5, combo4, currentRank)).not.toBeNull();
      expect(canPlay(straightFlush, combo5, currentRank)).not.toBeNull();
      expect(canPlay(bomb6, comboSF, currentRank)).not.toBeNull();
      expect(canPlay(bomb7, combo6, currentRank)).not.toBeNull();
      expect(canPlay(bomb8, combo7, currentRank)).not.toBeNull();
      expect(canPlay(kingBomb, combo8, currentRank)).not.toBeNull();

      // Lower cannot beat higher
      expect(canPlay(bomb5, comboSF, currentRank)).toBeNull();
      expect(canPlay(straightFlush, combo6, currentRank)).toBeNull();
      expect(canPlay(bomb8, comboKing, currentRank)).toBeNull();
    });

    it('should verify straight flush power (550 + straightVal) > all 4/5-card bombs and < all 6+-card bombs', () => {
      const currentRank = '9';
      // Max straight flush (10-J-Q-K-A Spades) -> straightVal 14, power = 564
      const maxSF: Card[] = [
        { suit: 'S', rank: '10' },
        { suit: 'S', rank: 'J' },
        { suit: 'S', rank: 'Q' },
        { suit: 'S', rank: 'K' },
        { suit: 'S', rank: 'A' }
      ];
      // Min straight flush (A-2-3-4-5 Spades) -> straightVal 5, power = 555
      const minSF: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'S', rank: '2' },
        { suit: 'S', rank: '3' },
        { suit: 'S', rank: '4' },
        { suit: 'S', rank: '5' }
      ];

      const comboMaxSF = canPlay(maxSF, null, currentRank)!;
      const comboMinSF = canPlay(minSF, null, currentRank)!;

      expect(comboMinSF.power).toBe(555);
      expect(comboMaxSF.power).toBe(564);

      // Highest 5-card bomb (5 Aces -> 514) is less than minSF (555)
      const bomb5Aces: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' },
        { suit: 'C', rank: 'A' },
        { suit: 'H', rank: 'A' },
        { suit: 'S', rank: 'A' }
      ];
      const combo5Aces = canPlay(bomb5Aces, null, currentRank)!;
      expect(combo5Aces.power).toBe(514);
      expect(canPlay(minSF, combo5Aces, currentRank)).not.toBeNull();
      expect(canPlay(bomb5Aces, comboMinSF, currentRank)).toBeNull();

      // Lowest 6-card bomb (6 2s -> 602) is greater than maxSF (564)
      const bomb6Twos: Card[] = [
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '2' },
        { suit: 'C', rank: '2' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '2' }
      ];
      const combo6Twos = canPlay(bomb6Twos, null, currentRank)!;
      expect(combo6Twos.power).toBe(602);
      expect(canPlay(bomb6Twos, comboMaxSF, currentRank)).not.toBeNull();
      expect(canPlay(maxSF, combo6Twos, currentRank)).toBeNull();
    });

    it('should form 10-card bomb using 8 natural cards + 2 wildcards', () => {
      const currentRank = '10';
      // 8 natural 8s + 2 wildcards (Hearts 10)
      const hand10: Card[] = [
        { suit: 'S', rank: '8' },
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'H', rank: '8' },
        { suit: 'H', rank: '8' },
        { suit: 'H', rank: '10' }, // Wildcard 1
        { suit: 'H', rank: '10' }  // Wildcard 2
      ];

      const combo10 = canPlay(hand10, null, currentRank)!;
      expect(combo10).not.toBeNull();
      expect(combo10.type).toBe(HAND_TYPES.BOMB);
      expect(combo10.power).toBe(1008);
      expect(combo10.cardCount).toBe(10);

      // 10-card bomb beats 8-card bomb
      const bomb8: Card[] = [
        { suit: 'S', rank: 'K' },
        { suit: 'S', rank: 'K' },
        { suit: 'D', rank: 'K' },
        { suit: 'D', rank: 'K' },
        { suit: 'C', rank: 'K' },
        { suit: 'C', rank: 'K' },
        { suit: 'H', rank: 'K' },
        { suit: 'H', rank: 'K' }
      ];
      const combo8 = canPlay(bomb8, null, currentRank)!;
      expect(canPlay(hand10, combo8, currentRank)).not.toBeNull();

      // King Bomb (4 Jokers, power 2000) beats 10-card bomb
      const kingBomb: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];
      const comboKing = canPlay(kingBomb, null, currentRank)!;
      expect(canPlay(kingBomb, combo10, currentRank)).not.toBeNull();
      expect(canPlay(hand10, comboKing, currentRank)).toBeNull();
    });

    it('should explicitly verify 9-card bomb power is 908 (between 8-card bomb 808 and 10-card bomb 1008)', () => {
      const currentRank = '10';
      // 8 natural 8s + 1 wildcard (Hearts 10)
      const hand9: Card[] = [
        { suit: 'S', rank: '8' },
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'H', rank: '8' },
        { suit: 'H', rank: '8' },
        { suit: 'H', rank: '10' }
      ];

      const combo9 = canPlay(hand9, null, currentRank)!;
      expect(combo9).not.toBeNull();
      expect(combo9.type).toBe(HAND_TYPES.BOMB);
      expect(combo9.power).toBe(908);
      expect(combo9.cardCount).toBe(9);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. 同花顺规则 (Rules §1.2)                                                 */
  /* -------------------------------------------------------------------------- */
  describe('Rule 2: Straight Flush Rules (Rules §1.2)', () => {
    it('should evaluate max straight flush 10-J-Q-K-A (14) and min straight flush A-2-3-4-5 (5)', () => {
      const currentRank = '9';
      const maxSF: Card[] = [
        { suit: 'H', rank: '10' },
        { suit: 'H', rank: 'J' },
        { suit: 'H', rank: 'Q' },
        { suit: 'H', rank: 'K' },
        { suit: 'H', rank: 'A' }
      ];
      const minSF: Card[] = [
        { suit: 'C', rank: 'A' },
        { suit: 'C', rank: '2' },
        { suit: 'C', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'C', rank: '5' }
      ];

      const comboMax = canPlay(maxSF, null, currentRank)!;
      expect(comboMax.type).toBe(HAND_TYPES.BOMB);
      expect(comboMax.name).toBe('同花顺');
      expect(comboMax.power).toBe(564); // 550 + 14

      const comboMin = canPlay(minSF, null, currentRank)!;
      expect(comboMin.type).toBe(HAND_TYPES.BOMB);
      expect(comboMin.name).toBe('同花顺');
      expect(comboMin.power).toBe(555); // 550 + 5
    });

    it('should support wild card substituting missing card and auto-cloning suit for straight flush', () => {
      const currentRank = '10'; // Hearts 10 is wildcard
      // Spades 5, 6, 7, 8 + Hearts 10 (wildcard -> Spades 9)
      const sfWithWild: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' },
        { suit: 'S', rank: '8' },
        { suit: 'H', rank: '10' }
      ];

      const combo = canPlay(sfWithWild, null, currentRank)!;
      expect(combo).not.toBeNull();
      expect(combo.type).toBe(HAND_TYPES.BOMB);
      expect(combo.name).toBe('同花顺');
      expect(combo.power).toBe(559); // 550 + 9
    });

    it('should not treat 5 consecutive cards of mixed suits as straight flush', () => {
      const currentRank = '2';
      const mixedStraight: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' },
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '9' } // Diamonds suit (not a wild card or same suit)
      ];

      const combo = canPlay(mixedStraight, null, currentRank);
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.STRAIGHT); // Single straight, NOT bomb/straight flush
    });

    it('should reject wrap-around straight flush like J-Q-K-A-2', () => {
      const currentRank = '9';
      const sfWrap: Card[] = [
        { suit: 'S', rank: 'J' },
        { suit: 'S', rank: 'Q' },
        { suit: 'S', rank: 'K' },
        { suit: 'S', rank: 'A' },
        { suit: 'S', rank: '2' }
      ];
      expect(canPlay(sfWrap, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. 单顺规则 (Rules §1.3)                                                   */
  /* -------------------------------------------------------------------------- */
  describe('Rule 3: Single Straight Rules (Rules §1.3)', () => {
    it('should strictly require exactly 5 cards (4 or 6 cards are invalid)', () => {
      const currentRank = '2';
      const cards4: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '6' }
      ];
      const cards6: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '6' },
        { suit: 'S', rank: '7' },
        { suit: 'D', rank: '8' }
      ];

      expect(canPlay(cards4, null, currentRank)).toBeNull();
      expect(canPlay(cards6, null, currentRank)).toBeNull();
    });

    it('should accept valid straights from A-2-3-4-5 (5) to 10-J-Q-K-A (14)', () => {
      const currentRank = '9';
      const straightLow: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: '2' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '5' }
      ];
      const straightHigh: Card[] = [
        { suit: 'S', rank: '10' },
        { suit: 'D', rank: 'J' },
        { suit: 'C', rank: 'Q' },
        { suit: 'H', rank: 'K' },
        { suit: 'S', rank: 'A' }
      ];

      const comboLow = canPlay(straightLow, null, currentRank)!;
      expect(comboLow.type).toBe(HAND_TYPES.STRAIGHT);
      expect(comboLow.power).toBe(5);

      const comboHigh = canPlay(straightHigh, null, currentRank)!;
      expect(comboHigh.type).toBe(HAND_TYPES.STRAIGHT);
      expect(comboHigh.power).toBe(14);
    });

    it('should forbid jokers from participating in single straight', () => {
      const currentRank = '2';
      const straightWithRedJoker: Card[] = [
        { suit: 'S', rank: '10' },
        { suit: 'D', rank: 'J' },
        { suit: 'C', rank: 'Q' },
        { suit: 'H', rank: 'K' },
        { suit: 'J', rank: 'red_joker' }
      ];
      const straightWithBlackJoker: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '6' },
        { suit: 'J', rank: 'black_joker' }
      ];

      expect(canPlay(straightWithRedJoker, null, currentRank)).toBeNull();
      expect(canPlay(straightWithBlackJoker, null, currentRank)).toBeNull();
    });

    it('should allow hard level cards (硬主) to participate in single straight', () => {
      const currentRank = '10'; // Level card is 10
      // Spades 10 is a hard level card
      const straightWithHard10: Card[] = [
        { suit: 'S', rank: '7' },
        { suit: 'D', rank: '8' },
        { suit: 'C', rank: '9' },
        { suit: 'S', rank: '10' }, // Hard level card
        { suit: 'H', rank: 'J' }
      ];

      const combo = canPlay(straightWithHard10, null, currentRank);
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.STRAIGHT);
      expect(combo?.power).toBe(11);
    });

    it('should reject wrap-around / cross-boundary straights like J-Q-K-A-2 or Q-K-A-2-3', () => {
      const currentRank = '9';
      const wrap1: Card[] = [
        { suit: 'S', rank: 'J' },
        { suit: 'D', rank: 'Q' },
        { suit: 'C', rank: 'K' },
        { suit: 'H', rank: 'A' },
        { suit: 'S', rank: '2' }
      ];
      const wrap2: Card[] = [
        { suit: 'S', rank: 'Q' },
        { suit: 'D', rank: 'K' },
        { suit: 'C', rank: 'A' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '3' }
      ];

      expect(canPlay(wrap1, null, currentRank)).toBeNull();
      expect(canPlay(wrap2, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. 双顺/木板/对顺规则 (Rules §1.3)                                          */
  /* -------------------------------------------------------------------------- */
  describe('Rule 4: Double Straight Rules (Rules §1.3)', () => {
    it('should accept 3 consecutive pairs (6 cards) like 334455 or AAKKQQ or AA2233', () => {
      const currentRank = '10';
      const ds334455: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' }
      ];
      const dsAAKKQQ: Card[] = [
        { suit: 'S', rank: 'Q' },
        { suit: 'D', rank: 'Q' },
        { suit: 'C', rank: 'K' },
        { suit: 'H', rank: 'K' },
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' }
      ];
      const dsAA2233: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' },
        { suit: 'C', rank: '2' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' }
      ];

      const combo345 = canPlay(ds334455, null, currentRank)!;
      expect(combo345.type).toBe(HAND_TYPES.DOUBLE_STRAIGHT);
      expect(combo345.power).toBe(5);

      const comboQKA = canPlay(dsAAKKQQ, null, currentRank)!;
      expect(comboQKA.type).toBe(HAND_TYPES.DOUBLE_STRAIGHT);
      expect(comboQKA.power).toBe(14);

      const comboA23 = canPlay(dsAA2233, null, currentRank)!;
      expect(comboA23.type).toBe(HAND_TYPES.DOUBLE_STRAIGHT);
      expect(comboA23.power).toBe(3);
    });

    it('should reject 2 consecutive pairs (3344, 4 cards) and 4 consecutive pairs (33445566, 8 cards)', () => {
      const currentRank = '2';
      const ds2pairs: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' }
      ];
      const ds4pairs: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' },
        { suit: 'C', rank: '6' },
        { suit: 'H', rank: '6' }
      ];

      expect(canPlay(ds2pairs, null, currentRank)).toBeNull();
      expect(canPlay(ds4pairs, null, currentRank)).toBeNull();
    });

    it('should allow hard level cards (硬主) to participate in double straight', () => {
      const currentRank = '10'; // 10 is hard level card
      const dsWithHard10: Card[] = [
        { suit: 'S', rank: '9' },
        { suit: 'D', rank: '9' },
        { suit: 'C', rank: '10' },
        { suit: 'H', rank: '10' },
        { suit: 'S', rank: 'J' },
        { suit: 'D', rank: 'J' }
      ];

      const combo = canPlay(dsWithHard10, null, currentRank);
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.DOUBLE_STRAIGHT);
      expect(combo?.power).toBe(11);
    });

    it('should reject wrap-around double straight like K-K-A-A-2-2', () => {
      const currentRank = '9';
      const dsWrap: Card[] = [
        { suit: 'S', rank: 'K' },
        { suit: 'D', rank: 'K' },
        { suit: 'C', rank: 'A' },
        { suit: 'H', rank: 'A' },
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '2' }
      ];
      expect(canPlay(dsWrap, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. 钢板/三顺规则 (Rules §1.4)                                              */
  /* -------------------------------------------------------------------------- */
  describe('Rule 5: Steel Plate Rules (Rules §1.4)', () => {
    it('should accept exactly 2 consecutive triples (6 cards) like 333444 or AAAKKK or 222333', () => {
      const currentRank = '10';
      const sp333444: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' }
      ];
      const spKKKAAA: Card[] = [
        { suit: 'S', rank: 'K' },
        { suit: 'D', rank: 'K' },
        { suit: 'C', rank: 'K' },
        { suit: 'H', rank: 'A' },
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' }
      ];
      const sp222333: Card[] = [
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '2' },
        { suit: 'C', rank: '2' },
        { suit: 'H', rank: '3' },
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' }
      ];

      const combo34 = canPlay(sp333444, null, currentRank)!;
      expect(combo34.type).toBe(HAND_TYPES.STEEL_PLATE);
      expect(combo34.power).toBe(4);

      const comboKA = canPlay(spKKKAAA, null, currentRank)!;
      expect(comboKA.type).toBe(HAND_TYPES.STEEL_PLATE);
      expect(comboKA.power).toBe(14);

      const combo23 = canPlay(sp222333, null, currentRank)!;
      expect(combo23.type).toBe(HAND_TYPES.STEEL_PLATE);
      expect(combo23.power).toBe(3);
    });

    it('should reject 3 consecutive triples (333444555, 9 cards)', () => {
      const currentRank = '10';
      const sp3triples: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '5' },
        { suit: 'S', rank: '5' }
      ];

      expect(canPlay(sp3triples, null, currentRank)).toBeNull();
    });

    it('should reject cross-boundary AAA 222 steel plate', () => {
      const currentRank = '10';
      const spAAA222: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' },
        { suit: 'C', rank: 'A' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '2' }
      ];

      expect(canPlay(spAAA222, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. 三带二 (Rules §1.8)                                                     */
  /* -------------------------------------------------------------------------- */
  describe('Rule 6: Three with Pair Rules (Rules §1.8)', () => {
    it('should require 3 identical cards + 1 valid pair (5 cards)', () => {
      const currentRank = '10';
      const t2: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '2' }
      ];

      const combo = canPlay(t2, null, currentRank)!;
      expect(combo).not.toBeNull();
      expect(combo.type).toBe(HAND_TYPES.THREE_TWO);
      expect(combo.power).toBe(5);
    });

    it('should compare size solely based on the triple part rank', () => {
      const currentRank = '10';
      const t333AA: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: 'A' },
        { suit: 'S', rank: 'A' }
      ];
      const t44422: Card[] = [
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '2' }
      ];

      const combo333 = canPlay(t333AA, null, currentRank)!;
      const combo444 = canPlay(t44422, null, currentRank)!;

      expect(combo333.power).toBe(3);
      expect(combo444.power).toBe(4);

      // 444+22 beats 333+AA
      expect(canPlay(t44422, combo333, currentRank)).not.toBeNull();
      // 333+AA does not beat 444+22
      expect(canPlay(t333AA, combo444, currentRank)).toBeNull();
    });

    it('should reject three-with-two if the attached pair is a mixed joker combination (Red Joker + Black Joker)', () => {
      const currentRank = '10';
      const t333Jokers: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];

      expect(canPlay(t333Jokers, null, currentRank)).toBeNull();
    });

    it('should reject three-with-two if attached cards are two unpaired singles like 333 + 4 + 5', () => {
      const currentRank = '10';
      const t3WithUnpaired: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '3' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '5' }
      ];

      expect(canPlay(t3WithUnpaired, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Hard Rank Cards (非红桃级牌 / 硬主) Legal Combinations                     */
  /* -------------------------------------------------------------------------- */
  describe('Hard Rank Cards (硬主) Legal Combinations', () => {
    it('A.1: Straight - 3-4-♠5(hard)-6-7 when playing 5 should be STRAIGHT Power 7; A-♠2(hard)-3-4-5 when playing 2 should be STRAIGHT Power 5', () => {
      // 打 5 时，3-4-♠5(硬主)-6-7
      const straight5: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'C', rank: '6' },
        { suit: 'H', rank: '7' }
      ];
      const combo5 = canPlay(straight5, null, '5');
      expect(combo5).not.toBeNull();
      expect(combo5?.type).toBe(HAND_TYPES.STRAIGHT);
      expect(combo5?.power).toBe(7);

      // 打 2 时，♠A-♠2(硬主)-3-4-5 (mixed suits so it is single straight)
      const straight2: Card[] = [
        { suit: 'S', rank: 'A' },
        { suit: 'S', rank: '2' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '5' }
      ];
      const combo2 = canPlay(straight2, null, '2');
      expect(combo2).not.toBeNull();
      expect(combo2?.type).toBe(HAND_TYPES.STRAIGHT);
      expect(combo2?.power).toBe(5);
    });

    it('A.2: Straight Flush - ♠3-♠4-♠5(hard)-♠6-♠7 when playing 5 should be BOMB Straight Flush Power 557', () => {
      const sf5: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'S', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' }
      ];
      const combo = canPlay(sf5, null, '5');
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.BOMB);
      expect(combo?.name).toBe('同花顺');
      expect(combo?.power).toBe(557);
    });

    it('A.3: Double Straight - 33-44-♠5♢5(hard) when playing 5 should be DOUBLE_STRAIGHT Power 5', () => {
      const ds5: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'C', rank: '4' },
        { suit: 'H', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' }
      ];
      const combo = canPlay(ds5, null, '5');
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.DOUBLE_STRAIGHT);
      expect(combo?.power).toBe(5);
    });

    it('A.4: Steel Plate - 444-♠5♢5♣5(hard) when playing 5 should be STEEL_PLATE Power 5', () => {
      const sp5: Card[] = [
        { suit: 'S', rank: '4' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '4' },
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' },
        { suit: 'C', rank: '5' }
      ];
      const combo = canPlay(sp5, null, '5');
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.STEEL_PLATE);
      expect(combo?.power).toBe(5);
    });

    it('A.5: Three with Pair - ♠5♢5♣5(hard)+33 when playing 5 should be THREE_TWO Power 15', () => {
      const t2_5: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '5' },
        { suit: 'C', rank: '5' },
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '3' }
      ];
      const combo = canPlay(t2_5, null, '5');
      expect(combo).not.toBeNull();
      expect(combo?.type).toBe(HAND_TYPES.THREE_TWO);
      expect(combo?.power).toBe(15);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 7. 对牌 (Rules §1.6)                                                       */
  /* -------------------------------------------------------------------------- */
  describe('Rule 7: Pair Rules (Rules §1.6)', () => {
    it('should evaluate double Red Joker (power 18) and double Black Joker (power 16) as valid pairs', () => {
      const currentRank = '2';
      const doubleRed: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'red_joker' }
      ];
      const doubleBlack: Card[] = [
        { suit: 'J', rank: 'black_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];

      const comboRed = canPlay(doubleRed, null, currentRank)!;
      expect(comboRed.type).toBe(HAND_TYPES.PAIR);
      expect(comboRed.power).toBe(18);

      const comboBlack = canPlay(doubleBlack, null, currentRank)!;
      expect(comboBlack.type).toBe(HAND_TYPES.PAIR);
      expect(comboBlack.power).toBe(16);

      // Double Red beats Double Black
      expect(canPlay(doubleRed, comboBlack, currentRank)).not.toBeNull();
    });

    it('should reject mixed Joker pair (1 Red Joker + 1 Black Joker)', () => {
      const currentRank = '2';
      const mixedJoker: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];

      expect(evaluateNormalHand(mixedJoker, currentRank).type).toBe(HAND_TYPES.INVALID);
      expect(canPlay(mixedJoker, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 8. 逢人配限制 (Rules §1.1 & §1.10)                                         */
  /* -------------------------------------------------------------------------- */
  describe('Rule 8: Wild Card Restrictions (Rules §1.1 & §1.10)', () => {
    it('should allow Hearts level card (wildcard) to form any normal hand except jokers', () => {
      const currentRank = '10'; // Hearts 10 is wildcard
      // Spades 5, 6, 7, 8 + Hearts 10 -> Single Straight
      const straightWithWild: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'D', rank: '6' },
        { suit: 'C', rank: '7' },
        { suit: 'S', rank: '8' },
        { suit: 'H', rank: '10' }
      ];

      const combo = canPlay(straightWithWild, null, currentRank)!;
      expect(combo).not.toBeNull();
      expect(combo.type).toBe(HAND_TYPES.STRAIGHT);
      expect(combo.power).toBe(9);
    });

    it('should strictly forbid wild card from substituting Red Joker or Black Joker', () => {
      const currentRank = '10'; // Hearts 10 is wildcard
      // 1 Red Joker + 1 Hearts 10 (trying to form pair of Red Jokers)
      const tryJokerPair: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'H', rank: '10' }
      ];

      // 3 Jokers + 1 Hearts 10 (trying to form 4-Joker King Bomb)
      const tryKingBomb: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'H', rank: '10' }
      ];

      expect(canPlay(tryJokerPair, null, currentRank)).toBeNull();
      expect(canPlay(tryKingBomb, null, currentRank)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Formatting Utilities                                                       */
  /* -------------------------------------------------------------------------- */
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
