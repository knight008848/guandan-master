/**
 * tfjs_encoder.ts - TensorFlow.js 540 维状态向量与动作编码器 (SDD 规范)
 * 负责将 PlayerStateView 与 Candidate Actions 转化为定长 Float32Array / Tensor 形式
 */

import { Card, PlayerStateView } from '../types';
import { isWildCard } from '../rules';

// 540 维定长状态向量大小常量
export const STATE_VECTOR_SIZE = 540;
export const ACTION_VECTOR_SIZE = 54;

/**
 * 扑克卡牌映射索引 (0 - 53)
 * 扑克顺序：点数 2-A (4种花色 * 13点 = 52张)，加上黑桃/红桃大小王
 */
export function cardToVectorIndex(card: Card): number {
  if (card.rank === 'black_joker') return 52;
  if (card.rank === 'red_joker') return 53;

  const suitOrder: Record<string, number> = { H: 0, D: 1, C: 2, S: 3 };
  const rankOrder: Record<string, number> = {
    '2': 0,
    '3': 1,
    '4': 2,
    '5': 3,
    '6': 4,
    '7': 5,
    '8': 6,
    '9': 7,
    '10': 8,
    J: 9,
    Q: 10,
    K: 11,
    A: 12
  };

  const suitIdx = suitOrder[card.suit] ?? 0;
  const rankIdx = rankOrder[card.rank] ?? 0;
  return rankIdx * 4 + suitIdx;
}

/**
 * 将 PlayerStateView 编码为定长 540 维度的 Float32Array 数组
 */
export function encodeStateView(view: PlayerStateView): Float32Array {
  const vector = new Float32Array(STATE_VECTOR_SIZE);

  // 1. 玩家自己手牌分块 (索引 0..107，每个扑克位置用张数/独热表示，两副牌最多 2 张)
  if (view.hand && Array.isArray(view.hand)) {
    view.hand.forEach((card) => {
      const idx = cardToVectorIndex(card);
      vector[idx] += 1.0;
      // 级牌/逢人配额外高亮标识存入后半段 54 维 (54..107)
      if (isWildCard(card, view.currentRank)) {
        vector[54 + idx] += 1.0;
      }
    });
  }

  // 2. 上家需要压制的牌型分块 (索引 108..161)
  if (view.lastPlay && view.lastPlay.type !== 'INVALID') {
    // 基础参数填入前 4 维 (108..111)
    const typeMap: Record<string, number> = {
      SINGLE: 1,
      PAIR: 2,
      THREE: 3,
      THREE_TWO: 4,
      STRAIGHT: 5,
      FLUSH: 6,
      STEEL_PLATE: 7,
      BOMB: 8,
      KING_BOMB: 9
    };
    vector[108] = typeMap[view.lastPlay.type] || 0;
    vector[109] = view.lastPlay.power || 0;
    vector[110] = view.lastPlay.cardCount || 0;
    vector[111] = view.lastPlay.playerIndex ?? -1;
  }

  // 3. 对手余牌张数与位置分布分块 (索引 162..197)
  if (view.opponentCardCounts && Array.isArray(view.opponentCardCounts)) {
    view.opponentCardCounts.forEach((count, idx) => {
      vector[162 + idx] = count / 27.0; // 归一化手牌比率
    });
  }
  vector[170] = view.myIndex;
  vector[171] = view.currentWinnerIndex;

  // 4. 当前局级牌 (Current Rank) 独热分块 (索引 198..211)
  const rankIdxMap: Record<string, number> = {
    '2': 0,
    '3': 1,
    '4': 2,
    '5': 3,
    '6': 4,
    '7': 5,
    '8': 6,
    '9': 7,
    '10': 8,
    J: 9,
    Q: 10,
    K: 11,
    A: 12
  };
  const currentRankIdx = rankIdxMap[view.currentRank] ?? 0;
  vector[198 + currentRankIdx] = 1.0;

  // 预留后段 (212..539) 供深度模型做更高阶特征填充
  return vector;
}

/**
 * 将某个候选动作 (Candidate Play Action) 编码为定长 54 维度的 Float32Array 数组
 */
export function encodeAction(cards: Card[] | null): Float32Array {
  const vector = new Float32Array(ACTION_VECTOR_SIZE);
  if (!cards || cards.length === 0) {
    return vector; // PASS 动作全为 0
  }

  cards.forEach((card) => {
    const idx = cardToVectorIndex(card);
    vector[idx] += 1.0;
  });

  return vector;
}
