import { describe, it, expect } from 'vitest';
import { Card, PlayerStateView } from '../src/types';
import { auditAndComparePlays } from '../src/ai/ai_auditor';
import { heuristicChoosePlay, greedyChoosePlay } from '../src/ai/ai_search';
import { sortCards } from '../src/rules';

// Helper to generate a full deck of 108 cards (2 decks of 54)
function generateDeck(): Card[] {
  const suits: Card['suit'][] = ['H', 'D', 'C', 'S'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (let d = 0; d < 2; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    deck.push({ suit: 'J', rank: 'black_joker' });
    deck.push({ suit: 'J', rank: 'red_joker' });
  }
  return deck;
}

// Helper to shuffle a deck
function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

describe('Guandan AI Algorithm Benchmark Simulation', () => {
  it('should run 500 simulated rounds and analyze performance', () => {
    const numRounds = 500;
    const stats = {
      totalRounds: numRounds,
      heuristicValidCount: 0,
      greedyValidCount: 0,
      heuristicBestCount: 0,
      greedyBestCount: 0,
      passBestCount: 0,
      auditorFallbackCount: 0,
      heuristicAverageScore: 0,
      greedyAverageScore: 0,
      scoreDiffSum: 0
    };

    let totalHeuristicScore = 0;
    let totalGreedyScore = 0;

    for (let r = 0; r < numRounds; r++) {
      // 1. Generate hands
      const deck = shuffle(generateDeck());
      const hand = deck.slice(0, 27); // 27 cards per player in Guandan

      // 2. Select a random rank as currentRank
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const currentRank = ranks[Math.floor(Math.random() * ranks.length)];

      // 3. Create a random lastPlay target
      const comboTypes = ['INVALID', 'SINGLE', 'PAIR', 'THREE', 'THREE_TWO', 'STRAIGHT'];
      const targetType = comboTypes[Math.floor(Math.random() * comboTypes.length)];

      let lastPlay = null;
      if (targetType !== 'INVALID') {
        // Random power (e.g. 2 to 17)
        const power = Math.floor(Math.random() * 16) + 2;
        lastPlay = {
          type: targetType as any,
          power,
          cardCount: targetType === 'SINGLE' ? 1 : targetType === 'PAIR' ? 2 : targetType === 'THREE' ? 3 : 5,
          playerIndex: 1
        };
      }

      // 4. Create the state view
      const view: PlayerStateView = {
        hand,
        lastPlay,
        currentRank,
        myIndex: 0,
        currentWinnerIndex: lastPlay ? 1 : 0, // Teammate is at index 2, opponent at 1 and 3
        opponentCardCounts: [15, 15, 15, 15]
      };

      // 5. Gather proposals
      const proposals = [
        { algoName: 'heuristic', cards: heuristicChoosePlay(view) },
        { algoName: 'greedy', cards: greedyChoosePlay(view) },
        { algoName: 'pass', cards: null }
      ];

      // 6. Audit & Compare
      const report = auditAndComparePlays(view, proposals);

      // 7. Record stats
      const hAudit = report.proposals.find((p) => p.algoName === 'heuristic')!;
      const gAudit = report.proposals.find((p) => p.algoName === 'greedy')!;

      if (hAudit.isValid) {
        stats.heuristicValidCount++;
        totalHeuristicScore += hAudit.score;
      }
      if (gAudit.isValid) {
        stats.greedyValidCount++;
        totalGreedyScore += gAudit.score;
      }

      if (hAudit.isValid && gAudit.isValid) {
        stats.scoreDiffSum += hAudit.score - gAudit.score;
      }

      if (report.bestAlgo === 'heuristic') {
        stats.heuristicBestCount++;
      } else if (report.bestAlgo === 'greedy') {
        stats.greedyBestCount++;
      } else if (report.bestAlgo === 'pass') {
        stats.passBestCount++;
      } else if (report.bestAlgo === 'auditor_fallback') {
        stats.auditorFallbackCount++;
      }
    }

    stats.heuristicAverageScore = totalHeuristicScore / Math.max(1, stats.heuristicValidCount);
    stats.greedyAverageScore = totalGreedyScore / Math.max(1, stats.greedyValidCount);

    console.log('\n======================================================');
    console.log('         GUANDAN AI DECISION BENCHMARK REPORT         ');
    console.log('======================================================');
    console.log(`Total Simulated Situations  : ${stats.totalRounds}`);
    console.log(`Heuristic Proposal Valid Rate: ${((stats.heuristicValidCount / numRounds) * 100).toFixed(1)}%`);
    console.log(`Greedy Proposal Valid Rate   : ${((stats.greedyValidCount / numRounds) * 100).toFixed(1)}%`);
    console.log('------------------------------------------------------');
    console.log(`Average Heuristic Score      : ${stats.heuristicAverageScore.toFixed(2)}`);
    console.log(`Average Greedy Score         : ${stats.greedyAverageScore.toFixed(2)}`);
    console.log(`Average Score Delta (H - G)  : ${(stats.scoreDiffSum / numRounds).toFixed(2)}`);
    console.log('------------------------------------------------------');
    console.log('Decision Win Rate (Recommendation Frequency):');
    console.log(
      ` - Heuristic Algorithm Chosen : ${stats.heuristicBestCount} (${((stats.heuristicBestCount / numRounds) * 100).toFixed(1)}%)`
    );
    console.log(
      ` - Greedy Algorithm Chosen    : ${stats.greedyBestCount} (${((stats.greedyBestCount / numRounds) * 100).toFixed(1)}%)`
    );
    console.log(
      ` - Pass/Yield Chosen          : ${stats.passBestCount} (${((stats.passBestCount / numRounds) * 100).toFixed(1)}%)`
    );
    console.log(
      ` - Auditor Fallback Chosen    : ${stats.auditorFallbackCount} (${((stats.auditorFallbackCount / numRounds) * 100).toFixed(1)}%)`
    );
    console.log('======================================================\n');

    expect(stats.heuristicValidCount).toBeGreaterThan(0);
    expect(stats.greedyValidCount).toBeGreaterThan(0);
  }, 120000);
});
