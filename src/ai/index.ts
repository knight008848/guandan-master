/**
 * index.ts - 掼蛋 AI 决策外壳总控与公共接口 (TypeScript版)
 */

import { Card, PlayerStateView } from '../types';
import { heuristicChoosePlay, greedyChoosePlay, heuristicFollowPlay } from './ai_search';
import { auditAndComparePlays, PlayProposal } from './ai_auditor';

/**
 * AI 决策主入口 (总控仲裁架构)
 */
export function aiChoosePlay(view: PlayerStateView): Card[] | null {
  // 1. 搜集来自不同出牌决策算法的提案
  const proposals: PlayProposal[] = [
    { algoName: 'heuristic', cards: heuristicChoosePlay(view) },
    { algoName: 'greedy', cards: greedyChoosePlay(view) },
    { algoName: 'pass', cards: null } // 默认保留过牌作为候选兜底
  ];

  // 2. 调用决策仲裁与基准测试引擎 (Benchmark Engine) 计算综合评分与推荐
  const report = auditAndComparePlays(view, proposals);

  // 3. 输出 Benchmark 信息至控制台方便开发观察
  console.log(`[AI Benchmark Audit] Best Algo Chosen: "${report.bestAlgo}". Proposals evaluated:`);
  report.proposals.forEach((p) => {
    const cardStr = p.cards ? JSON.stringify(p.cards.map((c) => c.rank)) : 'pass';
    console.log(`  - Algorithm "${p.algoName}": Valid=${p.isValid}, Score=${p.score}, Cards=${cardStr}`);
  });

  // 4. 返回仲裁引擎决定的最佳推荐出牌
  return report.recommendedPlay;
}

/**
 * AI 跟牌接口 (直接委托给经典启发式跟牌算法，供测试/老版本会话逻辑调用)
 */
export function aiFollowPlay(
  hand: Card[],
  lastPlay: { type: string; power: number; cardCount: number },
  currentRank: string
): Card[] | null {
  return heuristicFollowPlay(hand, lastPlay, currentRank);
}
