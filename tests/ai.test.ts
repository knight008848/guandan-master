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

    it('should NOT bomb teammate small bomb when teammate is currently winning', () => {
      const view: PlayerStateView = {
        hand: [
          { suit: 'S', rank: '5' },
          { suit: 'D', rank: '5' },
          { suit: 'C', rank: '5' },
          { suit: 'H', rank: '5' } // Bomb of 5s
        ],
        lastPlay: {
          type: HAND_TYPES.BOMB,
          power: 3, // Teammate played small bomb of 3s (power = 3)
          cardCount: 4,
          playerIndex: 2 // Teammate
        },
        currentRank: '2',
        myIndex: 0,
        currentWinnerIndex: 2, // Teammate is winning!
        opponentCardCounts: [15, 10, 15, 10]
      };

      const play = aiChoosePlay(view);
      expect(play).toBeNull(); // Should pass, NOT bomb teammate's small bomb
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

    it('should extract pair of jokers when player has 2 jokers (less than 4)', () => {
      const hand: Card[] = [
        { suit: 'J', rank: 'red_joker' },
        { suit: 'J', rank: 'black_joker' },
        { suit: 'S', rank: '5' }
      ];

      const groups = extractCardGroups(hand, '2');
      // Should have 1 pair of jokers
      expect(groups.pairs.length).toBe(1);
      expect(groups.pairs[0].length).toBe(2);
      expect(groups.pairs[0].some((c) => c.rank === 'red_joker')).toBe(true);
      expect(groups.pairs[0].some((c) => c.rank === 'black_joker')).toBe(true);
      // No 4-joker sky bomb
      expect(groups.bombs.length).toBe(0);
    });

    it('should play single Joker in a timely manner to gain control against high opponent card', () => {
      const view: PlayerStateView = {
        hand: [
          { suit: 'S', rank: '5' },
          { suit: 'D', rank: '6' },
          { suit: 'J', rank: 'red_joker' }
        ],
        lastPlay: {
          type: HAND_TYPES.SINGLE,
          power: 14, // Opponent played Single Ace
          cardCount: 1,
          playerIndex: 1
        },
        currentRank: '2',
        myIndex: 0,
        currentWinnerIndex: 1,
        opponentCardCounts: [5, 5, 5, 5]
      };

      const play = aiChoosePlay(view);
      expect(play).not.toBeNull();
      expect(play?.length).toBe(1);
      expect(play?.[0].rank).toBe('red_joker');
    });

    it('should play pair of Jokers in a timely manner to gain control against high opponent pair', () => {
      const view: PlayerStateView = {
        hand: [
          { suit: 'S', rank: '5' },
          { suit: 'D', rank: '5' },
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'black_joker' }
        ],
        lastPlay: {
          type: HAND_TYPES.PAIR,
          power: 13, // Opponent played Pair of Kings
          cardCount: 2,
          playerIndex: 1
        },
        currentRank: '2',
        myIndex: 0,
        currentWinnerIndex: 1,
        opponentCardCounts: [5, 5, 5, 5]
      };

      const play = aiChoosePlay(view);
      expect(play).not.toBeNull();
      expect(play?.length).toBe(2);
      expect(play?.some((c) => c.rank === 'red_joker')).toBe(true);
      expect(play?.some((c) => c.rank === 'black_joker')).toBe(true);
    });

    it('should preserve King Bomb (4 Jokers) when opponent plays small cards, and use it against big bomb', () => {
      // 1. Retention test: Opponent plays small single 3
      const viewSmall: PlayerStateView = {
        hand: [
          { suit: 'S', rank: '8' },
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'black_joker' },
          { suit: 'J', rank: 'black_joker' } // 4 Jokers
        ],
        lastPlay: {
          type: HAND_TYPES.SINGLE,
          power: 3, // Single 3
          cardCount: 1,
          playerIndex: 1
        },
        currentRank: '2',
        myIndex: 0,
        currentWinnerIndex: 1,
        opponentCardCounts: [10, 10, 10, 10]
      };

      const playSmall = aiChoosePlay(viewSmall);
      // AI should play single 8, preserving King Bomb intact
      expect(playSmall).not.toBeNull();
      expect(playSmall?.length).toBe(1);
      expect(playSmall?.[0].rank).toBe('8');

      // 2. Interception test: Opponent plays 5-card Bomb
      const viewBomb: PlayerStateView = {
        hand: [
          { suit: 'S', rank: '8' },
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'black_joker' },
          { suit: 'J', rank: 'black_joker' } // 4 Jokers
        ],
        lastPlay: {
          type: HAND_TYPES.BOMB,
          power: 204, // 5-card bomb of 4s
          cardCount: 5,
          playerIndex: 1
        },
        currentRank: '2',
        myIndex: 0,
        currentWinnerIndex: 1,
        opponentCardCounts: [5, 5, 5, 5]
      };

      const playBomb = aiChoosePlay(viewBomb);
      // AI should play King Bomb (4 Jokers) to gain control!
      expect(playBomb).not.toBeNull();
      expect(playBomb?.length).toBe(4);
      expect(playBomb?.filter((c) => c.rank === 'red_joker' || c.rank === 'black_joker').length).toBe(4);
    });
  });
});
