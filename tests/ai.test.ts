import { describe, it, expect } from 'vitest';
import { Card, PlayerStateView } from '../src/types';
import { aiChoosePlay, aiFollowPlay } from '../src/ai';
import { extractCardGroups } from '../src/ai/ai_grouper';
import { HAND_TYPES } from '../src/rules';

describe('Guandan AI Unit Tests', () => {
  describe('extractCardGroups', () => {
    it('should separate bombs from other combinations without breaking them', () => {
      const hand: Card[] = [
        { suit: 'S', rank: '8' },
        { suit: 'D', rank: '8' },
        { suit: 'C', rank: '8' },
        { suit: 'H', rank: '8' }, // This forms a bomb of 8s
        { suit: 'S', rank: '10' },
        { suit: 'D', rank: '10' }, // Pair of 10s
        { suit: 'S', rank: 'A' } // Single Ace
      ];

      const groups = extractCardGroups(hand, '2');

      // Verify bomb of 8s is grouped in bombs
      expect(groups.bombs.length).toBe(1);
      expect(groups.bombs[0].length).toBe(4);
      expect(groups.bombs[0][0].rank).toBe('8');

      // Verify pair of 10s is grouped in pairs
      expect(groups.pairs.length).toBe(1);
      expect(groups.pairs[0].length).toBe(2);
      expect(groups.pairs[0][0].rank).toBe('10');

      // Verify single Ace is grouped in singles
      expect(groups.singles.length).toBe(1);
      expect(groups.singles[0].rank).toBe('A');
    });

    it('should extract jokers and detect sky bomb (天王炸)', () => {
      const hand: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'J', rank: 'black_joker' }
      ];

      const groups = extractCardGroups(hand, '2');
      expect(groups.bombs.length).toBe(1);
      expect(groups.bombs[0].length).toBe(4); // Sky bomb!
    });

    it('should extract wildcard-substituted combinations (straight flush, pairs, etc.)', () => {
      // currentRank = '10'
      // Hand: Spades 5, Spades 6, Spades 7, Spades 8, Hearts 10 (wildcard)
      // And a single Spade 3.
      const hand: Card[] = [
        { suit: 'S', rank: '5' },
        { suit: 'S', rank: '6' },
        { suit: 'S', rank: '7' },
        { suit: 'S', rank: '8' },
        { suit: 'H', rank: '10' }, // Wildcard
        { suit: 'S', rank: '3' } // Single Spade 3
      ];

      const groups = extractCardGroups(hand, '10');

      // 1. Should find 3 straight flushes as bombs (3-4-5-6-7, 4-5-6-7-8, 5-6-7-8-9)
      expect(groups.bombs.length).toBe(3);
      expect(groups.bombs[0].length).toBe(5);

      // 2. Should find 3 normal straights
      expect(groups.straights.length).toBe(3);
      expect(groups.straights[0].length).toBe(5);

      // 3. Should find virtual pair (Spade 3 + Hearts 10 as wildcard Spade 3)
      const pairOfThrees = groups.pairs.find((p) => p.some((c) => c.rank === '3'));
      expect(pairOfThrees).toBeDefined();
      expect(pairOfThrees?.length).toBe(2);
    });
  });

  describe('aiChoosePlay / aiFollowPlay', () => {
    it('should pass if teammate is currently winning and last play is high weight', () => {
      const view: PlayerStateView = {
        hand: [
          { suit: 'S', rank: 'J' },
          { suit: 'D', rank: 'Q' }
        ],
        lastPlay: {
          type: HAND_TYPES.SINGLE,
          power: 12, // Queen
          cardCount: 1,
          playerIndex: 1 // Opponent 1
        },
        currentRank: '2',
        myIndex: 0, // Player
        currentWinnerIndex: 2, // Teammate is winning!
        opponentCardCounts: [2, 5, 2, 5]
      };

      const play = aiChoosePlay(view);
      expect(play).toBeNull(); // Should choose to pass and let teammate win
    });

    it('should follow with the smallest card that beats target', () => {
      const hand: Card[] = [
        { suit: 'S', rank: '5' }, // weight 5
        { suit: 'D', rank: '8' }, // weight 8
        { suit: 'C', rank: 'K' } // weight 13
      ];

      const lastPlay = {
        type: HAND_TYPES.SINGLE,
        power: 6, // 6 of spades
        cardCount: 1
      };

      const play = aiFollowPlay(hand, lastPlay, '2');
      // Should beat 6 with smallest valid card, which is 8
      expect(play).not.toBeNull();
      expect(play?.length).toBe(1);
      expect(play?.[0].rank).toBe('8');
    });

    it('should not split pairs when following single card if hand length > 4', () => {
      const hand: Card[] = [
        { suit: 'S', rank: '7' },
        { suit: 'D', rank: '7' }, // Pair of 7s
        { suit: 'S', rank: '10' },
        { suit: 'D', rank: '10' }, // Pair of 10s
        { suit: 'C', rank: 'A' } // Single Ace
      ];

      const lastPlay = {
        type: HAND_TYPES.SINGLE,
        power: 5, // 5 of spades
        cardCount: 1
      };

      const play = aiFollowPlay(hand, lastPlay, '2');
      // Single Ace beats 5, while pairs of 7s and 10s should be preserved
      expect(play).not.toBeNull();
      expect(play?.length).toBe(1);
      expect(play?.[0].rank).toBe('A');
    });
  });
});
