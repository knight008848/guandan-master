import { describe, it, expect, beforeAll } from 'vitest';
import { Card, PlayerStateView } from '../src/types';
import { auditAndComparePlays } from '../src/ai/ai_auditor';
import { heuristicChoosePlay, greedyChoosePlay, tfjsChoosePlay } from '../src/ai/ai_search';
import { TFJSGuandanAgent } from '../src/ai/tfjs_agent';

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
  let tfjsAgent: TFJSGuandanAgent;

  beforeAll(async () => {
    tfjsAgent = new TFJSGuandanAgent();
    await tfjsAgent.init();
  });

  it('should run 100 simulated rounds and analyze performance across TFJS, Heuristic and Greedy algorithms', () => {
    const numRounds = 100;

    const stats = {
      totalRounds: numRounds,
      tfjsValidCount: 0,
      heuristicValidCount: 0,
      greedyValidCount: 0,
      tfjsBestCount: 0,
      heuristicBestCount: 0,
      greedyBestCount: 0,
      passBestCount: 0,
      auditorFallbackCount: 0,
      tfjsAverageScore: 0,
      heuristicAverageScore: 0,
      greedyAverageScore: 0,
      scoreDiffTFJSvsHeuristic: 0,
      totalTFJSLatencyMs: 0
    };

    let totalTFJSScore = 0;
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

      // 5. Gather proposals & Benchmark latency
      const t0 = performance.now();
      const tfjsPlay = tfjsChoosePlay(view, tfjsAgent);
      const t1 = performance.now();
      stats.totalTFJSLatencyMs += t1 - t0;

      const proposals = [
        { algoName: 'tfjs', cards: tfjsPlay },
        { algoName: 'heuristic', cards: heuristicChoosePlay(view) },
        { algoName: 'greedy', cards: greedyChoosePlay(view) },
        { algoName: 'pass', cards: null }
      ];

      // 6. Audit & Compare
      const report = auditAndComparePlays(view, proposals);

      // 7. Record stats
      const tfAudit = report.proposals.find((p) => p.algoName === 'tfjs')!;
      const hAudit = report.proposals.find((p) => p.algoName === 'heuristic')!;
      const gAudit = report.proposals.find((p) => p.algoName === 'greedy')!;

      if (tfAudit.isValid) {
        stats.tfjsValidCount++;
        totalTFJSScore += tfAudit.score;
      }
      if (hAudit.isValid) {
        stats.heuristicValidCount++;
        totalHeuristicScore += hAudit.score;
      }
      if (gAudit.isValid) {
        stats.greedyValidCount++;
        totalGreedyScore += gAudit.score;
      }

      if (tfAudit.isValid && hAudit.isValid) {
        stats.scoreDiffTFJSvsHeuristic += tfAudit.score - hAudit.score;
      }

      if (report.bestAlgo === 'tfjs') {
        stats.tfjsBestCount++;
      } else if (report.bestAlgo === 'heuristic') {
        stats.heuristicBestCount++;
      } else if (report.bestAlgo === 'greedy') {
        stats.greedyBestCount++;
      } else if (report.bestAlgo === 'pass') {
        stats.passBestCount++;
      } else if (report.bestAlgo === 'auditor_fallback') {
        stats.auditorFallbackCount++;
      }
    }

    stats.tfjsAverageScore = totalTFJSScore / Math.max(1, stats.tfjsValidCount);
    stats.heuristicAverageScore = totalHeuristicScore / Math.max(1, stats.heuristicValidCount);
    stats.greedyAverageScore = totalGreedyScore / Math.max(1, stats.greedyValidCount);

    console.log('\n======================================================');
    console.log('      GUANDAN AI BENCHMARK REPORT (TFJS INTEGRATED)   ');
    console.log('======================================================');
    console.log(`Total Simulated Situations  : ${stats.totalRounds}`);
    console.log(`TFJS Proposal Valid Rate    : ${((stats.tfjsValidCount / numRounds) * 100).toFixed(1)}%`);
    console.log(`Heuristic Proposal Valid Rate: ${((stats.heuristicValidCount / numRounds) * 100).toFixed(1)}%`);
    console.log(`Greedy Proposal Valid Rate   : ${((stats.greedyValidCount / numRounds) * 100).toFixed(1)}%`);
    console.log('------------------------------------------------------');
    console.log(`Average TFJS Score           : ${stats.tfjsAverageScore.toFixed(2)}`);
    console.log(`Average Heuristic Score      : ${stats.heuristicAverageScore.toFixed(2)}`);
    console.log(`Average Greedy Score         : ${stats.greedyAverageScore.toFixed(2)}`);
    console.log(`Score Delta (TFJS - Heuristic): ${(stats.scoreDiffTFJSvsHeuristic / numRounds).toFixed(2)}`);
    console.log(`Average TFJS Latency Per Step: ${(stats.totalTFJSLatencyMs / numRounds).toFixed(3)} ms`);
    console.log('------------------------------------------------------');
    console.log('Decision Win Rate (Auditor Best Recommendation Frequency):');
    console.log(
      ` - TensorFlow.js Algorithm    : ${stats.tfjsBestCount} (${((stats.tfjsBestCount / numRounds) * 100).toFixed(1)}%)`
    );
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

    expect(stats.tfjsValidCount).toBe(numRounds); // 100% 合法率
    expect(stats.heuristicValidCount).toBe(numRounds);
    expect(stats.greedyValidCount).toBe(numRounds);
    expect(stats.totalTFJSLatencyMs / numRounds).toBeLessThan(1000); // Node.js CPU 模式下 < 1000ms (浏览器 WebGL 加速下 < 10ms)
  }, 240000);
});
