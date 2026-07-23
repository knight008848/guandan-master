/**
 * ai_auditor.ts - 独立决策审计与基准测试引擎 (TypeScript版)
 */

import { Card, PlayerStateView, Combo } from '../types';
import { canPlay, getCardWeight, isWildCard, HAND_TYPES } from '../rules';
import { calculateHandCount, calculateControlScore } from './ai_evaluator';

export interface PlayProposal {
  algoName: string; // 算法名称
  cards: Card[] | null; // 该算法建议的出牌 (null 表示过牌)
}

export interface ProposalAudit {
  algoName: string;
  cards: Card[] | null;
  isValid: boolean; // 规则是否合法
  score: number; // 综合估值打分
  metrics: {
    // 指标明细
    handCountReduction: number; // 减少手数评分
    controlWaste: number; // 大牌浪费度扣分
    comboIntegrity: number; // 破坏手牌连贯度扣分
  };
}

export interface BenchmarkReport {
  proposals: ProposalAudit[];
  bestAlgo: string;
  recommendedPlay: Card[] | null;
}

/**
 * 独立决策对比与审计主入口 (Benchmark Engine)
 */
export function auditAndComparePlays(view: PlayerStateView, proposals: PlayProposal[]): BenchmarkReport {
  const { hand, lastPlay, currentRank } = view;

  // 1. 判断是否是必须首发（不能过牌）
  const mustLead = !lastPlay || lastPlay.type === HAND_TYPES.INVALID;

  const auditedProposals: ProposalAudit[] = proposals.map((prop) => {
    let isValid = false;
    let playedCombo: Combo | null = null;

    if (prop.cards === null || prop.cards === undefined || prop.cards.length === 0) {
      // 过牌提案
      isValid = !mustLead; // 如果是首发，则过牌非法
    } else {
      // 检查提案出牌是否在手牌中存在
      const hasAllCards = checkCardsExistInHand(prop.cards, hand);
      if (hasAllCards) {
        // 调用核心规则进行合法性核验
        // 将 PlayRecord 兼容转换为 Combo
        const prevCombo: Combo | null = lastPlay
          ? {
              type: lastPlay.type,
              power: lastPlay.power,
              cardCount: lastPlay.cardCount
            }
          : null;

        playedCombo = canPlay(prop.cards, prevCombo, currentRank);
        isValid = playedCombo !== null;
      }
    }

    // 计算决策指标评分
    const metrics = calculateMetrics(prop.cards, hand, currentRank, playedCombo);
    const score = isValid ? metrics.handCountReduction - metrics.controlWaste - metrics.comboIntegrity : -9999; // 非法出牌赋予极低分

    return {
      algoName: prop.algoName,
      cards: prop.cards,
      isValid,
      score,
      metrics
    };
  });

  // 2. 选出得分最高的合法方案作为推荐决策
  const validProposals = auditedProposals.filter((p) => p.isValid);
  let bestAlgo = 'none';
  let recommendedPlay: Card[] | null = null;

  if (validProposals.length > 0) {
    // 降序排序，取最高分
    validProposals.sort((a, b) => b.score - a.score);
    bestAlgo = validProposals[0].algoName;
    recommendedPlay = validProposals[0].cards;
  } else {
    // 极端保底情况：如果所有方案都非法，且必须出牌，则出手中最小的单张
    if (mustLead && hand.length > 0) {
      bestAlgo = 'auditor_fallback';
      // 找到权重最小的单张
      const sortedHand = [...hand].sort(
        (a, b) => getCardWeight(a.rank, currentRank) - getCardWeight(b.rank, currentRank)
      );
      recommendedPlay = [sortedHand[0]];
    } else {
      bestAlgo = 'auditor_fallback';
      recommendedPlay = null; // 过牌保底
    }
  }

  return {
    proposals: auditedProposals,
    bestAlgo,
    recommendedPlay
  };
}

/**
 * 辅助方法：校验要出的牌是否全在手牌中 (防作弊/硬性校验)
 */
function checkCardsExistInHand(playCards: Card[], hand: Card[]): boolean {
  const handCopy = [...hand];
  for (const pCard of playCards) {
    const idx = handCopy.findIndex((hCard) => hCard.suit === pCard.suit && hCard.rank === pCard.rank);
    if (idx === -1) {
      return false; // 要出的牌在手牌中找不到
    }
    handCopy.splice(idx, 1);
  }
  return true;
}

/**
 * 计算决策指标评分
 */
function calculateMetrics(
  playCards: Card[] | null,
  hand: Card[],
  currentRank: string,
  combo: Combo | null
): ProposalAudit['metrics'] {
  if (!playCards || playCards.length === 0 || !combo) {
    return { handCountReduction: 0, controlWaste: 0, comboIntegrity: 0 };
  }

  // 1. 手数减少估值
  const countBefore = calculateHandCount(hand, currentRank);
  const remainingHand = [...hand];
  playCards.forEach((card) => {
    const idx = remainingHand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      remainingHand.splice(idx, 1);
    }
  });
  const countAfter = calculateHandCount(remainingHand, currentRank);
  const handCountReduction = (countBefore - countAfter) * 15;

  // 2. 大牌消耗（浪费）扣分
  const controlBefore = calculateControlScore(hand, currentRank);
  const controlAfter = calculateControlScore(remainingHand, currentRank);
  const controlWaste = (controlBefore - controlAfter) * 1.5;

  // 3. 破坏手牌连贯性扣分（拆炸弹）
  let comboIntegrity = 0;
  const cardCountsBefore: Record<string, number> = {};
  hand.forEach((c) => {
    if (c.rank !== 'red_joker' && c.rank !== 'black_joker' && !isWildCard(c, currentRank)) {
      cardCountsBefore[c.rank] = (cardCountsBefore[c.rank] || 0) + 1;
    }
  });

  const cardCountsAfter = { ...cardCountsBefore };
  playCards.forEach((c) => {
    if (cardCountsAfter[c.rank] !== undefined) {
      cardCountsAfter[c.rank]--;
    }
  });

  Object.keys(cardCountsBefore).forEach((rank) => {
    const countBeforeRank = cardCountsBefore[rank];
    const countAfterRank = cardCountsAfter[rank];

    if (countBeforeRank >= 4 && countAfterRank > 0 && countAfterRank < 4) {
      // 拆炸弹：扣 100 分
      comboIntegrity += 100;
    } else if (countBeforeRank === 3 && countAfterRank > 0 && countAfterRank < 3) {
      // 拆三张：扣 70 分
      comboIntegrity += 70;
    } else if (countBeforeRank === 2 && countAfterRank === 1) {
      // 拆对子：扣 40 分
      comboIntegrity += 40;
    }
  });

  return {
    handCountReduction,
    controlWaste,
    comboIntegrity
  };
}
