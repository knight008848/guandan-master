/**
 * ai_evaluator.ts - 启发式手牌与出牌决策估值引擎 (TypeScript版)
 */

import { Card } from '../types';
import { isWildCard } from '../rules';
import { extractCardGroups } from './ai_grouper';

/**
 * 计算大牌控制力评分
 * 控制牌评分体系：
 * - 红大王 (red_joker): +35分
 * - 黑小王 (black_joker): +25分
 * - 级牌/当前 Rank (currentRank): +15分
 * - 正常 Ace: +10分
 * - 正常 King: +5分
 */
export function calculateControlScore(hand: Card[], currentRank: string): number {
  let score = 0;
  hand.forEach((card) => {
    if (card.rank === 'red_joker') {
      score += 35;
    } else if (card.rank === 'black_joker') {
      score += 25;
    } else if (isWildCard(card, currentRank)) {
      // 逢人配（红心主牌）额外增加灵活性得分
      score += 20;
    } else if (card.rank === currentRank) {
      score += 15;
    } else if (card.rank === 'A') {
      score += 10;
    } else if (card.rank === 'K') {
      score += 5;
    }
  });
  return score;
}

/**
 * 贪心划分子集，估算手牌总手数
 * 手数越少，手牌质量越高，听牌/胡牌（打完）概率越高。
 */
export function calculateHandCount(hand: Card[], currentRank: string): number {
  if (hand.length === 0) return 0;

  const remaining = [...hand];
  let handsCount = 0;
  let changed = true;

  while (changed && remaining.length > 0) {
    changed = false;
    const groups = extractCardGroups(remaining, currentRank);

    // 贪心消费组合，优先消费牌型长、权重高的组合
    if (groups.bombs.length > 0) {
      // 消费炸弹
      removeCards(remaining, groups.bombs[0]);
      handsCount++;
      changed = true;
    } else if (groups.steelPlates.length > 0) {
      // 消费钢板
      removeCards(remaining, groups.steelPlates[0]);
      handsCount++;
      changed = true;
    } else if (groups.doubleStraights.length > 0) {
      // 消费双顺
      removeCards(remaining, groups.doubleStraights[0]);
      handsCount++;
      changed = true;
    } else if (groups.straights.length > 0) {
      // 消费单顺
      removeCards(remaining, groups.straights[0]);
      handsCount++;
      changed = true;
    } else if (groups.threeTwos.length > 0) {
      // 消费三带二
      removeCards(remaining, groups.threeTwos[0]);
      handsCount++;
      changed = true;
    } else if (groups.triples.length > 0) {
      // 消费三条
      removeCards(remaining, groups.triples[0]);
      handsCount++;
      changed = true;
    } else if (groups.pairs.length > 0) {
      // 消费对子
      removeCards(remaining, groups.pairs[0]);
      handsCount++;
      changed = true;
    }
  }

  // 剩余无法组合的牌全部作为单张处理
  handsCount += remaining.length;

  return handsCount;
}

/**
 * 评估剩余手牌综合得分
 * 综合得分 = (大牌控制力 * 1.5) - (总手数 * 15)
 * 分数越高，说明手牌控制牌多、剩余手数少，赢面越大。
 */
export function evaluateHand(
  hand: Card[],
  currentRank: string
): { handCount: number; controlScore: number; totalScore: number } {
  const handCount = calculateHandCount(hand, currentRank);
  const controlScore = calculateControlScore(hand, currentRank);
  // 手数权重高，减少一手牌极重要
  const totalScore = controlScore * 1.5 - handCount * 15;

  return {
    handCount,
    controlScore,
    totalScore
  };
}

/**
 * 辅助方法：从手牌数组中删除指定的卡牌
 */
function removeCards(hand: Card[], cardsToRemove: Card[]) {
  cardsToRemove.forEach((card) => {
    const idx = hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      hand.splice(idx, 1);
    }
  });
}
