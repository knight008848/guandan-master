/**
 * session.ts - 游戏核心状态机 (Finite State Machine / GameSession)
 * 与 DOM 完全解耦，基于自定义 EventEmitter 发送状态变更事件
 */

import { Card, GamePhase, PlayRecord, Player, PlayerStateView, Suit, TributeInfo } from './types';
import { canPlay, getCardWeight, isWildCard, sortCards, RANKS } from './rules';
import { aiChoosePlay } from './ai';

type Listener = (...args: any[]) => void;

class EventEmitter {
  private events: Record<string, Listener[]> = {};

  on(event: string, listener: Listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event: string, ...args: any[]) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }
}

export class GameSession extends EventEmitter {
  public levelTeamA = 2; // 玩家 + 队友 (0, 2)
  public levelTeamB = 2; // 对手 (1, 3)
  public currentRank = '2'; // 当前打几级
  public phase: GamePhase = 'DEALING';

  public playerHands: Card[][] = [[], [], [], []];
  public lastPlay: PlayRecord | null = null;
  public currentPlayer = 0;
  public currentWinnerIndex = 0;
  public passCount = 0;
  public finishedPlayers: number[] = []; // [first, second, third, last]
  public lastRoundFinishedPlayers: number[] = []; // 记录上一局的最终排名，用于进贡逻辑

  public tributeInfo: TributeInfo | null = null;
  public selectedTributeCard: Card | null = null;

  public players: Player[] = [
    { name: '你 (玩家)', avatar: '👑', isAI: false },
    { name: '对手1 (AI)', avatar: '🦸', isAI: true },
    { name: '队友 (AI)', avatar: '👨‍✈️', isAI: true },
    { name: '对手2 (AI)', avatar: '🕵️', isAI: true }
  ];

  constructor() {
    super();
    // 随机生成 5 字名字并附带身份和团队标识
    this.players[1].name = `${generateRandomName()} (对手/AI)`;
    this.players[2].name = `${generateRandomName()} (队友/AI)`;
    this.players[3].name = `${generateRandomName()} (对手/AI)`;
  }

  public initGame() {
    this.phase = 'DEALING';
    this.playerHands = [[], [], [], []];
    this.lastPlay = null;
    this.currentPlayer = 0;
    this.currentWinnerIndex = 0;
    this.passCount = 0;
    this.finishedPlayers = [];
    this.tributeInfo = null;
    this.selectedTributeCard = null;

    this.emit('deal_started');
    this.dealCards();
  }

  private dealCards() {
    // 1. 创建和洗牌
    let deck: Card[] = [];
    const suits: Suit[] = ['H', 'D', 'C', 'S'];
    for (let d = 0; d < 2; d++) {
      suits.forEach(suit => {
        RANKS.forEach(rank => {
          deck.push({ suit, rank });
        });
      });
      deck.push({ suit: 'J', rank: 'black_joker' });
      deck.push({ suit: 'J', rank: 'red_joker' });
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // 发牌
    for (let i = 0; i < deck.length; i++) {
      const playerIdx = i % 4;
      this.playerHands[playerIdx].push(deck[i]);
    }

    // 排序手牌
    for (let p = 0; p < 4; p++) {
      this.playerHands[p] = sortCards(this.playerHands[p], this.currentRank);
    }

    // 触发完成事件，让渲染层开始渲染与动画
    setTimeout(() => {
      this.emit('deal_finished', this.playerHands);
      
      // 第一局无进贡直接开打，通过随机数决定首发玩家
      if (this.lastRoundFinishedPlayers.length === 0) {
        this.phase = 'PLAYING';
        this.currentPlayer = Math.floor(Math.random() * 4);
        this.emit('turn_started', this.currentPlayer, true, null);
        
        if (this.players[this.currentPlayer].isAI) {
          setTimeout(() => this.executeAILogic(), 1400);
        }
      } else {
        this.checkTribute();
      }
    }, 1200); // 预留动画过渡时间
  }

  // 进贡判定
  private checkTribute() {
    this.phase = 'TRIBUTE';
    
    const first = this.lastRoundFinishedPlayers[0];
    const second = this.lastRoundFinishedPlayers[1];
    const third = this.lastRoundFinishedPlayers[2];
    const last = this.lastRoundFinishedPlayers[3];

    const isDoubleUpstream = (first === 0 && second === 2) || 
                             (first === 2 && second === 0) ||
                             (first === 1 && second === 3) ||
                             (first === 3 && second === 1);

    if (isDoubleUpstream) {

      // 比较进贡牌大小，决定分发对象（大贡给头游，小贡给二游）
      const eligibleThird = this.playerHands[third].filter(c => !isWildCard(c, this.currentRank));
      const sortedThird = sortCards(eligibleThird, this.currentRank);
      const maxCardThird = sortedThird[0];

      const eligibleLast = this.playerHands[last].filter(c => !isWildCard(c, this.currentRank));
      const sortedLast = sortCards(eligibleLast, this.currentRank);
      const maxCardLast = sortedLast[0];

      const weightThird = maxCardThird ? getCardWeight(maxCardThird.rank, this.currentRank) : 0;
      const weightLast = maxCardLast ? getCardWeight(maxCardLast.rank, this.currentRank) : 0;

      let payersList: number[] = [];
      let receiversList: number[] = [];

      if (weightLast > weightThird) {
        // 末游(last)进贡的牌更大，给头游(first)；三游(third)给二游(second)
        payersList = [last, third];
        receiversList = [first, second];
      } else {
        // 三游(third)进贡的牌更大或相等，给头游(first)；末游(last)给二游(second)
        payersList = [third, last];
        receiversList = [first, second];
      }

      this.setupTribute(payersList, receiversList, true);
    } else {
      this.setupTribute([last], [first], false);
    }
  }


  private setupTribute(payers: number[], receivers: number[], isDouble: boolean) {
    this.tributeInfo = {
      payers,
      receivers,
      isDouble,
      paidCards: [],
      status: 'WAITING_TRIBUTE',
      index: 0
    };

    this.processNextTribute();
  }

  private processNextTribute() {
    const info = this.tributeInfo;
    if (!info) return;

    if (info.index >= info.payers.length) {
      info.status = 'WAITING_RETURN';
      info.index = 0;
      this.processNextReturn();
      return;
    }

    const payer = info.payers[info.index];
    const receiver = info.receivers[info.index];

    // 检查抗贡
    let hasAntiTribute = false;
    if (info.isDouble) {
      const j1 = this.countRedJokers(info.payers[0]);
      const j2 = this.countRedJokers(info.payers[1]);
      if (j1 + j2 === 2) hasAntiTribute = true;
    } else {
      if (this.countRedJokers(payer) === 2) hasAntiTribute = true;
    }

    if (hasAntiTribute) {
      this.emit('toast', '输家拥有一对红心大王，抗贡成功！免除本局进贡。');
      this.endTributePhase();
      return;
    }

    if (payer === 0) {
      // 玩家进贡，派发UI选择事件：只允许玩家选择最大点数的非逢人配卡牌
      const eligible = this.playerHands[0].filter(c => !isWildCard(c, this.currentRank));
      const sorted = sortCards(eligible, this.currentRank);
      if (sorted.length > 0) {
        const maxWeight = getCardWeight(sorted[0].rank, this.currentRank);
        const maxWeightCards = sorted.filter(c => getCardWeight(c.rank, this.currentRank) === maxWeight);
        this.emit('tribute_required', '请选择您手牌中最大的一张牌进行进贡：', maxWeightCards);
      }
    } else {
      // AI 进贡
      const eligible = this.playerHands[payer].filter(c => !isWildCard(c, this.currentRank));
      const sorted = sortCards(eligible, this.currentRank);
      const card = sorted[0];
      this.executeTribute(payer, receiver, card);
    }
  }

  private countRedJokers(playerIdx: number): number {
    return this.playerHands[playerIdx].filter(c => c.rank === 'red_joker').length;
  }

  public submitTributeCard(card: Card) {
    const info = this.tributeInfo;
    if (!info) return;

    if (info.status === 'WAITING_TRIBUTE') {
      const payer = info.payers[info.index];
      const receiver = info.receivers[info.index];

      // 验证玩家进贡卡牌合法性（防止越权选择小牌）
      if (payer === 0) {
        const eligible = this.playerHands[0].filter(c => !isWildCard(c, this.currentRank));
        const sorted = sortCards(eligible, this.currentRank);
        if (sorted.length > 0) {
          const maxWeight = getCardWeight(sorted[0].rank, this.currentRank);
          if (getCardWeight(card.rank, this.currentRank) !== maxWeight || isWildCard(card, this.currentRank)) {
            this.emit('toast', '进贡牌不符合规则，必须是手上的最大牌！');
            return;
          }
        }
      }

      this.executeTribute(payer, receiver, card);
    } else {
      const receiver = info.receivers[info.index];
      const payer = info.payers[info.index];

      // 验证玩家退贡/还牌卡牌合法性
      if (receiver === 0) {
        const hasUnder10 = this.playerHands[0].some(c => getCardWeight(c.rank, this.currentRank) <= 10 && !isWildCard(c, this.currentRank));
        if (hasUnder10) {
          if (getCardWeight(card.rank, this.currentRank) > 10 || isWildCard(card, this.currentRank)) {
            this.emit('toast', '退贡牌不符合规则，必须 ≤10 的非逢人配牌！');
            return;
          }
        } else {
          const sortedHand = sortCards(this.playerHands[0], this.currentRank);
          const minWeight = getCardWeight(sortedHand[sortedHand.length - 1].rank, this.currentRank);
          if (getCardWeight(card.rank, this.currentRank) !== minWeight) {
            this.emit('toast', '退贡牌不符合规则，在没有 ≤10 牌的情况下，必须退还手上最小的牌！');
            return;
          }
        }
      }

      this.executeReturn(receiver, payer, card);
    }
  }

  private executeTribute(payer: number, receiver: number, card: Card) {
    this.removeCard(payer, card);
    this.playerHands[receiver].push(card);
    this.playerHands[receiver] = sortCards(this.playerHands[receiver], this.currentRank);

    this.tributeInfo?.paidCards.push({ payer, receiver, card });
    this.emit('tribute_card_paid', payer, receiver, card, this.playerHands);

    setTimeout(() => {
      if (this.tributeInfo) {
        this.tributeInfo.index++;
        this.processNextTribute();
      }
    }, 1200);
  }

  private processNextReturn() {
    const info = this.tributeInfo;
    if (!info) return;

    if (info.index >= info.receivers.length) {
      this.endTributePhase();
      return;
    }

    const receiver = info.receivers[info.index];
    const payer = info.payers[info.index];

    if (receiver === 0) {
      const eligible = this.playerHands[0].filter(c => {
        return getCardWeight(c.rank, this.currentRank) <= 10 && !isWildCard(c, this.currentRank);
      });
      let choices: Card[] = [];
      if (eligible.length > 0) {
        choices = sortCards(eligible, this.currentRank);
      } else {
        // 如果没有 <= 10 的牌，必须还最小的牌（多张同点数可选不同花色）
        const sortedHand = sortCards(this.playerHands[0], this.currentRank);
        const minWeight = getCardWeight(sortedHand[sortedHand.length - 1].rank, this.currentRank);
        choices = sortedHand.filter(c => getCardWeight(c.rank, this.currentRank) === minWeight);
      }
      this.emit('return_required', `请退还一张卡牌给 ${this.players[payer].name}（需≤10）：`, choices);
    } else {
      // AI 退贡
      const eligible = this.playerHands[receiver].filter(c => {
        return getCardWeight(c.rank, this.currentRank) <= 10 && !isWildCard(c, this.currentRank);
      });
      const sorted = sortCards(eligible.length > 0 ? eligible : this.playerHands[receiver], this.currentRank);
      const card = sorted[sorted.length - 1]; // 选最小的退还
      this.executeReturn(receiver, payer, card);
    }
  }

  private executeReturn(receiver: number, payer: number, card: Card) {
    this.removeCard(receiver, card);
    this.playerHands[payer].push(card);
    this.playerHands[payer] = sortCards(this.playerHands[payer], this.currentRank);

    this.emit('return_card_paid', receiver, payer, card, this.playerHands);

    setTimeout(() => {
      if (this.tributeInfo) {
        this.tributeInfo.index++;
        this.processNextReturn();
      }
    }, 1200);
  }

  private endTributePhase() {
    this.phase = 'PLAYING';
    
    // 进贡后首发权判定规则：
    // 1. 如果是抗贡（paidCards 为空），直接由上一局的头游（1st place）先出牌；
    // 2. 如果是单贡/内贡，由进贡者（payer）先出牌；
    // 3. 如果是双贡，由进贡卡牌点数大的一方先出牌；若大小一致，由进贡给头游的玩家先出牌。
    let startingPlayer = this.lastRoundFinishedPlayers[0] !== undefined ? this.lastRoundFinishedPlayers[0] : 0;

    if (this.tributeInfo && this.tributeInfo.paidCards.length > 0) {
      if (this.tributeInfo.isDouble) {
        const p1 = this.tributeInfo.paidCards[0]; // 进贡给头游的记录
        const p2 = this.tributeInfo.paidCards[1]; // 进贡给二游的记录
        if (p1 && p2) {
          const w1 = getCardWeight(p1.card.rank, this.currentRank);
          const w2 = getCardWeight(p2.card.rank, this.currentRank);
          if (w1 > w2) {
            startingPlayer = p1.payer;
          } else if (w2 > w1) {
            startingPlayer = p2.payer;
          } else {
            startingPlayer = p1.payer; // 相等时，进给头游的玩家先出牌
          }
        }
      } else {
        startingPlayer = this.tributeInfo.payers[0];
      }
    }

    this.currentPlayer = startingPlayer;
    this.emit('tribute_finished', this.currentPlayer);
    this.emit('turn_started', this.currentPlayer, true, null);

    if (this.players[this.currentPlayer].isAI) {
      setTimeout(() => this.executeAILogic(), 1400);
    }
  }

  // 玩家/AI 动作接口
  public playCards(cards: Card[]): boolean {
    if (this.phase !== 'PLAYING') return false;

    // 校验
    const combo = canPlay(cards, this.lastPlay ? {
      type: this.lastPlay.type,
      power: this.lastPlay.power,
      cardCount: this.lastPlay.cardCount
    } : null, this.currentRank);

    if (!combo) return false;

    // 扣牌
    cards.forEach(c => this.removeCard(this.currentPlayer, c));

    // 更新最后出牌记录
    this.lastPlay = {
      type: combo.type,
      power: combo.power,
      cardCount: combo.cardCount,
      playerIndex: this.currentPlayer
    };

    this.currentWinnerIndex = this.currentPlayer;
    this.passCount = 0;

    this.emit('cards_played', this.currentPlayer, cards, combo, this.playerHands);

    // 检查是否走完
    if (this.playerHands[this.currentPlayer].length === 0) {
      this.playerGoneOut(this.currentPlayer);
    }

    if (this.checkRoundEnd()) return true;

    // 下一位
    this.nextPlayer();
    return true;
  }

  public passTurn(): boolean {
    if (this.phase !== 'PLAYING') return false;

    this.passCount++;
    this.emit('pass_played', this.currentPlayer);

    if (this.checkRoundEnd()) return true;

    this.nextPlayer();
    return true;
  }

  private nextPlayer() {
    this.currentPlayer = (this.currentPlayer + 1) % 4;
    
    // 如果下家已经出完牌了，自动跳过
    while (this.playerHands[this.currentPlayer].length === 0) {
      this.currentPlayer = (this.currentPlayer + 1) % 4;
    }

    // 检查是否都过了一圈
    if (this.passCount === 3) {
      // 这一轮出牌结束，清空出牌区
      this.lastPlay = null;
      this.passCount = 0;
      this.emit('trick_ended', this.currentWinnerIndex);

      // 接风判定：如果当前赢家已经出完，首发权给他的队友
      if (this.playerHands[this.currentWinnerIndex].length === 0) {
        const partner = (this.currentWinnerIndex + 2) % 4;
        this.currentPlayer = partner;
        this.currentWinnerIndex = partner;
        this.emit('toast', `出牌赢家已出完手牌，由队友接风首发！`);
      } else {
        this.currentPlayer = this.currentWinnerIndex;
      }
    }

    // 启动下个玩家的动作
    const isLead = !this.lastPlay || this.lastPlay.type === 'INVALID';
    this.emit('turn_started', this.currentPlayer, isLead, this.lastPlay);

    if (this.players[this.currentPlayer].isAI) {
      setTimeout(() => this.executeAILogic(), 1400);
    }
  }

  private executeAILogic() {
    // 构造 AI 只读状态镜像
    const view: PlayerStateView = {
      hand: this.playerHands[this.currentPlayer],
      lastPlay: this.lastPlay,
      currentRank: this.currentRank,
      myIndex: this.currentPlayer,
      currentWinnerIndex: this.currentWinnerIndex,
      opponentCardCounts: [
        this.playerHands[0].length,
        this.playerHands[1].length,
        this.playerHands[2].length,
        this.playerHands[3].length
      ]
    };

    const play = aiChoosePlay(view);
    if (play && play.length > 0) {
      this.playCards(play);
    } else {
      this.passTurn();
    }
  }

  private playerGoneOut(playerIdx: number) {
    if (!this.finishedPlayers.includes(playerIdx)) {
      this.finishedPlayers.push(playerIdx);
      this.emit('player_gone_out', playerIdx, this.finishedPlayers.length);
    }
  }

  private checkRoundEnd(): boolean {
    const teamAFinished = this.finishedPlayers.filter(p => p === 0 || p === 2).length;
    const teamBFinished = this.finishedPlayers.filter(p => p === 1 || p === 3).length;

    // 当任意一方有两人出完，或者已有三人出完牌时，本局结束
    if (teamAFinished === 2 || teamBFinished === 2 || this.finishedPlayers.length === 3) {
      // 掼蛋规则：头游（第一名）所在的队伍获得本局胜利！
      const winner = this.finishedPlayers[0];
      const winTeam = (winner === 0 || winner === 2) ? 0 : 1;
      this.endRound(winTeam);
      return true;
    }
    return false;
  }

  private endRound(winTeamIdx: number) {
    this.phase = 'ROUND_END';

    // 记录本局排名并补齐未出完牌的玩家，供下局进贡使用
    const fullFinished = [...this.finishedPlayers];
    [0, 1, 2, 3].forEach(p => {
      if (!fullFinished.includes(p)) {
        fullFinished.push(p);
      }
    });
    this.lastRoundFinishedPlayers = fullFinished;

    const first = this.finishedPlayers[0];
    const second = this.finishedPlayers[1];

    let upgradeLevels = 1;
    let isDouble = false;

    // 双游判定
    const isDoubleUpstream = (first === 0 && second === 2) || (first === 2 && second === 0) ||
                             (first === 1 && second === 3) || (first === 3 && second === 1);

    if (isDoubleUpstream) {
      upgradeLevels = 3;
      isDouble = true;
    } else {
      const partnerIndex = (first + 2) % 4;
      // 如果第三个出完牌的玩家是头游的队友，则为 1st 和 3rd 胜出，升 2 级
      if (this.finishedPlayers[2] === partnerIndex) {
        upgradeLevels = 2;
      }
      // 否则为 1st 和 4th 胜出，升 1 级
    }

    let finalRankStr = this.finishedPlayers.map((p, i) => `${i + 1}. ${this.players[p].name}`).join('<br>');

    if (winTeamIdx === 0) {
      this.levelTeamA += upgradeLevels;
      if (this.levelTeamA > 14) this.levelTeamA = 14;
      this.currentRank = getRankChar(this.levelTeamA);
    } else {
      this.levelTeamB += upgradeLevels;
      if (this.levelTeamB > 14) this.levelTeamB = 14;
      this.currentRank = getRankChar(this.levelTeamB);
    }

    this.emit('round_ended', winTeamIdx, upgradeLevels, isDouble, finalRankStr);
  }

  public startNextRound() {
    // 检查大结局
    if (this.levelTeamA === 14 && this.finishedPlayers[0] === 0) {
      this.emit('toast', '恭喜您完成了打 A，获得了整局游戏的最终胜利！重新开始新游戏。');
      this.levelTeamA = 2;
      this.levelTeamB = 2;
      this.currentRank = '2';
      this.finishedPlayers = [];
      this.lastRoundFinishedPlayers = [];
    } else if (this.levelTeamB === 14 && (this.finishedPlayers[0] === 1 || this.finishedPlayers[0] === 3)) {
      this.emit('toast', '很遗憾，对手打过了 A 赢得了最终胜利。重新开始新游戏。');
      this.levelTeamA = 2;
      this.levelTeamB = 2;
      this.currentRank = '2';
      this.finishedPlayers = [];
      this.lastRoundFinishedPlayers = [];
    }

    this.initGame();
  }

  private removeCard(playerIdx: number, card: Card) {
    const idx = this.playerHands[playerIdx].findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      this.playerHands[playerIdx].splice(idx, 1);
    }
  }
}

// 辅助转化
function getRankChar(levelValue: number): string {
  const map: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  return map[levelValue] || '2';
}

// 随机 5 字姓名生成器
function generateRandomName(): string {
  const prefixes = ['无敌', '机智', '冷酷', '呆萌', '傲娇', '愤怒', '狂暴', '优雅', '咸鱼', '追风', '霸气', '低调', '糊涂', '开心'];
  const suffixes = ['皮皮虾', '哈士奇', '程序猿', '背锅侠', '小黄鸭', '二师兄', '大灰狼', '小红帽', '吃瓜人', '追风者', '扫地僧', '打工人', '干饭王'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return p + s;
}
