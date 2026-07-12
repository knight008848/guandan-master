/**
 * rules.js - 掼蛋核心规则与判定逻辑
 */

// 扑克花色
const SUITS = {
  HEARTS: 'H',     // 红桃
  DIAMONDS: 'D',   // 方块
  CLUBS: 'C',      // 梅花
  SPADES: 'S',     // 黑桃
  JOKER: 'J'       // 王牌
};

// 扑克牌面
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 牌型常量
const HAND_TYPES = {
  INVALID: 'INVALID',
  SINGLE: 'SINGLE',                 // 单张
  PAIR: 'PAIR',                     // 对子
  THREE: 'THREE',                   // 三张
  THREE_TWO: 'THREE_TWO',           // 三带两
  STRAIGHT: 'STRAIGHT',             // 顺子（五张）
  DOUBLE_STRAIGHT: 'DOUBLE_STRAIGHT', // 双顺/板凳（三对）
  STEEL_PLATE: 'STEEL_PLATE',       // 钢板/三顺（两组三张）
  BOMB: 'BOMB',                     // 炸弹（含同花顺、天王炸）
};

/**
 * 获取单张牌的权重值
 * @param {string} rank 牌面 ('2'..'A', 'black_joker', 'red_joker')
 * @param {string} currentRank 当前主牌级别
 * @returns {number} 权重值 (3..17)
 */
function getCardWeight(rank, currentRank) {
  if (rank === 'red_joker') return 17;
  if (rank === 'black_joker') return 16;
  if (rank === currentRank) return 15; // 主牌级别权重为 15

  const baseWeights = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return baseWeights[rank];
}

/**
 * 判断是否为逢人配（红心主牌）
 * @param {object} card { suit, rank }
 * @param {string} currentRank 当前主牌级别
 */
function isWildCard(card, currentRank) {
  return card.suit === SUITS.HEARTS && card.rank === currentRank;
}

/**
 * 排序手牌
 * 规则：大王 > 小王 > 主牌 > A > K > Q > ... > 2
 * 逢人配可以单独排在最前面或按主牌权重排序。这里默认按权重降序排列，同权重按花色。
 */
function sortCards(cards, currentRank) {
  return [...cards].sort((a, b) => {
    // 逢人配排在最前面
    const aWild = isWildCard(a, currentRank);
    const bWild = isWildCard(b, currentRank);
    if (aWild && !bWild) return -1;
    if (!aWild && bWild) return 1;

    const wA = getCardWeight(a.rank, currentRank);
    const wB = getCardWeight(b.rank, currentRank);
    if (wA !== wB) return wB - wA;

    // 花色排序 (红桃 > 黑桃 > 梅花 > 方块)
    const suitOrder = { [SUITS.HEARTS]: 4, [SUITS.SPADES]: 3, [SUITS.CLUBS]: 2, [SUITS.DIAMONDS]: 1, [SUITS.JOKER]: 0 };
    return suitOrder[b.suit] - suitOrder[a.suit];
  });
}

/**
 * 生成所有可能的“逢人配”替代表现形式，并对每种进行牌型判定
 * @param {Array} cards 选中的牌
 * @param {string} currentRank 当前主牌级别
 * @returns {Array} 所有合法的判定结果 { type, power, wildRepresentations: [] }
 */
function analyzeHand(cards, currentRank) {
  if (!cards || cards.length === 0) return { type: HAND_TYPES.INVALID, power: 0 };

  // 找出牌中的逢人配数量
  const wildCards = cards.filter(c => isWildCard(c, currentRank));
  const normalCards = cards.filter(c => !isWildCard(c, currentRank));

  if (wildCards.length === 0) {
    // 没有逢人配，直接判定
    return [evaluateNormalHand(cards, currentRank)];
  }

  // 逢人配可以代表任意牌（除大小王），进行穷举匹配
  const possibleResults = [];
  const wildCount = wildCards.length;

  // 获取所有可替代的正常牌的 rank 和 suit 组合
  // 优化：根据 normalCards 的结构和 cards 数量，缩小穷举范围
  const candidateRanks = RANKS; // '2'..'A'
  const candidateSuits = [SUITS.HEARTS, SUITS.SPADES, SUITS.CLUBS, SUITS.DIAMONDS];

  if (wildCount === 1) {
    for (const r of candidateRanks) {
      for (const s of candidateSuits) {
        const substitutedCard = { suit: s, rank: r, isSubstituted: true, original: wildCards[0] };
        const testHand = [...normalCards, substitutedCard];
        const evalRes = evaluateNormalHand(testHand, currentRank);
        if (evalRes.type !== HAND_TYPES.INVALID) {
          evalRes.wildRepresent = [substitutedCard];
          possibleResults.push(evalRes);
        }
      }
    }
  } else if (wildCount === 2) {
    // 2个逢人配（两副牌，所以可能有两张红心主牌）
    for (let i = 0; i < candidateRanks.length; i++) {
      for (let j = 0; j < candidateRanks.length; j++) {
        for (const s1 of candidateSuits) {
          for (const s2 of candidateSuits) {
            const sub1 = { suit: s1, rank: candidateRanks[i], isSubstituted: true, original: wildCards[0] };
            const sub2 = { suit: s2, rank: candidateRanks[j], isSubstituted: true, original: wildCards[1] };
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

  // 过滤出合法结果，并按牌型强度降序排序
  const validResults = possibleResults.filter(r => r.type !== HAND_TYPES.INVALID);
  if (validResults.length === 0) {
    return [{ type: HAND_TYPES.INVALID, power: 0 }];
  }

  // 排序：优先选择炸弹，其次是普通牌型中Power较大的
  validResults.sort((a, b) => {
    const isBombA = a.type === HAND_TYPES.BOMB;
    const isBombB = b.type === HAND_TYPES.BOMB;
    if (isBombA && !isBombB) return -1;
    if (!isBombA && isBombB) return 1;
    return b.power - a.power;
  });

  return validResults;
}

/**
 * 判定不含未指定逢人配（即已假定替代）的正常手牌
 * 返回 { type, power, cardCount }
 * power 用来直接比大小。
 */
function evaluateNormalHand(cards, currentRank) {
  const len = cards.length;
  if (len === 0) return { type: HAND_TYPES.INVALID, power: 0 };

  // 统计各 rank 的数量
  const counts = {};
  cards.forEach(c => {
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
  if (len === 5 && maxCount === 3 && entries[1][1] === 2) {
    return {
      type: HAND_TYPES.THREE_TWO,
      // 比较三张的大小即可
      power: getCardWeight(entries[0][0], currentRank),
      cardCount: 5
    };
  }

  // 5. 天王炸 (4个王)
  if (len === 4) {
    const jokerCount = cards.filter(c => c.rank === 'red_joker' || c.rank === 'black_joker').length;
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
    // 4张炸弹: 100+w, 5张炸弹: 300+w, 6张炸弹: 400+w ...
    // 注意：同花顺夹在4张和5张炸弹之间（Power 200+）
    let power = 0;
    if (len === 4) power = 100 + rankWeight;
    else power = 300 + (len - 5) * 100 + rankWeight;

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
        power: 200 + straightVal, // 同花顺威力在 200-300 之间，大于4张炸弹，小于5张炸弹
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
  if (len === 6 && distinctCount === 3 && entries.every(e => e[1] === 2)) {
    const seqVal = getSequenceMaxWeight(entries.map(e => e[0]), currentRank, 3);
    if (seqVal > 0) {
      return {
        type: HAND_TYPES.DOUBLE_STRAIGHT,
        power: seqVal,
        cardCount: 6
      };
    }
  }

  // 10. 钢板/三顺 (2组连续三张)
  if (len === 6 && distinctCount === 2 && entries.every(e => e[1] === 3)) {
    const seqVal = getSequenceMaxWeight(entries.map(e => e[0]), currentRank, 2);
    if (seqVal > 0) {
      return {
        type: HAND_TYPES.STEEL_PLATE,
        power: seqVal,
        cardCount: 6
      };
    }
  }

  return { type: HAND_TYPES.INVALID, power: 0 };
}

// 辅助方法：检查所有牌是否为同花色
function isSameSuit(cards) {
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

/**
 * 判断5张牌是否能构成顺子，并返回最大权重
 * 顺子可包含 A (可作为1，也可作为14)，但不能包含主牌（当前级牌）和王牌。
 * 顺子中 A-2-3-4-5 是最小的顺子（最大权重为5，即以5结尾），10-J-Q-K-A 是最大的顺子（最大权重为14，以A结尾）。
 */
function getStraightMaxWeight(cards, currentRank) {
  // 不能包含王牌和主牌(非野生替代)
  if (cards.some(c => c.rank === 'red_joker' || c.rank === 'black_joker' || (c.rank === currentRank && !c.isSubstituted))) {
    return 0;
  }

  // 获取每张牌的自然面值 (A 可以是 1 或 14)
  const faceValues = cards.map(c => {
    if (c.rank === 'A') return 14;
    if (c.rank === 'J') return 11;
    if (c.rank === 'Q') return 12;
    if (c.rank === 'K') return 13;
    return parseInt(c.rank, 10);
  });

  // 尝试按普通 A=14 排序判定
  let vals = [...faceValues].sort((a, b) => a - b);
  if (isConsecutive(vals)) {
    return vals[4]; // 返回最大的那个数作为权重
  }

  // 尝试将 A 视为 1 判定 (如果里面有A且有2/3/4/5)
  if (faceValues.includes(14)) {
    const altVals = faceValues.map(v => v === 14 ? 1 : v).sort((a, b) => a - b);
    if (isConsecutive(altVals)) {
      return altVals[4]; // A-2-3-4-5 判定成功，返回最大值 5
    }
  }

  return 0;
}

/**
 * 校验双顺或钢板的连续性
 * @param {Array} ranks 包含的面值数组
 * @param {string} currentRank 当前主牌
 * @param {number} requiredLen 需要的连续长度（双顺为3，钢板为2）
 */
function getSequenceMaxWeight(ranks, currentRank, requiredLen) {
  if (ranks.some(r => r === 'red_joker' || r === 'black_joker' || r === currentRank)) {
    return 0;
  }

  const faceValues = ranks.map(r => {
    if (r === 'A') return 14;
    if (r === 'J') return 11;
    if (r === 'Q') return 12;
    if (r === 'K') return 13;
    return parseInt(r, 10);
  });

  let vals = [...faceValues].sort((a, b) => a - b);
  if (isConsecutive(vals)) {
    return vals[vals.length - 1];
  }

  // 考虑 A 作为 1 的连续性
  if (faceValues.includes(14)) {
    const altVals = faceValues.map(v => v === 14 ? 1 : v).sort((a, b) => a - b);
    if (isConsecutive(altVals)) {
      return altVals[altVals.length - 1];
    }
  }

  return 0;
}

function isConsecutive(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== arr[i - 1] + 1) return false;
  }
  return true;
}

/**
 * 比较手牌大小
 * @param {Array} cardsPlay 待出的牌
 * @param {Object} prevPlay 上手出的牌的数据结构 { type, power, cardCount }
 * @param {string} currentRank 当前级别
 * @returns {Object|null} 如果大过上手牌，返回判定结果，否则返回 null
 */
function canPlay(cardsPlay, prevPlay, currentRank) {
  const analysisList = analyzeHand(cardsPlay, currentRank);
  // 获取最强的合法牌型
  const bestPlay = analysisList[0];
  if (bestPlay.type === HAND_TYPES.INVALID) return null;

  // 如果没有上家，任何合法牌型都可以出
  if (!prevPlay || prevPlay.type === HAND_TYPES.INVALID) {
    return bestPlay;
  }

  // 1. 天王炸绝对最大
  if (bestPlay.power === 1000) return bestPlay;
  if (prevPlay.power === 1000) return null;

  // 2. 如果自己是炸弹，且上家不是炸弹，直接压死
  if (bestPlay.type === HAND_TYPES.BOMB && prevPlay.type !== HAND_TYPES.BOMB) {
    return bestPlay;
  }

  // 3. 如果双方都是炸弹，比 Power 即可
  if (bestPlay.type === HAND_TYPES.BOMB && prevPlay.type === HAND_TYPES.BOMB) {
    if (bestPlay.power > prevPlay.power) return bestPlay;
    return null;
  }

  // 4. 普通牌型对比：牌型必须一致，牌数必须一致，且自身 Power 更大
  if (bestPlay.type === prevPlay.type && bestPlay.cardCount === prevPlay.cardCount) {
    if (bestPlay.power > prevPlay.power) return bestPlay;
  }

  return null;
}

// 导出模块（用于浏览器或模块环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUITS, RANKS, HAND_TYPES, getCardWeight, isWildCard, sortCards, analyzeHand, canPlay
  };
}
