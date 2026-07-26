/**
 * ai_search.ts - 掼蛋 AI 决策出牌候选算法库 (TypeScript版)
 */

import { Card, PlayerStateView } from '../types';
import { getCardWeight, sortCards, analyzeHand, HAND_TYPES } from '../rules';
import { extractCardGroups } from './ai_grouper';

/**
 * 策略 A：经典启发式规则出牌 (Heuristic Strategy)
 */
export function heuristicChoosePlay(view: PlayerStateView): Card[] | null {
  const { hand, lastPlay, currentRank, myIndex, currentWinnerIndex } = view;

  // 1. 如果队友是当前赢家：
  // - 若队友打出的是炸弹 (HAND_TYPES.BOMB)，无条件过牌让风，绝不轰炸队友
  // - 若队友打出的是普通牌型且点数较大 (power >= 10)，选择过牌接风
  if (lastPlay && lastPlay.type !== HAND_TYPES.INVALID) {
    const isTeammateWinner = (myIndex + 2) % 4 === currentWinnerIndex;
    if (isTeammateWinner) {
      if (lastPlay.type === HAND_TYPES.BOMB || lastPlay.power >= 10) {
        return null;
      }
    }
  }

  const sortedHand = sortCards(hand, currentRank);

  // 2. 首发牌
  if (!lastPlay || lastPlay.type === HAND_TYPES.INVALID) {
    return heuristicLeadPlay(sortedHand, currentRank);
  }

  // 3. 跟牌
  return heuristicFollowPlay(sortedHand, lastPlay, currentRank);
}

/**
 * 策略 B：贪心出牌策略 (Greedy Strategy)
 * 特点：不考虑队友是否赢牌（不接风），首发时只喜欢出最小单牌或对子，跟牌时只要能大过就必须出牌。
 */
export function greedyChoosePlay(view: PlayerStateView): Card[] | null {
  const { hand, lastPlay, currentRank } = view;
  const sortedHand = sortCards(hand, currentRank);

  // 1. 首发牌
  if (!lastPlay || lastPlay.type === HAND_TYPES.INVALID) {
    const analysis = extractCardGroups(sortedHand, currentRank);
    // 贪心算法首发优先出最小的单张
    if (analysis.singles.length > 0) {
      return [analysis.singles[analysis.singles.length - 1]];
    }
    // 其次出最小对子
    if (analysis.pairs.length > 0) {
      return analysis.pairs[analysis.pairs.length - 1];
    }
    return [sortedHand[sortedHand.length - 1]];
  }

  // 2. 跟牌 (跟普通启发式规则类似，但绝对不会因为队友赢而过牌)
  return heuristicFollowPlay(sortedHand, lastPlay, currentRank);
}

/**
 * 启发式首发逻辑
 */
function heuristicLeadPlay(hand: Card[], currentRank: string): Card[] {
  const analysis = extractCardGroups(hand, currentRank);

  // 优先出连牌
  if (analysis.straights.length > 0) return analysis.straights[0];
  if (analysis.steelPlates.length > 0) return analysis.steelPlates[0];
  if (analysis.doubleStraights.length > 0) return analysis.doubleStraights[0];

  // 三带二 / 三张
  if (analysis.threeTwos.length > 0) return analysis.threeTwos[0];
  if (analysis.triples.length > 0) return analysis.triples[0];

  // 对子 (最小的)
  if (analysis.pairs.length > 0) {
    return analysis.pairs[analysis.pairs.length - 1];
  }

  // 单张 (最小的)
  if (analysis.singles.length > 0) {
    return [analysis.singles[analysis.singles.length - 1]];
  }

  // 炸弹
  if (analysis.bombs.length > 0) {
    return analysis.bombs[analysis.bombs.length - 1];
  }

  return [hand[hand.length - 1]];
}

/**
 * 启发式跟牌逻辑
 */
export function heuristicFollowPlay(
  hand: Card[],
  lastPlay: { type: string; power: number; cardCount: number },
  currentRank: string
): Card[] | null {
  const targetType = lastPlay.type;
  const targetPower = lastPlay.power;

  const groups = extractCardGroups(hand, currentRank);
  let candidates: Card[][] = [];

  if (targetType === HAND_TYPES.SINGLE) {
    // 优先从原生单张中选择跟牌，保护对子与连贯性
    candidates = groups.singles
      .map((c) => [c])
      .filter((play) => getCardWeight(play[0].rank, currentRank) > targetPower);

    // 当没有可用原生单张时，允许满足以下条件之一拆对子出单牌提案（交由 Auditor 评分）
    // 1. 残局/中后期 (手牌 <= 12)
    // 2. 所出牌为大牌 (权值 >= 12)，争夺牌权
    // 3. 被拆对子本身是小对子 (权值 <= 8)
    if (candidates.length === 0) {
      candidates = groups.pairs
        .map((p) => [p[0]])
        .filter((play) => {
          const w = getCardWeight(play[0].rank, currentRank);
          return w > targetPower && (hand.length <= 12 || w >= 12 || w <= 8);
        });
    }
  } else if (targetType === HAND_TYPES.PAIR) {
    candidates = groups.pairs.filter((p) => {
      const res = analyzeHand(p, currentRank)[0];
      return res.type === HAND_TYPES.PAIR && res.power > targetPower;
    });
    // 当无纯对子时，允许在残局 (手牌 <= 10) 或出大牌 (权值 >= 12) 时拆三张当作对子打出
    if (candidates.length === 0) {
      candidates = groups.triples
        .map((t) => [t[0], t[1]])
        .filter((p) => {
          const w = getCardWeight(p[0].rank, currentRank);
          return w > targetPower && (hand.length <= 10 || w >= 12);
        });
    }
  } else if (targetType === HAND_TYPES.THREE) {
    candidates = groups.triples.filter((t) => getCardWeight(t[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.THREE_TWO) {
    candidates = groups.threeTwos.filter((tt) => {
      const res = analyzeHand(tt, currentRank)[0];
      return res.type === HAND_TYPES.THREE_TWO && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.STRAIGHT) {
    candidates = groups.straights.filter((st) => {
      const res = analyzeHand(st, currentRank)[0];
      return res.type === HAND_TYPES.STRAIGHT && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.DOUBLE_STRAIGHT) {
    candidates = groups.doubleStraights.filter((ds) => {
      const res = analyzeHand(ds, currentRank)[0];
      return res.type === HAND_TYPES.DOUBLE_STRAIGHT && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.STEEL_PLATE) {
    candidates = groups.steelPlates.filter((sp) => {
      const res = analyzeHand(sp, currentRank)[0];
      return res.type === HAND_TYPES.STEEL_PLATE && res.power > targetPower;
    });
  }

  // 找能压的最小牌
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const powA = analyzeHand(a, currentRank)[0].power;
      const powB = analyzeHand(b, currentRank)[0].power;
      return powA - powB;
    });
    return candidates[0];
  }

  // 考虑出炸弹
  if (groups.bombs.length > 0) {
    const validBombs = groups.bombs.filter((b) => {
      const res = analyzeHand(b, currentRank)[0];
      return res.type === HAND_TYPES.BOMB && (targetType !== HAND_TYPES.BOMB || res.power > targetPower);
    });

    if (validBombs.length > 0) {
      // 紧急情况：手牌小于 8 张，或对方牌很大，出最小炸弹拦截
      const isUrgent = hand.length < 8 || targetPower >= 12 || targetType === HAND_TYPES.BOMB;
      if (isUrgent) {
        validBombs.sort((a, b) => {
          const powA = analyzeHand(a, currentRank)[0].power;
          const powB = analyzeHand(b, currentRank)[0].power;
          return powA - powB;
        });
        return validBombs[0];
      }
    }
  }

  return null;
}
