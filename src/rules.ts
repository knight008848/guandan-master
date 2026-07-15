/**
 * rules.ts - 掼蛋核心规则与判定逻辑 (TypeScript版)
 */

import { Card, Combo, HandType, Suit } from './types';

// 花色常量
export const SUITS: Record<string, Suit> = {
  HEARTS: 'H', // 红桃
  DIAMONDS: 'D', // 方块
  CLUBS: 'C', // 梅花
  SPADES: 'S', // 黑桃
  JOKER: 'J' // 王牌
};

// 牌面大小顺序
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 牌型常量
export const HAND_TYPES: Record<string, HandType> = {
  INVALID: 'INVALID',
  SINGLE: 'SINGLE',
  PAIR: 'PAIR',
  THREE: 'THREE',
  THREE_TWO: 'THREE_TWO',
  STRAIGHT: 'STRAIGHT',
  DOUBLE_STRAIGHT: 'DOUBLE_STRAIGHT',
  STEEL_PLATE: 'STEEL_PLATE',
  BOMB: 'BOMB'
};

/**
 * 获取单张牌的权重值
 */
export function getCardWeight(rank: string, currentRank: string): number {
  if (rank === 'red_joker') return 17;
  if (rank === 'black_joker') return 16;
  if (rank === currentRank) return 15; // 主牌级别权重为 15

  const baseWeights: Record<string, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  };
  return baseWeights[rank] || 0;
}

/**
 * 判断是否为逢人配（红心主牌）
 */
export function isWildCard(card: Card, currentRank: string): boolean {
  return card.suit === SUITS.HEARTS && card.rank === currentRank;
}

/**
 * 排序手牌
 */
export function sortCards(cards: Card[], currentRank: string): Card[] {
  return [...cards].sort((a, b) => {
    const aWild = isWildCard(a, currentRank);
    const bWild = isWildCard(b, currentRank);
    if (aWild && !bWild) return -1;
    if (!aWild && bWild) return 1;

    const wA = getCardWeight(a.rank, currentRank);
    const wB = getCardWeight(b.rank, currentRank);
    if (wA !== wB) return wB - wA;

    const suitOrder: Record<Suit, number> = { H: 4, S: 3, C: 2, D: 1, J: 0 };
    return suitOrder[b.suit] - suitOrder[a.suit];
  });
}

/**
 * 判定不含未指定逢人配（即已假定替代）的正常手牌
 */
export function evaluateNormalHand(cards: Card[], currentRank: string): Combo {
  const len = cards.length;
  if (len === 0) return { type: HAND_TYPES.INVALID, power: 0, cardCount: 0 };

  // 统计各 rank 的数量
  const counts: Record<string, number> = {};
  cards.forEach((c) => {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]); // 按出现次数降序

  const maxCount = entries[0][1];
  const distinctCount = entries.length;

  // 1. 单张
  if (len === 1) {
    return {
      type: HAND_TYPES.SINGLE,
      power: getCardWeight(cards[0].rank, currentRank),
      cardCount: 1
    };
  }

  // 2. 对子
  if (len === 2 && maxCount === 2) {
    return {
      type: HAND_TYPES.PAIR,
      power: getCardWeight(entries[0][0], currentRank),
      cardCount: 2
    };
  }

  // 3. 三张
  if (len === 3 && maxCount === 3) {
    return {
      type: HAND_TYPES.THREE,
      power: getCardWeight(entries[0][0], currentRank),
      cardCount: 3
    };
  }

  // 4. 三带两
  if (len === 5 && maxCount === 3 && entries[1]?.[1] === 2) {
    return {
      type: HAND_TYPES.THREE_TWO,
      power: getCardWeight(entries[0][0], currentRank),
      cardCount: 5
    };
  }

  // 5. 天王炸 (4个王)
  if (len === 4) {
    const jokerCount = cards.filter((c) => c.rank === 'red_joker' || c.rank === 'black_joker').length;
    if (jokerCount === 4) {
      return {
        type: HAND_TYPES.BOMB,
        power: 1000, // 天王炸最大
        name: '天王炸',
        cardCount: 4
      };
    }
  }

  // 6. 炸弹 (4张及以上同数值)
  if (maxCount === len && len >= 4) {
    const rankWeight = getCardWeight(entries[0][0], currentRank);
    let power = 0;
    if (len === 4) power = 100 + rankWeight;
    else if (len === 5) power = 200 + rankWeight;
    else power = (len - 2) * 100 + rankWeight; // 6张及以上：6张为400，7张为500，依此类推

    return {
      type: HAND_TYPES.BOMB,
      power: power,
      name: `${len}张炸弹`,
      cardCount: len
    };
  }

  // 7. 同花顺 (5张同花色且连续的牌)
  if (len === 5 && isSameSuit(cards)) {
    const straightVal = getStraightMaxWeight(cards, currentRank);
    if (straightVal > 0) {
      return {
        type: HAND_TYPES.BOMB,
        power: 300 + straightVal, // 同花顺威力介于 5张和6张炸弹之间
        name: '同花顺',
        cardCount: 5
      };
    }
  }

  // 8. 单顺 (5张连续牌，不限花色)
  if (len === 5) {
    const straightVal = getStraightMaxWeight(cards, currentRank);
    if (straightVal > 0) {
      return {
        type: HAND_TYPES.STRAIGHT,
        power: straightVal,
        cardCount: 5
      };
    }
  }

  // 9. 双顺/板凳 (3对连续)
  if (len === 6 && distinctCount === 3 && entries.every((e) => e[1] === 2)) {
    const seqVal = getSequenceMaxWeight(
      entries.map((e) => e[0]),
      currentRank,
      3
    );
    if (seqVal > 0) {
      return {
        type: HAND_TYPES.DOUBLE_STRAIGHT,
        power: seqVal,
        cardCount: 6
      };
    }
  }

  // 10. 钢板/三顺 (2组连续三张)
  if (len === 6 && distinctCount === 2 && entries.every((e) => e[1] === 3)) {
    const seqVal = getSequenceMaxWeight(
      entries.map((e) => e[0]),
      currentRank,
      2
    );
    if (seqVal > 0) {
      return {
        type: HAND_TYPES.STEEL_PLATE,
        power: seqVal,
        cardCount: 6
      };
    }
  }

  return { type: HAND_TYPES.INVALID, power: 0, cardCount: 0 };
}

/**
 * 分析手牌包含逢人配的所有可能组合
 */
export function analyzeHand(cards: Card[], currentRank: string): Combo[] {
  if (!cards || cards.length === 0) return [{ type: HAND_TYPES.INVALID, power: 0, cardCount: 0 }];

  const wildCards = cards.filter((c) => isWildCard(c, currentRank));
  const normalCards = cards.filter((c) => !isWildCard(c, currentRank));

  if (wildCards.length === 0) {
    return [evaluateNormalHand(cards, currentRank)];
  }

  const possibleResults: Combo[] = [];
  const wildCount = wildCards.length;

  const candidateRanks = RANKS;
  const candidateSuits: Suit[] = ['H', 'D', 'C', 'S'];

  if (wildCount === 1) {
    for (const r of candidateRanks) {
      for (const s of candidateSuits) {
        const substitutedCard: Card = { suit: s, rank: r, isSubstituted: true, original: wildCards[0] };
        const testHand = [...normalCards, substitutedCard];
        const evalRes = evaluateNormalHand(testHand, currentRank);
        if (evalRes.type !== HAND_TYPES.INVALID) {
          evalRes.wildRepresent = [substitutedCard];
          possibleResults.push(evalRes);
        }
      }
    }
  } else if (wildCount === 2) {
    for (let i = 0; i < candidateRanks.length; i++) {
      for (let j = 0; j < candidateRanks.length; j++) {
        for (const s1 of candidateSuits) {
          for (const s2 of candidateSuits) {
            const sub1: Card = { suit: s1, rank: candidateRanks[i], isSubstituted: true, original: wildCards[0] };
            const sub2: Card = { suit: s2, rank: candidateRanks[j], isSubstituted: true, original: wildCards[1] };
            const testHand = [...normalCards, sub1, sub2];
            const evalRes = evaluateNormalHand(testHand, currentRank);
            if (evalRes.type !== HAND_TYPES.INVALID) {
              evalRes.wildRepresent = [sub1, sub2];
              possibleResults.push(evalRes);
            }
          }
        }
      }
    }
  }

  const validResults = possibleResults.filter((r) => r.type !== HAND_TYPES.INVALID);
  if (validResults.length === 0) {
    return [{ type: HAND_TYPES.INVALID, power: 0, cardCount: 0 }];
  }

  // 排序：炸弹优先，其次是普通牌型中Power较大的
  validResults.sort((a, b) => {
    const isBombA = a.type === HAND_TYPES.BOMB;
    const isBombB = b.type === HAND_TYPES.BOMB;
    if (isBombA && !isBombB) return -1;
    if (!isBombA && isBombB) return 1;
    return b.power - a.power;
  });

  return validResults;
}

// 辅助方法：检查所有牌是否为同花色
function isSameSuit(cards: Card[]): boolean {
  const suit = cards[0].suit;
  return cards.every((c) => c.suit === suit);
}

/**
 * 判断5张牌是否能构成顺子，并返回最大权重
 */
function getStraightMaxWeight(cards: Card[], _currentRank: string): number {
  if (cards.some((c) => c.rank === 'red_joker' || c.rank === 'black_joker')) {
    return 0;
  }

  const faceValues = cards.map((c) => {
    if (c.rank === 'A') return 14;
    if (c.rank === 'J') return 11;
    if (c.rank === 'Q') return 12;
    if (c.rank === 'K') return 13;
    return parseInt(c.rank, 10);
  });

  const vals = [...faceValues].sort((a, b) => a - b);
  if (isConsecutive(vals)) {
    return vals[4];
  }

  if (faceValues.includes(14)) {
    const altVals = faceValues.map((v) => (v === 14 ? 1 : v)).sort((a, b) => a - b);
    if (isConsecutive(altVals)) {
      return altVals[4];
    }
  }

  return 0;
}

/**
 * 校验双顺或钢板的连续性
 */
function getSequenceMaxWeight(ranks: string[], _currentRank: string, _requiredLen: number): number {
  if (ranks.some((r) => r === 'red_joker' || r === 'black_joker')) {
    return 0;
  }

  const faceValues = ranks.map((r) => {
    if (r === 'A') return 14;
    if (r === 'J') return 11;
    if (r === 'Q') return 12;
    if (r === 'K') return 13;
    return parseInt(r, 10);
  });

  const vals = [...faceValues].sort((a, b) => a - b);
  if (isConsecutive(vals)) {
    return vals[vals.length - 1];
  }

  if (faceValues.includes(14)) {
    const altVals = faceValues.map((v) => (v === 14 ? 1 : v)).sort((a, b) => a - b);
    if (isConsecutive(altVals)) {
      return altVals[altVals.length - 1];
    }
  }

  return 0;
}

function isConsecutive(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== arr[i - 1] + 1) return false;
  }
  return true;
}

/**
 * 比较手牌大小
 */
export function canPlay(cardsPlay: Card[], prevPlay: Combo | null, currentRank: string): Combo | null {
  const analysisList = analyzeHand(cardsPlay, currentRank);
  const bestPlay = analysisList[0];
  if (bestPlay.type === HAND_TYPES.INVALID) return null;

  if (!prevPlay || prevPlay.type === HAND_TYPES.INVALID) {
    return bestPlay;
  }

  if (bestPlay.power === 1000) return bestPlay;
  if (prevPlay.power === 1000) return null;

  if (bestPlay.type === HAND_TYPES.BOMB && prevPlay.type !== HAND_TYPES.BOMB) {
    return bestPlay;
  }

  if (bestPlay.type === HAND_TYPES.BOMB && prevPlay.type === HAND_TYPES.BOMB) {
    if (bestPlay.power > prevPlay.power) return bestPlay;
    return null;
  }

  if (bestPlay.type === prevPlay.type && bestPlay.cardCount === prevPlay.cardCount) {
    if (bestPlay.power > prevPlay.power) return bestPlay;
  }

  return null;
}
