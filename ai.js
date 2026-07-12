/**
 * ai.js - 掼蛋 AI 对战算法
 */

/**
 * AI 决策主入口
 * @param {Array} handCards AI 当前手牌
 * @param {Object|null} prevPlay 上家出牌数据 { type, power, cardCount, playerIndex }
 * @param {string} currentRank 当前级别牌 (如 '2')
 * @param {number} myIndex AI 的座位索引 (0: 下方玩家, 1: 右方AI, 2: 上方队友AI, 3: 左方AI)
 * @param {number} currentWinnerIndex 当前回合最大牌的出牌人索引
 * @returns {Array|null} 返回选中的卡牌数组进行出牌，返回 null 或空数组表示 PASS（过）
 */
function aiChoosePlay(handCards, prevPlay, currentRank, myIndex, currentWinnerIndex) {
  // 如果当前赢家是我的队友 ( (myIndex + 2) % 4 === currentWinnerIndex )，且上家出的不是非常小的牌，通常选择过牌，不压队友
  if (prevPlay && prevPlay.type !== HAND_TYPES.INVALID) {
    const isTeammateWinner = (myIndex + 2) % 4 === currentWinnerIndex;
    if (isTeammateWinner && prevPlay.power >= 10) {
      return null; // 过牌，帮队友接风
    }
  }

  // 先对 AI 的手牌按权重排序
  const sortedHand = sortCards(handCards, currentRank);

  // 1. 如果是 AI 首发（无上家出牌，或者上家出牌已被清空）
  if (!prevPlay || prevPlay.type === HAND_TYPES.INVALID) {
    return aiLeadPlay(sortedHand, currentRank);
  }

  // 2. 如果是跟牌
  return aiFollowPlay(sortedHand, prevPlay, currentRank);
}

/**
 * AI 首发牌逻辑
 */
function aiLeadPlay(hand, currentRank) {
  // 提取炸弹和普通卡牌，避免随意出炸弹
  const analysis = extractCardGroups(hand, currentRank);

  // 优先出顺子/双顺/钢板等连牌
  if (analysis.straights.length > 0) return analysis.straights[0];
  if (analysis.steelPlates.length > 0) return analysis.steelPlates[0];
  if (analysis.doubleStraights.length > 0) return analysis.doubleStraights[0];

  // 其次出三带二或三张
  if (analysis.threeTwos.length > 0) return analysis.threeTwos[0];
  if (analysis.triples.length > 0) return analysis.triples[0];

  // 其次出对子 (出最小的对子)
  if (analysis.pairs.length > 0) {
    return analysis.pairs[analysis.pairs.length - 1]; // 升序排列的最小对子
  }

  // 最后出单张 (出最小的单张，但尽量保留主牌和王)
  if (analysis.singles.length > 0) {
    return [analysis.singles[analysis.singles.length - 1]];
  }

  // 如果只剩下炸弹了，出最小的炸弹
  if (analysis.bombs.length > 0) {
    return analysis.bombs[analysis.bombs.length - 1];
  }

  // 备用：万一什么都没匹配到，直接出一张最小的牌
  return [hand[hand.length - 1]];
}

/**
 * AI 跟牌逻辑
 */
function aiFollowPlay(hand, prevPlay, currentRank) {
  const targetType = prevPlay.type;
  const targetPower = prevPlay.power;
  const targetCount = prevPlay.cardCount;

  // 提取炸弹和普通组合
  const groups = extractCardGroups(hand, currentRank);

  // 1. 尝试用相同牌型的普通牌压制
  let candidates = [];
  if (targetType === HAND_TYPES.SINGLE) {
    candidates = groups.singles.map(c => [c])
      .concat(groups.pairs.map(p => [p[0]])) // 也可以拆对子出单张（从非炸弹卡牌中）
      .filter(play => getCardWeight(play[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.PAIR) {
    candidates = groups.pairs.filter(p => getCardWeight(p[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.THREE) {
    candidates = groups.triples.filter(t => getCardWeight(t[0].rank, currentRank) > targetPower);
  } else if (targetType === HAND_TYPES.THREE_TWO) {
    // 寻找能够大过上家的三带两
    candidates = groups.threeTwos.filter(tt => {
      // 这里的 tt 是 5 张牌，需要找到它的三张部分权重
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

  // 如果找到了能压的普通牌，选择其中最小的一组（避免浪费大牌）
  if (candidates.length > 0) {
    // 简单排序：取第一个（通常在提取时已经排好序或者可以直接比较）
    // 为了简单，我们对候选集计算 power 并选出 power 最小的那个
    candidates.sort((a, b) => {
      const powA = analyzeHand(a, currentRank)[0].power;
      const powB = analyzeHand(b, currentRank)[0].power;
      return powA - powB;
    });
    return candidates[0];
  }

  // 2. 如果无法普通跟牌，或者上家就是炸弹，考虑出炸弹
  if (groups.bombs.length > 0) {
    const validBombs = groups.bombs.filter(b => {
      const res = analyzeHand(b, currentRank)[0];
      return res.type === HAND_TYPES.BOMB && (targetType !== HAND_TYPES.BOMB || res.power > targetPower);
    });

    if (validBombs.length > 0) {
      // 如果上家不是炸弹，且手牌还很多，AI 不一定要把大炸弹浪费在小牌上
      // 策略：如果上家是普通牌，且上家出的牌较小 (power < 10)，AI 可以不炸。
      // 如果手牌少于 7 张，或者上家牌很大，果断出炸弹。
      const isUrgent = hand.length < 8 || targetPower >= 12 || targetType === HAND_TYPES.BOMB;
      if (isUrgent) {
        // 出最小的合格炸弹
        validBombs.sort((a, b) => {
          const powA = analyzeHand(a, currentRank)[0].power;
          const powB = analyzeHand(b, currentRank)[0].power;
          return powA - powB;
        });
        return validBombs[0];
      }
    }
  }

  // 3. 实在要不起，PASS
  return null;
}

/**
 * 提取手牌中所有的可能牌型组合（单张、对子、三张、三带二、连牌、炸弹）
 * 该方法将手牌进行归类，并保护炸弹卡牌不被拆散。
 */
function extractCardGroups(hand, currentRank) {
  const result = {
    bombs: [],
    straights: [],
    steelPlates: [],
    doubleStraights: [],
    threeTwos: [],
    triples: [],
    pairs: [],
    singles: []
  };

  // 统计数值分布
  const counts = {};
  hand.forEach(c => {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  });

  // 1. 提取天王炸
  const jokers = hand.filter(c => c.rank === 'red_joker' || c.rank === 'black_joker');
  if (jokers.length === 4) {
    result.bombs.push(jokers);
    // 从后续统计中剔除王牌
    jokers.forEach(j => {
      counts[j.rank] = 0;
    });
  }

  // 2. 提取常规炸弹 (4张及以上同数值)
  Object.keys(counts).forEach(rank => {
    if (counts[rank] >= 4) {
      const bombCards = hand.filter(c => c.rank === rank);
      result.bombs.push(bombCards);
      counts[rank] = 0; // 该数值卡牌已被炸弹锁定
    }
  });

  // 过滤掉被锁定的炸弹卡牌，剩余牌用于提取普通牌型
  const normalHand = hand.filter(c => counts[c.rank] > 0);

  // 简单起见，这里提取常规的三张、对子、单张
  const tempTriples = [];
  const tempPairs = [];
  const tempSingles = [];

  const tempCounts = {};
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

  // 3. 构建三带二
  // 组合 tempTriples 和 tempPairs
  const usedPairs = new Set();
  tempTriples.forEach((triple, tIdx) => {
    // 找一个没用过的对子
    const freePairIdx = tempPairs.findIndex((p, pIdx) => !usedPairs.has(pIdx));
    if (freePairIdx !== -1) {
      result.threeTwos.push([...triple, ...tempPairs[freePairIdx]]);
      usedPairs.add(freePairIdx);
    } else {
      // 如果没有对子，可以拆一个三张做对子，或者从单张组合？
      // 简单起见，仅保留为三张
      result.triples.push(triple);
    }
  });

  // 把没用过的对子放进 pairs
  tempPairs.forEach((p, pIdx) => {
    if (!usedPairs.has(pIdx)) {
      result.pairs.push(p);
    }
  });

  result.singles = tempSingles;

  // 4. 尝试寻找顺子 (5张)，仅在普通单牌+对子中提取
  // 提示：这只是 AI 的启发式算法，为简便，我们可以通过滑动窗口在可用单卡数值中搜寻
  const availableForSeq = normalHand.filter(c => c.rank !== 'red_joker' && c.rank !== 'black_joker' && c.rank !== currentRank);
  // 去重并按面值排序
  const uniqueRanks = [...new Set(availableForSeq.map(c => c.rank))];
  const sortedUniqueRanks = uniqueRanks.sort((a, b) => {
    const wA = getCardWeight(a, currentRank);
    const wB = getCardWeight(b, currentRank);
    return wA - wB; // 升序
  });

  // 滑动窗口寻找长度为5的连续段
  for (let i = 0; i <= sortedUniqueRanks.length - 5; i++) {
    const subRanks = sortedUniqueRanks.slice(i, i + 5);
    const weights = subRanks.map(r => getCardWeight(r, currentRank));
    if (weights[4] - weights[0] === 4) {
      // 找到了！从 availableForSeq 中各取一张
      const straightCards = subRanks.map(r => availableForSeq.find(c => c.rank === r));
      result.straights.push(straightCards);
      // 简单起见，一旦找到顺子，不再将它们强行剔除（或者可以用作备选）
    }
  }

  // 对单张、对子、三张等进行排序 (大牌在前，小牌在后，便于 AI 首发时取最后的“小牌”)
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

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    aiChoosePlay, extractCardGroups
  };
}
