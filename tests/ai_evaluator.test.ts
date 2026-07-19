import { describe, it, expect } from 'vitest';
import { Card } from '../src/types';
import { calculateControlScore, calculateHandCount, evaluateHand } from '../src/ai/ai_evaluator';

describe('Guandan AI Heuristic Evaluator Unit Tests', () => {
  describe('calculateControlScore', () => {
    it('should accurately sum control weights', () => {
      const hand: Card[] = [
        { suit: 'J', rank: 'red_joker' }, // +35
        { suit: 'J', rank: 'black_joker' }, // +25
        { suit: 'S', rank: 'A' }, // +10
        { suit: 'D', rank: 'K' }, // +5
        { suit: 'C', rank: '5' } // +0
      ];
      const score = calculateControlScore(hand, '2');
      expect(score).toBe(35 + 25 + 10 + 5); // 75
    });

    it('should account for rank cards and wildcards', () => {
      const currentRank = '10';
      const hand: Card[] = [
        { suit: 'H', rank: '10' }, // Hearts 10 is wildcard -> +20
        { suit: 'S', rank: '10' } // Spades 10 is currentRank card -> +15
      ];
      const score = calculateControlScore(hand, currentRank);
      expect(score).toBe(20 + 15); // 35
    });
  });

  describe('calculateHandCount', () => {
    it('should correctly estimate remaining rounds (手数) by greedy partition', () => {
      const hand: Card[] = [
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'H', rank: '8' }, // 1 Bomb of 8s
        { suit: 'S', rank: '10' },
        { suit: 'D', rank: '10' }, // 1 Pair of 10s
        { suit: 'S', rank: 'A' } // 1 Single Ace
      ];
      const count = calculateHandCount(hand, '2');
      // Should partition into: 1 Bomb + 1 Pair + 1 Single = 3 rounds
      expect(count).toBe(3);
    });

    it('should handle empty hand', () => {
      expect(calculateHandCount([], '2')).toBe(0);
    });
  });

  describe('evaluateHand', () => {
    it('should score strong hand higher than weak hand', () => {
      const strongHand: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'S', rank: 'A' },
        { suit: 'D', rank: 'A' },
        { suit: 'H', rank: '2' }, // Assume currentRank is '2', wildcard
        { suit: 'S', rank: 'K' }
      ];

      const weakHand: Card[] = [
        { suit: 'S', rank: '3' },
        { suit: 'D', rank: '4' },
        { suit: 'C', rank: '5' },
        { suit: 'H', rank: '6' },
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '9' }
      ];

      const evalStrong = evaluateHand(strongHand, '2');
      const evalWeak = evaluateHand(weakHand, '2');

      expect(evalStrong.totalScore).toBeGreaterThan(evalWeak.totalScore);
      expect(evalStrong.handCount).toBeLessThan(evalWeak.handCount);
      expect(evalStrong.controlScore).toBeGreaterThan(evalWeak.controlScore);
    });
  });
});
