/**
 * ai.ts - 掼蛋 AI 对战算法 (TypeScript版)
 */

import { Card, PlayerStateView } from './types';
import { getCardWeight, sortCards, analyzeHand, HAND_TYPES } from './rules';

export interface CardGroups {
  bombs: Card[][];
  straights: Card[][];
  steelPlates: Card[][];
  doubleStraights: Card[][];
  threeTwos: Card[][];
  triples: Card[][];
  pairs: Card[][];
  singles: Card[];
}

/**
 * AI 决策主入口 (信息隔离架构)
 */
export function aiChoosePlay(view: PlayerStateView): Card[] | null {
  const { hand, lastPlay, currentRank, myIndex, currentWinnerIndex } = view;

  // 1. 队友是当前赢家，且上家出的不是非常小的牌，选择过牌接风
  if (lastPlay && lastPlay.type !== HAND_TYPES.INVALID) {
    const isTeammateWinner = (myIndex + 2) % 4 === currentWinnerIndex;
    if (isTeammateWinner && lastPlay.power >= 10) {
      return null;
    }
  }

  // 排序手牌
  const sortedHand = sortCards(hand, currentRank);

  // 2. 首发牌
  if (!lastPlay || lastPlay.type === HAND_TYPES.INVALID) {
    return aiLeadPlay(sortedHand, currentRank);
  }

  // 3. 跟牌
  return aiFollowPlay(sortedHand, lastPlay, currentRank);
}

/**
 * AI 首发牌逻辑
 */
function aiLeadPlay(hand: Card[], currentRank: string): Card[] {
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
 * AI 跟牌逻辑
 */
export function aiFollowPlay(hand: Card[], lastPlay: { type: string; power: number; cardCount: number }, currentRank: string): Card[] | null {
  const targetType = lastPlay.type;
  const targetPower = lastPlay.power;

  const groups = extractCardGroups(hand, currentRank);
  let candidates: Card[][] = [];

  if (targetType === HAND_TYPES.SINGLE) {
    candidates = groups.singles.map(c => [c])
      .concat(groups.pairs.map(p => [p[0]])) // 可拆对子
      .filter(play => getCardWeight(play[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.PAIR) {
    candidates = groups.pairs.filter(p => getCardWeight(p[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.THREE) {
    candidates = groups.triples.filter(t => getCardWeight(t[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.THREE_TWO) {
    candidates = groups.threeTwos.filter(tt => {
      const res = analyzeHand(tt, currentRank)[0];
      return res.type === HAND_TYPES.THREE_TWO && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.STRAIGHT) {
    candidates = groups.straights.filter(st => {
      const res = analyzeHand(st, currentRank)[0];
      return res.type === HAND_TYPES.STRAIGHT && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.DOUBLE_STRAIGHT) {
    candidates = groups.doubleStraights.filter(ds => {
      const res = analyzeHand(ds, currentRank)[0];
      return res.type === HAND_TYPES.DOUBLE_STRAIGHT && res.power > targetPower;
    });
  } else if (targetType === HAND_TYPES.STEEL_PLATE) {
    candidates = groups.steelPlates.filter(sp => {
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
    const validBombs = groups.bombs.filter(b => {
      const res = analyzeHand(b, currentRank)[0];
      return res.type === HAND_TYPES.BOMB && (targetType !== HAND_TYPES.BOMB || res.power > targetPower);
    });

    if (validBombs.length > 0) {
      // 警急情况：手牌小于 8 张，或对方牌很大，出最小炸弹拦截
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

/**
 * 手牌提取器（防拆炸弹）
 */
export function extractCardGroups(hand: Card[], currentRank: string): CardGroups {
  const result: CardGroups = {
    bombs: [],
    straights: [],
    steelPlates: [],
    doubleStraights: [],
    threeTwos: [],
    triples: [],
    pairs: [],
    singles: []
  };

  const counts: Record<string, number> = {};
  hand.forEach(c => {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  });

  // 1. 提取天王炸
  const jokers = hand.filter(c => c.rank === 'red_joker' || c.rank === 'black_joker');
  if (jokers.length === 4) {
    result.bombs.push(jokers);
    jokers.forEach(j => {
      counts[j.rank] = 0;
    });
  }

  // 2. 提取常规炸弹
  Object.keys(counts).forEach(rank => {
    if (counts[rank] >= 4) {
      const bombCards = hand.filter(c => c.rank === rank);
      result.bombs.push(bombCards);
      counts[rank] = 0;
    }
  });

  const normalHand = hand.filter(c => counts[c.rank] > 0);

  const tempTriples: Card[][] = [];
  const tempPairs: Card[][] = [];
  const tempSingles: Card[] = [];

  const tempCounts: Record<string, number> = {};
  normalHand.forEach(c => {
    tempCounts[c.rank] = (tempCounts[c.rank] || 0) + 1;
  });

  Object.keys(tempCounts).forEach(rank => {
    const cardsOfRank = normalHand.filter(c => c.rank === rank);
    if (tempCounts[rank] === 3) {
      tempTriples.push(cardsOfRank);
    } else if (tempCounts[rank] === 2) {
      tempPairs.push(cardsOfRank);
    } else if (tempCounts[rank] === 1) {
      tempSingles.push(cardsOfRank[0]);
    }
  });

  // 3. 三带二
  const usedPairs = new Set<number>();
  tempTriples.forEach(triple => {
    const freePairIdx = tempPairs.findIndex((_, pIdx) => !usedPairs.has(pIdx));
    if (freePairIdx !== -1) {
      result.threeTwos.push([...triple, ...tempPairs[freePairIdx]]);
      usedPairs.add(freePairIdx);
    } else {
      result.triples.push(triple);
    }
  });

  tempPairs.forEach((p, pIdx) => {
    if (!usedPairs.has(pIdx)) {
      result.pairs.push(p);
    }
  });

  result.singles = tempSingles;

  // 4. 提取顺子
  const availableForSeq = normalHand.filter(c => c.rank !== 'red_joker' && c.rank !== 'black_joker' && c.rank !== currentRank);
  const uniqueRanks = [...new Set(availableForSeq.map(c => c.rank))];
  const sortedUniqueRanks = uniqueRanks.sort((a, b) => {
    const wA = getCardWeight(a, currentRank);
    const wB = getCardWeight(b, currentRank);
    return wA - wB;
  });

  for (let i = 0; i <= sortedUniqueRanks.length - 5; i++) {
    const subRanks = sortedUniqueRanks.slice(i, i + 5);
    const weights = subRanks.map(r => getCardWeight(r, currentRank));
    if (weights[4] - weights[0] === 4) {
      const straightCards = subRanks.map(r => availableForSeq.find(c => c.rank === r) as Card);
      result.straights.push(straightCards);
    }
  }

  // 排序
  result.singles.sort((a, b) => getCardWeight(b.rank, currentRank) - getCardWeight(a.rank, currentRank));
  result.pairs.sort((a, b) => getCardWeight(b[0].rank, currentRank) - getCardWeight(a[0].rank, currentRank));
  result.triples.sort((a, b) => getCardWeight(b[0].rank, currentRank) - getCardWeight(a[0].rank, currentRank));
  result.bombs.sort((a, b) => {
    const powA = analyzeHand(a, currentRank)[0].power;
    const powB = analyzeHand(b, currentRank)[0].power;
    return powB - powA;
  });

  return result;
}
