/**
 * ai.ts - 掼蛋 AI 对战算法 (TypeScript版)
 */

import { Card, PlayerStateView, Suit } from './types';
import { getCardWeight, sortCards, analyzeHand, HAND_TYPES, isWildCard } from './rules';

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
export function aiFollowPlay(
  hand: Card[],
  lastPlay: { type: string; power: number; cardCount: number },
  currentRank: string
): Card[] | null {
  const targetType = lastPlay.type;
  const targetPower = lastPlay.power;

  const groups = extractCardGroups(hand, currentRank);
  let candidates: Card[][] = [];

  if (targetType === HAND_TYPES.SINGLE) {
    candidates = groups.singles
      .map((c) => [c])
      .concat(groups.pairs.map((p) => [p[0]])) // 可拆对子
      .filter((play) => getCardWeight(play[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.PAIR) {
    candidates = groups.pairs.filter((p) => getCardWeight(p[0].rank, currentRank) > targetPower);
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
 * 手牌提取器（防拆炸弹，完美支持逢人配/级牌替代规则）
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

  // 1. 分离逢人配、主牌、王牌与常规牌
  const wilds = hand.filter((c) => isWildCard(c, currentRank));
  const jokers = hand.filter((c) => c.rank === 'red_joker' || c.rank === 'black_joker');

  // cleanHand 用于常规配对（单张/对子/三张/炸弹），剔除王牌与逢人配
  const cleanHand = hand.filter(
    (c) => c.rank !== 'red_joker' && c.rank !== 'black_joker' && !isWildCard(c, currentRank)
  );

  const counts: Record<string, number> = {};
  cleanHand.forEach((c) => {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  });

  // 2. 提取天王炸 (4个王)
  if (jokers.length === 4) {
    result.bombs.push([...jokers]);
  }

  // 3. 提取天然炸弹 (4张及以上同数值)
  Object.keys(counts).forEach((rank) => {
    if (counts[rank] >= 4) {
      const bombCards = cleanHand.filter((c) => c.rank === rank);
      result.bombs.push(bombCards);
      counts[rank] = 0; // 标记已被炸弹消耗
    }
  });

  // 4. 提取逢人配虚拟炸弹 (天然牌 + 逢人配，凑齐4-10张)
  const allRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  allRanks.forEach((rank) => {
    const cards = cleanHand.filter((c) => c.rank === rank);
    const n = cards.length;
    // 如果该点数已被整组天然炸弹消费（如原本就有4个），为防重复提取，不在此处二次组合
    if (counts[rank] === 0 && n >= 4) return;

    for (let w = 1; w <= wilds.length; w++) {
      if (n + w >= 4 && n + w <= 10) {
        result.bombs.push([...cards, ...wilds.slice(0, w)]);
      }
    }
  });

  // 5. 提取同花顺 (5张同花色且连续，支持逢人配填补缺省牌)
  const STRAIGHT_RANGES = [
    ['A', '2', '3', '4', '5'],
    ['2', '3', '4', '5', '6'],
    ['3', '4', '5', '6', '7'],
    ['4', '5', '6', '7', '8'],
    ['5', '6', '7', '8', '9'],
    ['6', '7', '8', '9', '10'],
    ['7', '8', '9', '10', 'J'],
    ['8', '9', '10', 'J', 'Q'],
    ['9', '10', 'J', 'Q', 'K'],
    ['10', 'J', 'Q', 'K', 'A']
  ];
  const suits: Suit[] = ['H', 'D', 'C', 'S'];

  // 在计算顺子、双顺、钢板等连续牌型时，主牌（currentRank）不能以普通数值形式参与，必须排除
  const seqCleanHand = cleanHand.filter((c) => c.rank !== currentRank);

  STRAIGHT_RANGES.forEach((range) => {
    suits.forEach((suit) => {
      let missingCount = 0;
      const matchedCards: Card[] = [];
      range.forEach((rank) => {
        const card = seqCleanHand.find((c) => c.suit === suit && c.rank === rank);
        if (card) {
          matchedCards.push(card);
        } else {
          missingCount++;
        }
      });
      if (missingCount <= wilds.length) {
        result.bombs.push([...matchedCards, ...wilds.slice(0, missingCount)]);
      }
    });
  });

  // 6. 提取普通单顺
  STRAIGHT_RANGES.forEach((range) => {
    let missingCount = 0;
    const matchedCards: Card[] = [];
    range.forEach((rank) => {
      const card = seqCleanHand.find((c) => c.rank === rank);
      if (card) {
        matchedCards.push(card);
      } else {
        missingCount++;
      }
    });
    if (missingCount <= wilds.length) {
      result.straights.push([...matchedCards, ...wilds.slice(0, missingCount)]);
    }
  });

  // 7. 提取双顺 (3对连续)
  const DS_RANGES = [
    ['A', '2', '3'],
    ['2', '3', '4'],
    ['3', '4', '5'],
    ['4', '5', '6'],
    ['5', '6', '7'],
    ['6', '7', '8'],
    ['7', '8', '9'],
    ['8', '9', '10'],
    ['9', '10', 'J'],
    ['10', 'J', 'Q'],
    ['J', 'Q', 'K'],
    ['Q', 'K', 'A']
  ];
  DS_RANGES.forEach((range) => {
    let missingCount = 0;
    const matchedCards: Card[] = [];
    range.forEach((rank) => {
      const cards = seqCleanHand.filter((c) => c.rank === rank);
      if (cards.length >= 2) {
        matchedCards.push(cards[0], cards[1]);
      } else if (cards.length === 1) {
        matchedCards.push(cards[0]);
        missingCount += 1;
      } else {
        missingCount += 2;
      }
    });
    if (missingCount <= wilds.length) {
      result.doubleStraights.push([...matchedCards, ...wilds.slice(0, missingCount)]);
    }
  });

  // 8. 提取钢板 (2连续三张)
  const SP_RANGES = [
    ['A', '2'],
    ['2', '3'],
    ['3', '4'],
    ['4', '5'],
    ['5', '6'],
    ['6', '7'],
    ['7', '8'],
    ['8', '9'],
    ['9', '10'],
    ['10', 'J'],
    ['J', 'Q'],
    ['Q', 'K'],
    ['K', 'A']
  ];
  SP_RANGES.forEach((range) => {
    let missingCount = 0;
    const matchedCards: Card[] = [];
    range.forEach((rank) => {
      const cards = seqCleanHand.filter((c) => c.rank === rank);
      if (cards.length >= 3) {
        matchedCards.push(cards[0], cards[1], cards[2]);
      } else if (cards.length === 2) {
        matchedCards.push(cards[0], cards[1]);
        missingCount += 1;
      } else if (cards.length === 1) {
        matchedCards.push(cards[0]);
        missingCount += 2;
      } else {
        missingCount += 3;
      }
    });
    if (missingCount <= wilds.length) {
      result.steelPlates.push([...matchedCards, ...wilds.slice(0, missingCount)]);
    }
  });

  // 9. 提取常规与虚拟三张、对子、单张
  const remainingHand = cleanHand.filter((c) => counts[c.rank] > 0);
  const tempCounts: Record<string, number> = {};
  remainingHand.forEach((c) => {
    tempCounts[c.rank] = (tempCounts[c.rank] || 0) + 1;
  });

  const naturalTriples: Card[][] = [];
  const naturalPairs: Card[][] = [];
  const naturalSingles: Card[] = [];

  Object.keys(tempCounts).forEach((rank) => {
    const cards = remainingHand.filter((c) => c.rank === rank);
    if (tempCounts[rank] === 3) {
      naturalTriples.push(cards);
    } else if (tempCounts[rank] === 2) {
      naturalPairs.push(cards);
    } else if (tempCounts[rank] === 1) {
      naturalSingles.push(cards[0]);
    }
  });

  const allTriples = [...naturalTriples];
  const allPairs = [...naturalPairs];
  const allSingles = [...naturalSingles];

  if (wilds.length >= 1) {
    // 单张 + 1张逢人配 -> 对子
    naturalSingles.forEach((s) => {
      allPairs.push([s, wilds[0]]);
    });
    // 对子 + 1张逢人配 -> 三张
    naturalPairs.forEach((p) => {
      allTriples.push([...p, wilds[0]]);
    });
  }
  if (wilds.length >= 2) {
    // 单张 + 2张逢人配 -> 三张
    naturalSingles.forEach((s) => {
      allTriples.push([s, wilds[0], wilds[1]]);
    });
  }

  // 王牌添加至单张列表
  jokers.forEach((j) => {
    allSingles.push(j);
  });

  // 逢人配自身可以作为单张，两个逢人配可以组成对子
  wilds.forEach((w) => {
    allSingles.push(w);
  });
  if (wilds.length >= 2) {
    allPairs.push([wilds[0], wilds[1]]);
  }

  // 10. 三张与对子组合为 三带二 (ThreeTwo)
  const usedPairs = new Set<number>();
  allTriples.forEach((triple) => {
    // 寻找无重合卡牌的对子进行带牌（防逢人配冲突）
    const freePairIdx = allPairs.findIndex((pair, pIdx) => {
      if (usedPairs.has(pIdx)) return false;
      return !pair.some((pc) => triple.some((tc) => tc.suit === pc.suit && tc.rank === pc.rank));
    });
    if (freePairIdx !== -1) {
      result.threeTwos.push([...triple, ...allPairs[freePairIdx]]);
      usedPairs.add(freePairIdx);
    } else {
      result.triples.push(triple);
    }
  });

  allPairs.forEach((p, pIdx) => {
    if (!usedPairs.has(pIdx)) {
      result.pairs.push(p);
    }
  });

  result.singles = allSingles;

  // 11. 排序
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
