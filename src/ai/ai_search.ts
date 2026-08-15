/**
 * ai_search.ts - 掼蛋 AI 决策出牌候选算法库 (TypeScript版)
 */

import { Card, PlayerStateView } from '../types';
import { getCardWeight, sortCards, analyzeHand, canPlay, HAND_TYPES } from '../rules';
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

// 全局共享的 TFJS 决策 Agent 实例
let sharedTFJSAgent: any = null;

export function getSharedTFJSAgent(): any {
  return sharedTFJSAgent;
}

export function setSharedTFJSAgent(agent: any) {
  sharedTFJSAgent = agent;
}

/**
 * 策略 C：TensorFlow.js 深度学习 Q 值决策策略 (TFJS Strategy)
 * 两阶段范式：首先由规则提取器生成所有合法候选出牌动作，再由神经网络输出 Q 估值选出全局最优动作
 */
export function tfjsChoosePlay(view: PlayerStateView, agent?: any): Card[] | null {
  const activeAgent = agent || sharedTFJSAgent;
  const { hand, lastPlay, currentRank, myIndex, currentWinnerIndex } = view;

  // 1. 如果队友是当前赢家且打出大牌或炸弹，优先考虑配合让风
  if (lastPlay && lastPlay.type !== HAND_TYPES.INVALID) {
    const isTeammateWinner = (myIndex + 2) % 4 === currentWinnerIndex;
    if (isTeammateWinner && (lastPlay.type === HAND_TYPES.BOMB || lastPlay.power >= 11)) {
      return null; // 配合让风
    }
  }

  const sortedHand = sortCards(hand, currentRank);
  const groups = extractCardGroups(sortedHand, currentRank);

  // 2. 收集所有合法的候选出牌动作 (Candidate Actions)
  const candidateActions: (Card[] | null)[] = [];

  if (!lastPlay || lastPlay.type === HAND_TYPES.INVALID) {
    // 首发出牌候选集
    if (groups.steelPlates.length > 0) candidateActions.push(...groups.steelPlates);
    if (groups.doubleStraights.length > 0) candidateActions.push(...groups.doubleStraights);
    if (groups.straights.length > 0) candidateActions.push(...groups.straights);
    if (groups.threeTwos.length > 0) candidateActions.push(...groups.threeTwos);
    if (groups.triples.length > 0) candidateActions.push(...groups.triples);
    if (groups.pairs.length > 0) candidateActions.push(...groups.pairs);
    if (groups.singles.length > 0) candidateActions.push(...groups.singles.map((s) => [s]));
    if (groups.bombs.length > 0) candidateActions.push(...groups.bombs);

    // 默认兜底出最小单张
    if (candidateActions.length === 0 && sortedHand.length > 0) {
      candidateActions.push([sortedHand[sortedHand.length - 1]]);
    }
  } else {
    // 跟牌候选集：收集所有能压制上家的同型牌与炸弹
    const targetType = lastPlay.type;
    const targetPower = lastPlay.power;

    if (targetType === HAND_TYPES.SINGLE) {
      const valids = sortedHand.filter((c) => getCardWeight(c.rank, currentRank) > targetPower).map((c) => [c]);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.PAIR) {
      const valids = groups.pairs.filter((p) => analyzeHand(p, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.THREE) {
      const valids = groups.triples.filter((t) => analyzeHand(t, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.THREE_TWO) {
      const valids = groups.threeTwos.filter((tt) => analyzeHand(tt, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.STRAIGHT) {
      const valids = groups.straights.filter((st) => analyzeHand(st, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.DOUBLE_STRAIGHT) {
      const valids = groups.doubleStraights.filter((ds) => analyzeHand(ds, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    } else if (targetType === HAND_TYPES.STEEL_PLATE) {
      const valids = groups.steelPlates.filter((sp) => analyzeHand(sp, currentRank)[0].power > targetPower);
      candidateActions.push(...valids);
    }

    // 收集能压制的炸弹
    if (groups.bombs.length > 0) {
      const validBombs = groups.bombs.filter((b) => {
        const res = analyzeHand(b, currentRank)[0];
        return res.type === HAND_TYPES.BOMB && (targetType !== HAND_TYPES.BOMB || res.power > targetPower);
      });
      candidateActions.push(...validBombs);
    }

    // 跟牌允许 PASS
    candidateActions.push(null);
  }

  // 严格过滤：首发时严禁包含 null，跟牌时确保动作合法
  const sanitizedCandidates = candidateActions.filter((action) => {
    if (action === null) {
      return lastPlay && lastPlay.type !== HAND_TYPES.INVALID;
    }
    return (
      canPlay(
        action,
        lastPlay ? { type: lastPlay.type, power: lastPlay.power, cardCount: lastPlay.cardCount } : null,
        currentRank
      ) !== null
    );
  });

  if (sanitizedCandidates.length === 0) {
    return !lastPlay || lastPlay.type === HAND_TYPES.INVALID ? [sortedHand[sortedHand.length - 1]] : null;
  }

  // 3. 若有活跃的 TFJS Agent，使用神经网络进行 Q 估值决策；否则降级为启发式
  if (activeAgent && typeof activeAgent.evaluateActions === 'function') {
    const evalRes = activeAgent.evaluateActions(view, sanitizedCandidates);
    return evalRes.bestAction;
  }

  // 无 Agent 实例时平滑回退启发式
  return heuristicChoosePlay(view);
}
