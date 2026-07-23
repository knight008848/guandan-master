import { describe, it, expect } from 'vitest';
import { Card, PlayerStateView } from '../src/types';
import { auditAndComparePlays, PlayProposal } from '../src/ai/ai_auditor';
import { HAND_TYPES } from '../src/rules';

describe('Guandan AI Auditor & Benchmark Unit Tests', () => {
  it('should mark invalid proposals as invalid and give low scores', () => {
    const hand: Card[] = [
      { suit: 'S', rank: '5' },
      { suit: 'D', rank: '8' },
      { suit: 'C', rank: 'K' }
    ];

    const view: PlayerStateView = {
      hand,
      lastPlay: {
        type: HAND_TYPES.SINGLE,
        power: 10, // 10 of spades
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [5, 5, 5, 5]
    };

    const proposals: PlayProposal[] = [
      { algoName: 'play_too_small', cards: [{ suit: 'S', rank: '5' }] }, // Weight 5 < 10, invalid
      { algoName: 'cheat_play', cards: [{ suit: 'S', rank: 'A' }] }, // Cards not in hand, invalid
      { algoName: 'valid_play', cards: [{ suit: 'C', rank: 'K' }] }, // Weight 13 > 10, valid
      { algoName: 'pass_play', cards: null } // Valid to pass
    ];

    const report = auditAndComparePlays(view, proposals);

    // Verify 'valid_play' is valid
    const validAudit = report.proposals.find((p) => p.algoName === 'valid_play');
    expect(validAudit?.isValid).toBe(true);

    // Verify 'play_too_small' is invalid
    const smallAudit = report.proposals.find((p) => p.algoName === 'play_too_small');
    expect(smallAudit?.isValid).toBe(false);
    expect(smallAudit?.score).toBe(-9999);

    // Verify recommended play is 'valid_play' (since passing gives score 0, and playing King reduces hand count without wasting too much control)
    // Actually, let's check which is best between playing King and passing
    expect(report.bestAlgo).toBe('valid_play');
    expect(report.recommendedPlay).toEqual([{ suit: 'C', rank: 'K' }]);
  });

  it('should penalize wasting valuable control cards', () => {
    const hand: Card[] = [
      { suit: 'S', rank: '5' },
      { suit: 'D', rank: 'J' },
      { suit: 'J', rank: 'red_joker' }
    ];

    const view: PlayerStateView = {
      hand,
      lastPlay: {
        type: HAND_TYPES.SINGLE,
        power: 4, // 4 of spades
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [5, 5, 5, 5]
    };

    const proposals: PlayProposal[] = [
      { algoName: 'waste_joker', cards: [{ suit: 'J', rank: 'red_joker' }] }, // Wastes a red joker (weight 17)
      { algoName: 'use_normal_j', cards: [{ suit: 'D', rank: 'J' }] } // Uses Jack (weight 11)
    ];

    const report = auditAndComparePlays(view, proposals);

    const wasteAudit = report.proposals.find((p) => p.algoName === 'waste_joker');
    const normalAudit = report.proposals.find((p) => p.algoName === 'use_normal_j');

    expect(wasteAudit?.isValid).toBe(true);
    expect(normalAudit?.isValid).toBe(true);

    // Normal Jack should score higher than wasting a Red Joker
    expect(normalAudit!.score).toBeGreaterThan(wasteAudit!.score);
    expect(report.bestAlgo).toBe('use_normal_j');
  });

  it('should penalize splitting bombs', () => {
    const hand: Card[] = [
      { suit: 'S', rank: '3' },
      { suit: 'D', rank: '3' },
      { suit: 'C', rank: '3' },
      { suit: 'H', rank: '3' }, // Bomb of 3s!
      { suit: 'S', rank: '8' } // Single 8
    ];

    const view: PlayerStateView = {
      hand,
      lastPlay: {
        type: HAND_TYPES.SINGLE,
        power: 2, // 2 of spades (weight 2)
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '10',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [5, 5, 5, 5]
    };

    const proposals: PlayProposal[] = [
      { algoName: 'split_bomb_3', cards: [{ suit: 'S', rank: '3' }] }, // Splits the bomb of 3s
      { algoName: 'play_normal_8', cards: [{ suit: 'S', rank: '8' }] } // Plays normal 8
    ];

    const report = auditAndComparePlays(view, proposals);

    const splitAudit = report.proposals.find((p) => p.algoName === 'split_bomb_3');
    const normalAudit = report.proposals.find((p) => p.algoName === 'play_normal_8');

    expect(splitAudit?.isValid).toBe(true);
    expect(normalAudit?.isValid).toBe(true);

    // Playing normal 8 should score much higher than splitting bomb of 3s
    expect(normalAudit!.score).toBeGreaterThan(splitAudit!.score);
    expect(report.bestAlgo).toBe('play_normal_8');
  });

  it('should penalize splitting pairs (40 pts) and splitting triples (70 pts)', () => {
    const hand: Card[] = [
      { suit: 'S', rank: '7' },
      { suit: 'D', rank: '7' }, // Pair of 7s
      { suit: 'S', rank: '9' },
      { suit: 'D', rank: '9' },
      { suit: 'C', rank: '9' }, // Triple of 9s
      { suit: 'H', rank: 'Q' } // Single Q
    ];

    const view: PlayerStateView = {
      hand,
      lastPlay: {
        type: HAND_TYPES.SINGLE,
        power: 5,
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [10, 10, 10, 10]
    };

    const proposals: PlayProposal[] = [
      { algoName: 'split_pair_7', cards: [{ suit: 'S', rank: '7' }] },
      { algoName: 'split_triple_9', cards: [{ suit: 'S', rank: '9' }] },
      { algoName: 'play_single_q', cards: [{ suit: 'H', rank: 'Q' }] }
    ];

    const report = auditAndComparePlays(view, proposals);

    const splitPair = report.proposals.find((p) => p.algoName === 'split_pair_7');
    const splitTriple = report.proposals.find((p) => p.algoName === 'split_triple_9');
    const playSingle = report.proposals.find((p) => p.algoName === 'play_single_q');

    expect(splitPair?.metrics.comboIntegrity).toBe(40);
    expect(splitTriple?.metrics.comboIntegrity).toBe(70);
    expect(playSingle?.metrics.comboIntegrity).toBe(0);

    // Single Q should score higher than splitting pair 7 or triple 9
    expect(report.bestAlgo).toBe('play_single_q');
  });

  it('should fallback to smallest card when all proposals are invalid and it must lead', () => {
    const hand: Card[] = [
      { suit: 'C', rank: 'K' },
      { suit: 'D', rank: '5' },
      { suit: 'S', rank: '8' }
    ];

    const view: PlayerStateView = {
      hand,
      lastPlay: null, // Must lead!
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 0,
      opponentCardCounts: [5, 5, 5, 5]
    };

    const proposals: PlayProposal[] = [
      { algoName: 'invalid_pass', cards: null }, // Invalid to pass on lead
      { algoName: 'invalid_cheat', cards: [{ suit: 'S', rank: 'A' }] } // Cards not in hand
    ];

    const report = auditAndComparePlays(view, proposals);

    expect(report.bestAlgo).toBe('auditor_fallback');
    // Smallest card in hand is 5 of diamonds
    expect(report.recommendedPlay).toEqual([{ suit: 'D', rank: '5' }]);
  });
});
