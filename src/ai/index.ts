/**
 * index.ts - 掼蛋 AI 决策外壳总控与公共接口 (TypeScript版)
 */

import { Card, PlayerStateView } from '../types';
import {
  heuristicChoosePlay,
  greedyChoosePlay,
  heuristicFollowPlay,
  tfjsChoosePlay,
  getSharedTFJSAgent,
  setSharedTFJSAgent
} from './ai_search';
import { auditAndComparePlays, PlayProposal } from './ai_auditor';
import { TFJSGuandanAgent } from './tfjs_agent';

export { TFJSGuandanAgent, getSharedTFJSAgent, setSharedTFJSAgent, tfjsChoosePlay };

// 初始化默认全局单例 Agent
const defaultTFJSAgent = new TFJSGuandanAgent();
defaultTFJSAgent.init().catch((e) => console.warn('[AI] TFJS default init warn:', e));
setSharedTFJSAgent(defaultTFJSAgent);

export type AIAlgorithmType = 'tfjs' | 'heuristic' | 'greedy' | 'pass';

/**
 * AI 决策主入口 (支持单算法指定与总控仲裁多提案竞选)
 */
export function aiChoosePlay(view: PlayerStateView, algorithm?: AIAlgorithmType): Card[] | null {
  // 若显式指定了单一算法，直接执行对应算法返回
  if (algorithm === 'tfjs') {
    return tfjsChoosePlay(view);
  }
  if (algorithm === 'heuristic') {
    return heuristicChoosePlay(view);
  }
  if (algorithm === 'greedy') {
    return greedyChoosePlay(view);
  }
  if (algorithm === 'pass') {
    return null;
  }

  // 1. 搜集来自不同出牌决策算法的提案（含深度学习 TFJS、启发式规则、贪心与兜底）
  const proposals: PlayProposal[] = [
    { algoName: 'tfjs', cards: tfjsChoosePlay(view) },
    { algoName: 'heuristic', cards: heuristicChoosePlay(view) },
    { algoName: 'greedy', cards: greedyChoosePlay(view) },
    { algoName: 'pass', cards: null } // 默认保留过牌作为候选兜底
  ];

  // 2. 调用决策仲裁与基准测试引擎 (Benchmark Engine) 计算综合评分与推荐
  const report = auditAndComparePlays(view, proposals);

  // 3. 格式化输出高亮决策日志至浏览器控制台，方便直观观察 TFJS 决策与仲裁
  const tfjsProposal = report.proposals.find((p) => p.algoName === 'tfjs');
  const isTFJSWinner = report.bestAlgo === 'tfjs';

  console.groupCollapsed(
    `%c[AI Decision Engine]%c ${isTFJSWinner ? '🧠 采用 TensorFlow.js 模型决策' : '🌲 采用规则策略决策: ' + report.bestAlgo}`,
    'background: #1e3a8a; color: #60a5fa; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    isTFJSWinner ? 'color: #34d399; font-weight: bold;' : 'color: #fbbf24; font-weight: bold;'
  );
  console.log('🏆 仲裁优胜算法:', report.bestAlgo);
  console.log(
    '🤖 TFJS 提案评分:',
    tfjsProposal?.score,
    '| 提案出牌:',
    tfjsProposal?.cards?.map((c) => c.rank) || 'PASS'
  );
  console.table(
    report.proposals.map((p) => ({
      算法名称: p.algoName,
      规则合法: p.isValid ? '✅ 合法' : '❌ 非法',
      综合估值评分: p.score,
      建议出牌: p.cards ? p.cards.map((c) => `${c.suit || ''}${c.rank}`).join(' ') : 'PASS'
    }))
  );
  console.groupEnd();

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
