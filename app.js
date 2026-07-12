/**
 * app.js - 游戏状态机与UI渲染控制器
 */

// 游戏状态定义
const GAME_PHASES = {
  DEALING: 'DEALING',
  TRIBUTE: 'TRIBUTE',
  PLAYING: 'PLAYING',
  ROUND_END: 'ROUND_END'
};

class GuandanGame {
  constructor() {
    this.levelTeamA = 2; // 玩家 + 队友 (Player 0, 2)
    this.levelTeamB = 2; // 对手1 + 对手2 (Player 1, 3)
    this.currentRank = '2'; // 当前打几

    // 玩家数据 (0: 玩家自己, 1: 右边AI, 2: 上边队友AI, 3: 左边AI)
    this.players = [
      { name: '你 (玩家)', avatar: '👑', isAI: false },
      { name: '对手1 (AI)', avatar: '🦸', isAI: true },
      { name: '队友 (AI)', avatar: '👨‍✈️', isAI: true },
      { name: '对手2 (AI)', avatar: '🥷', isAI: true }
    ];

    this.resetRoundState();

    // 绑定事件
    document.getElementById('btn-play').addEventListener('click', () => this.handlePlayCards());
    document.getElementById('btn-pass').addEventListener('click', () => this.handlePassTurn());
    document.getElementById('btn-reset').addEventListener('click', () => this.handleResetSelection());
    document.getElementById('btn-sort').addEventListener('click', () => this.handleSortCards());
    document.getElementById('btn-tip').addEventListener('click', () => this.handleTipCards());
    document.getElementById('btn-next-round').addEventListener('click', () => this.startNextRound());
    document.getElementById('btn-confirm-tribute').addEventListener('click', () => this.handleConfirmTribute());

    // 拖动选择变量
    this.isDragging = false;
    this.draggedCards = new Set();
    this.initDragSelect();
  }

  resetRoundState() {
    this.phase = GAME_PHASES.DEALING;
    this.playerHands = [[], [], [], []];
    this.playZonesContent = [null, null, null, null]; // 四个位置展示的出牌
    this.lastPlay = null; // 上手出牌 { type, power, cardCount, playerIndex }
    this.currentPlayer = 0; // 当前出牌人
    this.currentWinnerIndex = 0; // 当前圈最大牌出牌人
    this.passCount = 0;
    this.finishedPlayers = []; // 已出完牌的玩家顺序 [index1, index2, ...]
    
    // 进贡数据
    this.tributeInfo = null; // { payer: [], receiver: [], paidCards: [], status: 'WAITING_TRIBUTE'|'WAITING_RETURN' }
    this.selectedTributeCard = null;

    // 清理界面
    this.clearPlayZones();
    document.getElementById('controls-panel').style.opacity = '0';
    document.getElementById('controls-panel').style.pointerEvents = 'none';
  }

  // 初始化拖动选择
  initDragSelect() {
    const container = document.getElementById('player-cards-container');
    
    container.addEventListener('mousedown', (e) => {
      // 只有左键触发
      if (e.button !== 0) return;
      this.isDragging = true;
      this.draggedCards.clear();
      
      const cardEl = e.target.closest('.card');
      if (cardEl && !cardEl.classList.contains('back')) {
        this.toggleCardSelection(cardEl);
        this.draggedCards.add(cardEl);
      }
    });

    document.addEventListener('mouseover', (e) => {
      if (!this.isDragging) return;
      const cardEl = e.target.closest('.card');
      if (cardEl && !cardEl.classList.contains('back') && cardEl.parentNode === container) {
        if (!this.draggedCards.has(cardEl)) {
          this.toggleCardSelection(cardEl);
          this.draggedCards.add(cardEl);
        }
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  toggleCardSelection(cardEl) {
    cardEl.classList.toggle('selected');
  }

  // 开始新游戏/新一轮
  initGame() {
    this.resetRoundState();
    this.updateStatusUI();
    this.dealCardsAnimation();
  }

  // 创建扑克牌堆 (2副牌 = 108张)
  createDeck() {
    const deck = [];
    const suits = [SUITS.HEARTS, SUITS.DIAMONDS, SUITS.CLUBS, SUITS.SPADES];
    
    // 循环2次，代表2副牌
    for (let d = 0; d < 2; d++) {
      // 正常牌
      suits.forEach(suit => {
        RANKS.forEach(rank => {
          deck.push({ suit, rank });
        });
      });
      // 大小王
      deck.push({ suit: SUITS.JOKER, rank: 'black_joker' });
      deck.push({ suit: SUITS.JOKER, rank: 'red_joker' });
    }
    return deck;
  }

  // 洗牌
  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // 发牌动效
  async dealCardsAnimation() {
    this.showToast('正在洗牌发牌，请稍候...');
    let deck = this.createDeck();
    deck = this.shuffle(deck);

    const table = document.getElementById('game-table-container');
    const playerContainers = [
      document.getElementById('player-cards-container'),
      document.getElementById('cards-stack-1'),
      document.getElementById('cards-stack-2'),
      document.getElementById('cards-stack-3')
    ];

    // 清空现有UI卡牌
    playerContainers.forEach(c => c.innerHTML = '');

    // 每次发一张，轮流发，总共108张
    const dealStep = 4;
    const totalCards = 108;
    
    // 我们用一个更高效的动画展现：分批快速飞入
    for (let i = 0; i < totalCards; i++) {
      const playerIndex = i % 4;
      const cardData = deck[i];
      this.playerHands[playerIndex].push(cardData);
    }

    // 播放飞牌动画，用15张代表性飞行动画制造视觉效果
    for (let step = 0; step < 12; step++) {
      const flyingCard = document.createElement('div');
      flyingCard.className = 'card back flying';
      
      const targetPiles = [
        { top: '80%', left: '50%', rot: '0deg' },  // 底部
        { top: '50%', left: '85%', rot: '90deg' }, // 右侧
        { top: '15%', left: '50%', rot: '0deg' },  // 顶部
        { top: '50%', left: '15%', rot: '-90deg' } // 左侧
      ];
      const target = targetPiles[step % 4];
      flyingCard.style.setProperty('--target-top', target.top);
      flyingCard.style.setProperty('--target-left', target.left);
      flyingCard.style.setProperty('--target-rot', target.rot);
      
      table.appendChild(flyingCard);
      
      setTimeout(() => {
        flyingCard.remove();
      }, 400);
      
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // 排序大家的手牌
    for (let p = 0; p < 4; p++) {
      this.playerHands[p] = sortCards(this.playerHands[p], this.currentRank);
    }

    // 渲染卡牌
    this.renderAllHands();
    this.updateCardCounts();

    // 第一局无进贡，直接进入打牌阶段
    if (this.levelTeamA === 2 && this.levelTeamB === 2 && this.finishedPlayers.length === 0) {
      this.phase = GAME_PHASES.PLAYING;
      this.currentPlayer = 0; // 玩家首出
      this.updateStatusUI();
      this.showToast('游戏开始！您首先出牌。');
      this.startTurn();
    } else {
      // 进入进贡结算判定
      this.checkTributeRequirements();
    }
  }

  // 判定是否进贡
  checkTributeRequirements() {
    this.phase = GAME_PHASES.TRIBUTE;
    this.updateStatusUI();

    // 获得上一局名次
    const first = this.finishedPlayers[0];
    const last = this.finishedPlayers[3] !== undefined ? this.finishedPlayers[3] : this.getRemainingPlayerIndex();
    const third = this.finishedPlayers[2];

    // 判断双游还是单游
    const isDoubleUpstream = (this.finishedPlayers[0] === 0 && this.finishedPlayers[1] === 2) || 
                             (this.finishedPlayers[0] === 2 && this.finishedPlayers[1] === 0) ||
                             (this.finishedPlayers[0] === 1 && this.finishedPlayers[1] === 3) ||
                             (this.finishedPlayers[0] === 3 && this.finishedPlayers[1] === 1);

    if (isDoubleUpstream) {
      // 双游：两个输家分别向两个赢家进贡
      // 规则：末游（第4名）贡大，给上游（第1名）；第3名贡小，给第2名。
      const winners = [this.finishedPlayers[0], this.finishedPlayers[1]];
      const losers = [this.finishedPlayers[2], last];
      
      this.setupTribute(losers, winners, true);
    } else {
      // 单游：末游向头游进贡
      this.setupTribute([last], [first], false);
    }
  }

  getRemainingPlayerIndex() {
    // 找出还没有出完牌的那个人
    const all = [0, 1, 2, 3];
    return all.find(p => !this.finishedPlayers.includes(p));
  }

  setupTribute(payers, receivers, isDouble) {
    this.tributeInfo = {
      payers,
      receivers,
      isDouble,
      paidCards: [],
      status: 'WAITING_TRIBUTE',
      index: 0 // 当前正在处理第几对进贡
    };

    this.processNextTribute();
  }

  processNextTribute() {
    const info = this.tributeInfo;
    if (info.index >= info.payers.length) {
      // 进贡结束，进入退贡
      info.status = 'WAITING_RETURN';
      info.index = 0;
      this.processNextReturn();
      return;
    }

    const payer = info.payers[info.index];
    const receiver = info.receivers[info.index];

    // 检查是否抗贡 ( payers 拥有大王数量 )
    // 规则：如果两个输家（双游）合起来有两张大王，或者单游那个输家自己有两张大王，则可以抗贡
    let hasAntiTribute = false;
    if (info.isDouble) {
      // 双游合起来有2张大王
      const j1 = this.countRedJokers(info.payers[0]);
      const j2 = this.countRedJokers(info.payers[1]);
      if (j1 + j2 === 2) hasAntiTribute = true;
    } else {
      // 单游自己有2张大王
      if (this.countRedJokers(payer) === 2) hasAntiTribute = true;
    }

    if (hasAntiTribute) {
      this.showToast('输家拥有两张红心大王，成功抗贡！本局免贡。');
      this.endTributePhase();
      return;
    }

    // 执行进贡
    if (payer === 0) {
      // 玩家进贡：需要玩家手动选择一张最大的牌
      this.showTributeDialog('请选择您手牌中最大的一张牌进贡（不可选红心逢人配）');
    } else {
      // AI 自动进贡：自动取最大牌
      const tributeCard = this.getTributeCardForAI(payer);
      this.executeTribute(payer, receiver, tributeCard);
    }
  }

  countRedJokers(playerIdx) {
    return this.playerHands[playerIdx].filter(c => c.rank === 'red_joker').length;
  }

  getTributeCardForAI(playerIdx) {
    const hand = this.playerHands[playerIdx];
    // 过滤掉红心逢人配，因为逢人配不能被进贡
    const eligible = hand.filter(c => !isWildCard(c, this.currentRank));
    // 按权重排序，挑出最大的
    const sorted = sortCards(eligible, this.currentRank);
    return sorted[0]; // 最大的一张
  }

  executeTribute(payer, receiver, card) {
    // 从 payer 移除，加到 receiver 并重新排序
    this.removeCardFromPlayer(payer, card);
    this.playerHands[receiver].push(card);
    this.playerHands[receiver] = sortCards(this.playerHands[receiver], this.currentRank);

    this.tributeInfo.paidCards.push({ payer, receiver, card });
    this.showToast(`${this.players[payer].name} 向 ${this.players[receiver].name} 进贡了 【${getCardName(card)}】`);

    this.renderAllHands();
    this.updateCardCounts();

    // 延迟处理下一对进贡
    setTimeout(() => {
      this.tributeInfo.index++;
      this.processNextTribute();
    }, 1500);
  }

  processNextReturn() {
    const info = this.tributeInfo;
    if (info.index >= info.receivers.length) {
      // 所有退贡完成
      this.endTributePhase();
      return;
    }

    const receiver = info.receivers[info.index]; // 之前收贡的人，现在要退贡
    const payer = info.payers[info.index]; // 之前进贡的人，现在要收退贡

    if (receiver === 0) {
      // 玩家退贡：手动选择 10 或以下的牌
      this.showReturnDialog(`请选择一张牌退还给 ${this.players[payer].name}（必须为10或以下）`);
    } else {
      // AI 退贡：自动退还一张小于等于10的最小普通牌
      const returnCard = this.getReturnCardForAI(receiver);
      this.executeReturn(receiver, payer, returnCard);
    }
  }

  getReturnCardForAI(playerIdx) {
    const hand = this.playerHands[playerIdx];
    // 小于等于10的非逢人配
    const eligible = hand.filter(c => {
      const weight = getCardWeight(c.rank, this.currentRank);
      return weight <= 10 && !isWildCard(c, this.currentRank);
    });
    
    // 如果没有，就只能在所有小于10中挑（其实一般都有）
    const sorted = sortCards(eligible.length > 0 ? eligible : hand, this.currentRank);
    return sorted[sorted.length - 1]; // 选最小的
  }

  executeReturn(receiver, payer, card) {
    this.removeCardFromPlayer(receiver, card);
    this.playerHands[payer].push(card);
    this.playerHands[payer] = sortCards(this.playerHands[payer], this.currentRank);

    this.showToast(`${this.players[receiver].name} 向 ${this.players[payer].name} 退贡了 【${getCardName(card)}】`);

    this.renderAllHands();
    this.updateCardCounts();

    setTimeout(() => {
      this.tributeInfo.index++;
      this.processNextReturn();
    }, 1500);
  }

  endTributePhase() {
    // 隐藏进贡弹窗
    document.getElementById('tribute-overlay').classList.remove('show');
    
    // 进贡结束，由进贡最大的一方先出牌；如果抗贡，则由头游先出。
    // 这里做简单处理：由上一局的赢家（第1名）首先出牌
    this.phase = GAME_PHASES.PLAYING;
    this.currentPlayer = this.finishedPlayers[0];
    this.updateStatusUI();
    this.showToast(`进贡阶段结束，开始游戏！由 ${this.players[this.currentPlayer].name} 率先出牌。`);
    
    this.clearPlayZones();
    this.startTurn();
  }

  // 移除卡牌辅助方法
  removeCardFromPlayer(playerIdx, card) {
    const idx = this.playerHands[playerIdx].findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      this.playerHands[playerIdx].splice(idx, 1);
    }
  }

  // 玩家手动进贡弹窗
  showTributeDialog(desc) {
    const overlay = document.getElementById('tribute-overlay');
    const content = document.getElementById('tribute-content');
    const cardsChoice = document.getElementById('tribute-cards-choice');
    const btn = document.getElementById('btn-confirm-tribute');

    content.textContent = desc;
    cardsChoice.innerHTML = '';
    btn.disabled = true;
    this.selectedTributeCard = null;

    // 渲染手牌中可选的最大牌供点击
    const eligible = this.playerHands[0].filter(c => !isWildCard(c, this.currentRank));
    const sorted = sortCards(eligible, this.currentRank);
    
    // 展示前5张最大的
    const top5 = sorted.slice(0, 5);
    top5.forEach(card => {
      const cardEl = this.createCardElement(card);
      cardEl.addEventListener('click', () => {
        // 取消其他选择
        cardsChoice.querySelectorAll('.card').forEach(el => el.classList.remove('selected'));
        cardEl.classList.add('selected');
        this.selectedTributeCard = card;
        btn.disabled = false;
      });
      cardsChoice.appendChild(cardEl);
    });

    overlay.classList.add('show');
  }

  // 玩家手动退贡弹窗
  showReturnDialog(desc) {
    const overlay = document.getElementById('tribute-overlay');
    const content = document.getElementById('tribute-content');
    const cardsChoice = document.getElementById('tribute-cards-choice');
    const btn = document.getElementById('btn-confirm-tribute');

    content.textContent = desc;
    cardsChoice.innerHTML = '';
    btn.disabled = true;
    this.selectedTributeCard = null;

    // 只能选择手牌中 10 或以下的牌
    const eligible = this.playerHands[0].filter(c => {
      return getCardWeight(c.rank, this.currentRank) <= 10 && !isWildCard(c, this.currentRank);
    });

    if (eligible.length === 0) {
      // 万一玩家手牌都极佳（理论上极罕见），放宽条件
      this.playerHands[0].forEach(c => eligible.push(c));
    }

    const sorted = sortCards(eligible, this.currentRank);
    sorted.forEach(card => {
      const cardEl = this.createCardElement(card);
      cardEl.addEventListener('click', () => {
        cardsChoice.querySelectorAll('.card').forEach(el => el.classList.remove('selected'));
        cardEl.classList.add('selected');
        this.selectedTributeCard = card;
        btn.disabled = false;
      });
      cardsChoice.appendChild(cardEl);
    });

    overlay.classList.add('show');
  }

  handleConfirmTribute() {
    if (!this.selectedTributeCard) return;

    const info = this.tributeInfo;
    const overlay = document.getElementById('tribute-overlay');
    overlay.classList.remove('show');

    if (info.status === 'WAITING_TRIBUTE') {
      const payer = info.payers[info.index];
      const receiver = info.receivers[info.index];
      this.executeTribute(payer, receiver, this.selectedTributeCard);
    } else {
      const receiver = info.receivers[info.index];
      const payer = info.payers[info.index];
      this.executeReturn(receiver, payer, this.selectedTributeCard);
    }
  }

  // 渲染所有玩家的手牌/背牌
  renderAllHands() {
    // 渲染玩家手牌
    const playerContainer = document.getElementById('player-cards-container');
    playerContainer.innerHTML = '';
    this.playerHands[0].forEach(card => {
      const cardEl = this.createCardElement(card);
      playerContainer.appendChild(cardEl);
    });

    // 渲染三个 AI 的叠牌效果 (只用来做视觉填充)
    for (let p = 1; p <= 3; p++) {
      const aiContainer = document.getElementById(`cards-stack-${p}`);
      aiContainer.innerHTML = '';
      const cardCount = this.playerHands[p].length;
      
      // AI只做小重叠展示 5 张代表性的背牌
      const showCount = Math.min(cardCount, 5);
      for (let i = 0; i < showCount; i++) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card back';
        cardBack.style.position = 'absolute';
        if (p === 1 || p === 3) {
          // 垂直堆叠
          cardBack.style.top = `${i * 12}px`;
          cardBack.style.left = '0px';
        } else {
          // 水平堆叠
          cardBack.style.left = `${i * 12}px`;
          cardBack.style.top = '0px';
        }
        aiContainer.appendChild(cardBack);
      }
    }
  }

  createCardElement(card) {
    const cardEl = document.createElement('div');
    const isRed = card.suit === SUITS.HEARTS || card.suit === SUITS.DIAMONDS;
    cardEl.className = `card ${isRed ? 'red' : 'black'}`;
    
    // 如果是当前级别的牌
    if (card.rank === this.currentRank) {
      if (card.suit === SUITS.HEARTS) {
        cardEl.classList.add('wild');
      }
    }

    const suitSymbols = {
      [SUITS.HEARTS]: '♥',
      [SUITS.DIAMONDS]: '♦',
      [SUITS.CLUBS]: '♣',
      [SUITS.SPADES]: '♠',
      [SUITS.JOKER]: '🃏'
    };

    let rankLabel = card.rank;
    if (card.rank === 'red_joker') rankLabel = '王';
    if (card.rank === 'black_joker') rankLabel = '王';
    if (card.rank === '10') rankLabel = '10';

    const suitSym = suitSymbols[card.suit] || '';

    cardEl.innerHTML = `
      <div class="card-face">
        <div class="card-corner top-left">
          <span class="card-value">${rankLabel}</span>
          <span class="card-suit-small">${suitSym}</span>
        </div>
        <div class="card-center-suit">${suitSym}</div>
        <div class="card-corner bottom-right">
          <span class="card-value">${rankLabel}</span>
          <span class="card-suit-small">${suitSym}</span>
        </div>
      </div>
    `;

    // 绑定数据用于识别
    cardEl.dataset.suit = card.suit;
    cardEl.dataset.rank = card.rank;

    return cardEl;
  }

  updateCardCounts() {
    for (let p = 0; p < 4; p++) {
      const badge = document.getElementById(`card-count-${p}`);
      badge.textContent = `${this.playerHands[p].length}张`;
      if (this.playerHands[p].length === 0) {
        badge.textContent = '已出完';
        badge.style.background = '#00e676';
      }
    }
  }

  updateStatusUI() {
    document.getElementById('current-rank-label').textContent = this.currentRank;
    document.getElementById('wild-card-label').textContent = this.currentRank;
    document.getElementById('our-level').textContent = getRankName(this.levelTeamA);
    document.getElementById('enemy-level').textContent = getRankName(this.levelTeamB);
    
    let phaseStr = '打牌阶段';
    if (this.phase === GAME_PHASES.DEALING) phaseStr = '发牌阶段';
    if (this.phase === GAME_PHASES.TRIBUTE) phaseStr = '进贡阶段';
    if (this.phase === GAME_PHASES.ROUND_END) phaseStr = '结算阶段';
    document.getElementById('game-phase').textContent = phaseStr;
  }

  // 轮到玩家/AI行动
  startTurn() {
    // 检查当前玩家是否已出完牌
    if (this.playerHands[this.currentPlayer].length === 0) {
      // 已出完，跳过轮次
      this.currentPlayer = (this.currentPlayer + 1) % 4;
      this.startTurn();
      return;
    }

    // 更新头像高亮状态
    for (let p = 0; p < 4; p++) {
      const profile = document.getElementById(`profile-${p}`);
      if (p === this.currentPlayer) {
        profile.classList.add('active');
      } else {
        profile.classList.remove('active');
      }
    }

    // 如果三家都PASS，本轮出牌清空，当前赢家获得首发权
    if (this.passCount === 3) {
      this.showToast(`${this.players[this.currentWinnerIndex].name} 获得出牌权`);
      this.lastPlay = null;
      this.passCount = 0;
      this.clearPlayZones();

      // “接风”规则判定：如果赢家正好出完了牌
      if (this.playerHands[this.currentWinnerIndex].length === 0) {
        // 首发权转移给他的队友！
        const partnerIndex = (this.currentWinnerIndex + 2) % 4;
        this.currentPlayer = partnerIndex;
        this.currentWinnerIndex = partnerIndex;
        this.showToast(`队友接风！由 ${this.players[partnerIndex].name} 重新出牌。`);
        
        // 如果队友也出完了，转移到敌方？这通常是不可能的，因为如果3人都完了，局终。
        this.startTurn();
        return;
      } else {
        this.currentPlayer = this.currentWinnerIndex;
      }
    }

    if (this.currentPlayer === 0) {
      // 玩家回合，激活操作区
      document.getElementById('controls-panel').style.opacity = '1';
      document.getElementById('controls-panel').style.pointerEvents = 'auto';

      // 如果没有上家牌，或者上家就是自己，不出按钮需要禁用 (首发不能点过)
      const isLead = !this.lastPlay || this.lastPlay.type === HAND_TYPES.INVALID || this.lastPlay.playerIndex === 0;
      document.getElementById('btn-pass').disabled = isLead;
    } else {
      // AI 回合，隐藏操作区，并延时模拟AI思考
      document.getElementById('controls-panel').style.opacity = '0';
      document.getElementById('controls-panel').style.pointerEvents = 'none';

      setTimeout(() => {
        this.executeAITurn();
      }, 1400);
    }
  }

  // 玩家出牌逻辑
  handlePlayCards() {
    const container = document.getElementById('player-cards-container');
    const selectedEls = container.querySelectorAll('.card.selected');
    if (selectedEls.length === 0) {
      this.showToast('请先选择要出的牌');
      return;
    }

    // 构建选中卡牌数组
    const cardsToPlay = [];
    selectedEls.forEach(el => {
      cardsToPlay.push({
        suit: el.dataset.suit,
        rank: el.dataset.rank
      });
    });

    // 校验出牌是否合规
    const playResult = canPlay(cardsToPlay, this.lastPlay, this.currentRank);
    if (!playResult) {
      this.showToast('不符合出牌规则或牌不够大！');
      return;
    }

    // 成功出牌！
    // 1. 移除卡牌数据
    cardsToPlay.forEach(card => {
      this.removeCardFromPlayer(0, card);
    });

    // 2. 特效触发 (如果是炸弹)
    if (playResult.type === HAND_TYPES.BOMB) {
      this.triggerBombEffects(playResult.power);
    }

    // 3. 更新出牌区和游戏状态
    this.lastPlay = {
      type: playResult.type,
      power: playResult.power,
      cardCount: playResult.cardCount,
      playerIndex: 0
    };

    this.currentWinnerIndex = 0;
    this.passCount = 0;
    this.renderHandPlay(0, cardsToPlay);
    this.renderAllHands();
    this.updateCardCounts();

    // 4. 检查是否出完牌 (下游/游完)
    if (this.playerHands[0].length === 0) {
      this.playerGoneOut(0);
    }

    // 5. 转移行动权
    if (this.checkRoundEnd()) return;

    this.currentPlayer = 1; // 轮到右手AI
    this.startTurn();
  }

  // 玩家不出
  handlePassTurn() {
    this.passCount++;
    this.renderPass(0);
    
    if (this.checkRoundEnd()) return;

    this.currentPlayer = 1;
    this.startTurn();
  }

  // 玩家重置选择
  handleResetSelection() {
    const container = document.getElementById('player-cards-container');
    container.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  }

  // 整理手牌
  handleSortCards() {
    this.playerHands[0] = sortCards(this.playerHands[0], this.currentRank);
    this.renderAllHands();
  }

  // 玩家提示功能
  handleTipCards() {
    const hand = this.playerHands[0];
    let tipPlay = null;

    if (!this.lastPlay || this.lastPlay.type === HAND_TYPES.INVALID) {
      // 首发，提示最小的单牌或对子
      const groups = extractCardGroups(hand, this.currentRank);
      if (groups.pairs.length > 0) tipPlay = groups.pairs[groups.pairs.length - 1];
      else if (groups.singles.length > 0) tipPlay = [groups.singles[groups.singles.length - 1]];
    } else {
      // 跟牌，使用 AI 跟牌逻辑来帮玩家找可用牌型
      tipPlay = aiFollowPlay(hand, this.lastPlay, this.currentRank);
    }

    if (tipPlay && tipPlay.length > 0) {
      // 先清空玩家选择
      this.handleResetSelection();
      // 在 DOM 中找到对应牌并标红
      const container = document.getElementById('player-cards-container');
      const cardEls = container.querySelectorAll('.card');

      // 提取提示卡牌的标记用于配对，注意野生替代牌
      const remainingTips = [...tipPlay];
      
      cardEls.forEach(el => {
        const suit = el.dataset.suit;
        const rank = el.dataset.rank;
        const matchIdx = remainingTips.findIndex(c => c.suit === suit && c.rank === rank);
        if (matchIdx !== -1) {
          el.classList.add('selected');
          remainingTips.splice(matchIdx, 1);
        }
      });
      this.showToast('已为您推荐最优出牌组合');
    } else {
      this.showToast('没有能压死对方的牌组合！');
    }
  }

  // 执行 AI 回合
  executeAITurn() {
    const hand = this.playerHands[this.currentPlayer];
    const aiPlay = aiChoosePlay(hand, this.lastPlay, this.currentRank, this.currentPlayer, this.currentWinnerIndex);

    if (aiPlay && aiPlay.length > 0) {
      // AI 出牌
      // 1. 验证出牌结果并扣牌
      const playResult = analyzeHand(aiPlay, this.currentRank)[0];
      
      aiPlay.forEach(card => {
        this.removeCardFromPlayer(this.currentPlayer, card);
      });

      // 触发特效
      if (playResult.type === HAND_TYPES.BOMB) {
        this.triggerBombEffects(playResult.power);
      }

      this.lastPlay = {
        type: playResult.type,
        power: playResult.power,
        cardCount: playResult.cardCount,
        playerIndex: this.currentPlayer
      };

      this.currentWinnerIndex = this.currentPlayer;
      this.passCount = 0;

      this.renderHandPlay(this.currentPlayer, aiPlay);
      this.updateCardCounts();
      this.renderAllHands(); // 重新绘制AI卡牌背面堆叠数

      this.showToast(`${this.players[this.currentPlayer].name} 出了 【${playResult.type === HAND_TYPES.BOMB ? playResult.name : getHandTypeName(playResult.type)}】`);

      // 检查出完
      if (this.playerHands[this.currentPlayer].length === 0) {
        this.playerGoneOut(this.currentPlayer);
      }
    } else {
      // AI 过牌
      this.passCount++;
      this.renderPass(this.currentPlayer);
      this.showToast(`${this.players[this.currentPlayer].name} 选择 PASS`);
    }

    if (this.checkRoundEnd()) return;

    // 顺延至下一个玩家
    this.currentPlayer = (this.currentPlayer + 1) % 4;
    this.startTurn();
  }

  // 记录出完牌的人
  playerGoneOut(playerIdx) {
    if (!this.finishedPlayers.includes(playerIdx)) {
      this.finishedPlayers.push(playerIdx);
      let rankStr = '头游 (第1名)';
      if (this.finishedPlayers.length === 2) rankStr = '二游 (第2名)';
      if (this.finishedPlayers.length === 3) rankStr = '三游 (第3名)';
      this.showToast(`🎉 恭喜！${this.players[playerIdx].name} 成为 ${rankStr}！`);
    }
  }

  // 出牌渲染
  renderHandPlay(playerIdx, cards) {
    const zone = document.getElementById(`play-zone-${playerIdx}`);
    zone.innerHTML = '';
    zone.className = `play-zone ${this.getZonePositionClass(playerIdx)}`;

    cards.forEach(card => {
      const cardEl = this.createCardElement(card);
      // 禁止悬停交互
      cardEl.classList.remove('selected');
      cardEl.style.transform = 'none';
      zone.appendChild(cardEl);
    });
  }

  // PASS 渲染
  renderPass(playerIdx) {
    const zone = document.getElementById(`play-zone-${playerIdx}`);
    zone.innerHTML = '<div class="play-hint pass">PASS</div>';
  }

  clearPlayZones() {
    for (let p = 0; p < 4; p++) {
      const zone = document.getElementById(`play-zone-${p}`);
      zone.innerHTML = '';
    }
  }

  getZonePositionClass(playerIdx) {
    if (playerIdx === 0) return 'bottom';
    if (playerIdx === 1) return 'right';
    if (playerIdx === 2) return 'top';
    return 'left';
  }

  // 检查牌局结束
  checkRoundEnd() {
    // 局终判定条件：
    // 1. 同一队伍的两个玩家都出完牌了 (赢了且拿了头游和二游/三游等)
    // 2. 已经有3个玩家出完牌了，剩下的那个人自动成为下游 (末游)

    const teamAFinished = this.finishedPlayers.filter(p => p === 0 || p === 2).length;
    const teamBFinished = this.finishedPlayers.filter(p => p === 1 || p === 3).length;

    // 情况一：某队双人提前全部出完，实现双游
    if (teamAFinished === 2) {
      this.endRound(0); // 我方赢
      return true;
    }
    if (teamBFinished === 2) {
      this.endRound(1); // 敌方赢
      return true;
    }

    // 情况二：已有三人完成，第四人自然落败
    if (this.finishedPlayers.length === 3) {
      // 找出头游属于哪个队伍，那个队伍获胜
      const winner = this.finishedPlayers[0];
      const winTeam = (winner === 0 || winner === 2) ? 0 : 1;
      this.endRound(winTeam);
      return true;
    }

    return false;
  }

  // 结算一局
  endRound(winTeamIdx) {
    this.phase = GAME_PHASES.ROUND_END;
    this.updateStatusUI();

    document.getElementById('controls-panel').style.opacity = '0';
    document.getElementById('controls-panel').style.pointerEvents = 'none';

    // 弹窗结算
    const overlay = document.getElementById('settlement-overlay');
    const title = document.getElementById('settlement-title');
    const content = document.getElementById('settlement-content');

    const first = this.finishedPlayers[0];
    const second = this.finishedPlayers[1];

    let upgradeLevels = 1;
    let desc = '';

    // 双游判定
    const isDoubleUpstream = (first === 0 && second === 2) || (first === 2 && second === 0) ||
                             (first === 1 && second === 3) || (first === 3 && second === 1);

    if (isDoubleUpstream) {
      upgradeLevels = 3;
      desc = `大获全胜！本局完成了 【双游】。升级数：<span style="color:#ffd700;font-weight:bold;font-size:22px;">+3 级</span>。<br>`;
    } else {
      // 队友是不是第二名/第三名出完
      const partnerIndex = (first + 2) % 4;
      const isPartnerSecond = second === partnerIndex;
      if (isPartnerSecond) {
        upgradeLevels = 2;
        desc = `局势顺利！完成了 【头游 + 三游】（队友第2个出完）。升级数：<span style="color:#ffd700;font-weight:bold;font-size:22px;">+2 级</span>。<br>`;
      } else {
        upgradeLevels = 1;
        desc = `险胜！完成了 【头游 + 末游】（对手在队友之前出完）。升级数：<span style="color:#ffd700;font-weight:bold;font-size:22px;">+1 级</span>。<br>`;
      }
    }

    if (winTeamIdx === 0) {
      title.textContent = '🎉 恭喜，本局胜利！';
      title.style.color = '#ffd700';
      this.levelTeamA += upgradeLevels;
      // 级数封顶 A
      if (this.levelTeamA > 14) this.levelTeamA = 14;
      this.currentRank = getRankChar(this.levelTeamA);
    } else {
      title.textContent = '💔 很遗憾，本局落败';
      title.style.color = '#ff5252';
      this.levelTeamB += upgradeLevels;
      if (this.levelTeamB > 14) this.levelTeamB = 14;
      this.currentRank = getRankChar(this.levelTeamB);
    }

    // 格式化展示排名顺序
    const playerRankList = this.finishedPlayers.map((p, idx) => `${idx + 1}. ${this.players[p].name}`).join('<br>');
    content.innerHTML = `
      <p style="margin-bottom: 15px;">${desc}</p>
      <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; text-align:left; font-size:14px; border:1px solid rgba(255,255,255,0.1);">
        <strong>玩家排名顺序：</strong><br>
        ${playerRankList}
      </div>
    `;

    overlay.classList.add('show');
  }

  // 开始下一局
  startNextRound() {
    document.getElementById('settlement-overlay').classList.remove('show');
    
    // 检查是否有队伍过 A 获胜
    if (this.levelTeamA === 14 && this.finishedPlayers[0] === 0) {
      // 玩家打过 A 胜出
      this.showToast('游戏大结局！恭喜您获得最终的掼蛋王者称号！');
      this.levelTeamA = 2;
      this.levelTeamB = 2;
      this.currentRank = '2';
      this.finishedPlayers = [];
    } else if (this.levelTeamB === 14 && (this.finishedPlayers[0] === 1 || this.finishedPlayers[0] === 3)) {
      this.showToast('游戏大结局！对手先打过了 A，您失败了！');
      this.levelTeamA = 2;
      this.levelTeamB = 2;
      this.currentRank = '2';
      this.finishedPlayers = [];
    }

    this.initGame();
  }

  // 炸弹粒子特效与屏幕抖动
  triggerBombEffects(power) {
    const table = document.getElementById('game-table-container');
    table.classList.add('screen-shake');
    setTimeout(() => {
      table.classList.remove('screen-shake');
    }, 400);

    // 产生 30 个小爆炸粒子
    const particleCount = 35;
    const colors = ['#ffeb3b', '#ff9800', '#f44336', '#ff5722', '#ffc107', '#ffffff'];
    
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      
      // 粒子终点偏移量
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 150;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      p.style.setProperty('--tx', `${tx}px`);
      p.style.setProperty('--ty', `${ty}px`);

      // 放置在屏幕中心出牌区偏上位置
      p.style.left = '50%';
      p.style.top = '45%';
      
      table.appendChild(p);

      setTimeout(() => {
        p.remove();
      }, 800);
    }

    // 根据炸弹威力弹出醒目文字
    let text = '炸弹！💥';
    if (power >= 1000) text = '👑 天王炸 👑 毁天灭地！';
    else if (power >= 200) text = '🌈 同花顺！势不可挡！';
    
    this.showToast(text);
  }

  // 提示信息 (Toast)
  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    // 3秒后移除
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 辅助转换工具
function getRankChar(levelValue) {
  const map = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  return map[levelValue];
}

function getRankName(levelValue) {
  return getRankChar(levelValue);
}

function getCardName(card) {
  const suitNames = { [SUITS.HEARTS]: '红桃', [SUITS.DIAMONDS]: '方块', [SUITS.CLUBS]: '梅花', [SUITS.SPADES]: '黑桃', [SUITS.JOKER]: '' };
  let rankName = card.rank;
  if (card.rank === 'red_joker') return '大王';
  if (card.rank === 'black_joker') return '小王';
  return suitNames[card.suit] + rankName;
}

function getHandTypeName(type) {
  const names = {
    [HAND_TYPES.SINGLE]: '单张',
    [HAND_TYPES.PAIR]: '对子',
    [HAND_TYPES.THREE]: '三张',
    [HAND_TYPES.THREE_TWO]: '三带两',
    [HAND_TYPES.STRAIGHT]: '顺子',
    [HAND_TYPES.DOUBLE_STRAIGHT]: '双顺',
    [HAND_TYPES.STEEL_PLATE]: '钢板',
    [HAND_TYPES.BOMB]: '炸弹'
  };
  return names[type] || '未知牌型';
}

// 全局初始化
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GuandanGame();
  window.game.initGame();
});
