/**
 * renderer.ts - 视图渲染与交互逻辑 (TypeScript版)
 * 纯视图层，通过监听 GameSession 事件进行 UI 绘制及特效呈现
 */

import { Card, Combo, HandType, Suit, SettlementType } from './types';
import { GameSession } from './session';
import { sortCards, isWildCard, getCardWeight } from './rules';
import { aiFollowPlay } from './ai';

export class DOMRenderer {
  private session: GameSession;

  // 拖拽多选变量
  private isDragging = false;
  private draggedCards = new Set<HTMLElement>();

  // 进贡退贡暂存选择
  private selectedTributeCard: Card | null = null;

  // 排序模式 (按牌值 / 按花色)
  private sortMode: 'RANK' | 'SUIT' = 'RANK';

  constructor(session: GameSession) {
    this.session = session;
    this.initEventListeners();
    this.subscribeSessionEvents();
    this.initDragSelect();
    this.initPlayerNames();
  }

  // 初始化 DOM 按钮交互
  private initEventListeners() {
    document.getElementById('btn-play')?.addEventListener('click', () => this.handlePlayCards());
    document.getElementById('btn-pass')?.addEventListener('click', () => this.handlePassTurn());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.handleResetSelection());
    document.getElementById('btn-sort')?.addEventListener('click', () => this.handleSortCards());
    document.getElementById('btn-tip')?.addEventListener('click', () => this.handleTipCards());
    document.getElementById('btn-next-round')?.addEventListener('click', () => this.session.startNextRound());
    document.getElementById('btn-confirm-tribute')?.addEventListener('click', () => this.handleConfirmTribute());
    document.getElementById('btn-toggle-log')?.addEventListener('click', () => this.toggleLogPanel());
    document.getElementById('btn-close-log')?.addEventListener('click', () => this.toggleLogPanel());
    document.getElementById('btn-takeover')?.addEventListener('click', () => this.session.enableAutoPlay());
  }

  // 订阅核心引擎抛出的事件
  private subscribeSessionEvents() {
    this.session.on('deal_started', () => {
      this.showToast('正在洗牌发牌，请稍等...');
      document.getElementById('settlement-overlay')?.classList.remove('show');
      this.clearPlayZones();
      this.hideControls();
      this.updateStatusUI();

      const btnTakeover = document.getElementById('btn-takeover') as HTMLButtonElement;
      if (btnTakeover) {
        btnTakeover.disabled = false;
        btnTakeover.textContent = '托管对局';
      }
    });

    this.session.on('autoplay_enabled', () => {
      this.hideControls();
      const btnTakeover = document.getElementById('btn-takeover') as HTMLButtonElement;
      if (btnTakeover) {
        btnTakeover.disabled = true;
        btnTakeover.textContent = '已托管';
      }
      this.showToast('已开启自动接管，AI 替您对局！');
    });

    this.session.on('deal_finished', (hands: Card[][]) => {
      this.renderAllHands(hands);
      this.updateCardCounts(hands);
    });

    this.session.on('tribute_required', (desc: string, eligible: Card[]) => {
      this.showTributeOverlay(desc, eligible, 'TRIBUTE');
    });

    this.session.on('return_required', (desc: string, eligible: Card[]) => {
      this.showTributeOverlay(desc, eligible, 'RETURN');
    });

    this.session.on('tribute_card_paid', (payer: number, receiver: number, card: Card, hands: Card[][]) => {
      this.showToast(`${this.session.players[payer].name} 向 ${this.session.players[receiver].name} 进贡了 【${this.getCardName(card)}】`);
      this.renderAllHands(hands);
      this.updateCardCounts(hands);
    });

    this.session.on('return_card_paid', (receiver: number, payer: number, card: Card, hands: Card[][]) => {
      this.showToast(`${this.session.players[receiver].name} 向 ${this.session.players[payer].name} 退贡了 【${this.getCardName(card)}】`);
      this.renderAllHands(hands);
      this.updateCardCounts(hands);
    });

    this.session.on('tribute_finished', () => {
      const overlay = document.getElementById('tribute-overlay');
      overlay?.classList.remove('show');
      overlay?.classList.remove('tribute-mode');
    });

    this.session.on('turn_started', (playerIdx: number, isLead: boolean) => {
      this.updateStatusUI();
      this.highlightPlayerProfile(playerIdx);

      if (playerIdx === 0 && !this.session.players[0].isAI) {
        this.showControls();
        const btnPass = document.getElementById('btn-pass') as HTMLButtonElement;
        if (btnPass) {
          btnPass.disabled = isLead;
        }
      } else {
        this.hideControls();
      }
    });

    this.session.on('cards_played', (playerIdx: number, cards: Card[], combo: Combo, hands: Card[][]) => {
      this.renderPlayZone(playerIdx, cards, combo);
      this.updateCardCounts(hands);
      if (playerIdx === 0) {
        this.renderAllHands(hands);
      } else {
        this.renderAllHands(hands); // 重绘 AI 的叠牌数
      }

      if (combo.type === 'BOMB') {
        this.triggerBombEffects(combo.power || 0);
      }

      const comboName = combo.type === 'BOMB' ? combo.name : this.getHandTypeName(combo.type);
      this.showToast(`${this.session.players[playerIdx].name} 出了 【${comboName}】`);
    });

    this.session.on('pass_played', (playerIdx: number) => {
      this.renderPassZone(playerIdx);
      this.showToast(`${this.session.players[playerIdx].name} 选择 PASS`);
    });

    this.session.on('trick_ended', () => {
      this.clearPlayZones();
    });

    this.session.on('player_gone_out', (playerIdx: number, ranking: number) => {
      let rankStr = '头游 (第1名)';
      if (ranking === 2) rankStr = '二游 (第2名)';
      if (ranking === 3) rankStr = '三游 (第3名)';
      this.showToast(`🎉 ${this.session.players[playerIdx].name} 走完卡牌，成为本局 【${rankStr}】！`);
    });

    this.session.on('round_ended', (_winnerTeam: number, _levelClimbed: number, _isDouble: boolean, rankListHtml: string, settlement: SettlementType) => {
      this.hideControls();
      this.showSettlementOverlay(rankListHtml, settlement);
    });

    this.session.on('toast', (msg: string) => {
      this.showToast(msg);
    });
  }

  // 初始化鼠标滑动多选
  private initDragSelect() {
    const container = document.getElementById('player-cards-container');
    if (!container) return;

    container.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.draggedCards.clear();

      const cardEl = (e.target as HTMLElement).closest('.card') as HTMLElement;
      if (cardEl && !cardEl.classList.contains('back')) {
        cardEl.classList.toggle('selected');
        this.draggedCards.add(cardEl);
      }
    });

    document.addEventListener('mouseover', (e: MouseEvent) => {
      if (!this.isDragging) return;
      const cardEl = (e.target as HTMLElement).closest('.card') as HTMLElement;
      if (cardEl && !cardEl.classList.contains('back') && cardEl.parentNode === container) {
        if (!this.draggedCards.has(cardEl)) {
          cardEl.classList.toggle('selected');
          this.draggedCards.add(cardEl);
        }
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  // UI渲染辅助
  private renderAllHands(hands: Card[][]) {
    const playerContainer = document.getElementById('player-cards-container');
    if (playerContainer) {
      // 1. 保存之前被选中的卡牌信息
      const selectedCards: Card[] = [];
      playerContainer.querySelectorAll('.card.selected').forEach(el => {
        const htmlEl = el as HTMLElement;
        selectedCards.push({
          suit: htmlEl.dataset.suit as Suit,
          rank: htmlEl.dataset.rank || ''
        });
      });

      playerContainer.innerHTML = '';
      hands[0].forEach(card => {
        const cardEl = this.createCardElement(card);
        // 2. 还原卡牌选中状态
        const matchIdx = selectedCards.findIndex(sc => sc.suit === card.suit && sc.rank === card.rank);
        if (matchIdx !== -1) {
          cardEl.classList.add('selected');
          selectedCards.splice(matchIdx, 1); // 消费该选中状态
        }
        playerContainer.appendChild(cardEl);
      });
    }

    // AI 卡牌折叠数渲染
    for (let p = 1; p <= 3; p++) {
      const aiContainer = document.getElementById(`cards-stack-${p}`);
      if (aiContainer) {
        aiContainer.innerHTML = '';
        const cardCount = hands[p].length;
        const showCount = Math.min(cardCount, 5);
        for (let i = 0; i < showCount; i++) {
          const back = document.createElement('div');
          back.className = 'card back';
          back.style.position = 'absolute';
          if (p === 1 || p === 3) {
            back.style.top = `${i * 12}px`;
            back.style.left = '0px';
          } else {
            back.style.left = `${i * 12}px`;
            back.style.top = '0px';
          }
          aiContainer.appendChild(back);
        }
      }
    }
  }

  private createCardElement(card: Card): HTMLElement {
    const cardEl = document.createElement('div');
    
    // 确定4色牌与大小王对应的 CSS 类
    let suitClass = '';
    if (card.suit === 'H') {
      suitClass = 'suit-h';
    } else if (card.suit === 'S') {
      suitClass = 'suit-s';
    } else if (card.suit === 'D') {
      suitClass = 'suit-d';
    } else if (card.suit === 'C') {
      suitClass = 'suit-c';
    } else if (card.rank === 'red_joker') {
      suitClass = 'red-joker';
    } else if (card.rank === 'black_joker') {
      suitClass = 'black-joker';
    }
    
    cardEl.className = `card ${suitClass}`;

    if (card.rank === this.session.currentRank && card.suit === 'H') {
      cardEl.classList.add('wild');
    }
    if (card.isSubstituted) {
      cardEl.classList.add('substituted');
    }

    const suitSymbols: Record<Suit, string> = {
      'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠', 'J': '🃏'
    };

    let rankLabel = card.rank;
    if (card.rank === 'red_joker') {
      rankLabel = '大王';
    } else if (card.rank === 'black_joker') {
      rankLabel = '小王';
    }

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

    cardEl.dataset.suit = card.suit;
    cardEl.dataset.rank = card.rank;

    return cardEl;
  }

  private updateCardCounts(hands: Card[][]) {
    for (let p = 0; p < 4; p++) {
      const badge = document.getElementById(`card-count-${p}`);
      if (badge) {
        badge.textContent = `${hands[p].length}张`;
        if (hands[p].length === 0) {
          badge.textContent = '已出完';
          badge.style.background = '#00e676';
        } else {
          badge.style.background = '#b71c1c';
        }
      }
    }
  }

  private updateStatusUI() {
    const rankLabel = document.getElementById('current-rank-label');
    const wildLabel = document.getElementById('wild-card-label');
    const ourLevel = document.getElementById('our-level');
    const enemyLevel = document.getElementById('enemy-level');
    const phaseLabel = document.getElementById('game-phase');

    if (rankLabel) rankLabel.textContent = this.session.currentRank;
    if (wildLabel) wildLabel.textContent = this.session.currentRank;
    if (ourLevel) ourLevel.textContent = this.getRankName(this.session.levelTeamA, this.session.failCountTeamA);
    if (enemyLevel) enemyLevel.textContent = this.getRankName(this.session.levelTeamB, this.session.failCountTeamB);

    if (phaseLabel) {
      let phaseStr = '打牌阶段';
      if (this.session.phase === 'DEALING') phaseStr = '发牌阶段';
      if (this.session.phase === 'TRIBUTE') phaseStr = '进贡阶段';
      if (this.session.phase === 'ROUND_END') phaseStr = '结算阶段';
      phaseLabel.textContent = phaseStr;
    }
  }

  // 出牌指令
  private handlePlayCards() {
    const container = document.getElementById('player-cards-container');
    if (!container) return;

    const selectedEls = container.querySelectorAll('.card.selected');
    if (selectedEls.length === 0) {
      this.showToast('请先选择要出的牌');
      return;
    }

    const cardsToPlay: Card[] = [];
    selectedEls.forEach(el => {
      const htmlEl = el as HTMLElement;
      cardsToPlay.push({
        suit: htmlEl.dataset.suit as Suit,
        rank: htmlEl.dataset.rank || ''
      });
    });

    const success = this.session.playCards(cardsToPlay);
    if (!success) {
      this.showToast('出牌不符合规则或必须大过上家牌！');
    }
  }

  private handlePassTurn() {
    this.session.passTurn();
  }

  private handleResetSelection() {
    const container = document.getElementById('player-cards-container');
    container?.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  }

  private handleSortCards() {
    this.sortMode = this.sortMode === 'RANK' ? 'SUIT' : 'RANK';
    this.session.playerHands[0] = this.sortPlayerHand(this.session.playerHands[0], this.session.currentRank, this.sortMode);
    this.renderAllHands(this.session.playerHands);
    this.showToast(this.sortMode === 'RANK' ? '已按牌值整理' : '已按同花/花色整理');
  }

  private sortPlayerHand(cards: Card[], currentRank: string, mode: 'RANK' | 'SUIT'): Card[] {
    if (mode === 'RANK') {
      return sortCards(cards, currentRank);
    } else {
      // 按同花/花色整理：逢人配在最前，其次是大小王，然后按花色分组排序 (红桃 > 黑桃 > 梅花 > 方块)
      return [...cards].sort((a, b) => {
        const aWild = isWildCard(a, currentRank);
        const bWild = isWildCard(b, currentRank);
        if (aWild && !bWild) return -1;
        if (!aWild && bWild) return 1;

        const aJoker = a.rank === 'red_joker' || a.rank === 'black_joker';
        const bJoker = b.rank === 'red_joker' || b.rank === 'black_joker';
        if (aJoker && !bJoker) return -1;
        if (!aJoker && bJoker) return 1;
        if (aJoker && bJoker) {
          return getCardWeight(b.rank, currentRank) - getCardWeight(a.rank, currentRank);
        }

        const suitOrder: Record<Suit, number> = { 'H': 4, 'S': 3, 'C': 2, 'D': 1, 'J': 0 };
        if (a.suit !== b.suit) {
          return suitOrder[b.suit] - suitOrder[a.suit];
        }
        return getCardWeight(b.rank, currentRank) - getCardWeight(a.rank, currentRank);
      });
    }
  }

  private handleTipCards() {
    const hand = this.session.playerHands[0];
    const lastPlay = this.session.lastPlay;

    let tipPlay: Card[] | null = null;
    if (!lastPlay || lastPlay.type === 'INVALID') {
      // 提示最小对子或单张
      const sorted = sortCards(hand, this.session.currentRank);
      tipPlay = [sorted[sorted.length - 1]];
    } else {
      tipPlay = aiFollowPlay(hand, lastPlay, this.session.currentRank);
    }

    if (tipPlay && tipPlay.length > 0) {
      this.handleResetSelection();
      const container = document.getElementById('player-cards-container');
      const cardEls = container?.querySelectorAll('.card');
      const remainingTips = [...tipPlay];

      cardEls?.forEach(el => {
        const htmlEl = el as HTMLElement;
        const suit = htmlEl.dataset.suit;
        const rank = htmlEl.dataset.rank;
        const matchIdx = remainingTips.findIndex(c => c.suit === suit && c.rank === rank);
        if (matchIdx !== -1) {
          htmlEl.classList.add('selected');
          remainingTips.splice(matchIdx, 1);
        }
      });
      this.showToast('已自动选择可压制的牌');
    } else {
      this.showToast('没有牌能大过上家！');
    }
  }

  // 进贡弹窗控制
  private showTributeOverlay(desc: string, eligible: Card[], _mode: 'TRIBUTE' | 'RETURN') {
    const overlay = document.getElementById('tribute-overlay');
    const content = document.getElementById('tribute-content');
    const cardsChoice = document.getElementById('tribute-cards-choice');
    const btn = document.getElementById('btn-confirm-tribute') as HTMLButtonElement;

    if (!overlay || !content || !cardsChoice || !btn) return;

    content.textContent = desc;
    cardsChoice.innerHTML = '';
    btn.disabled = true;
    this.selectedTributeCard = null;

    eligible.forEach(card => {
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
    overlay.classList.add('tribute-mode');
  }

  private handleConfirmTribute() {
    if (!this.selectedTributeCard) return;
    this.session.submitTributeCard(this.selectedTributeCard);
    const overlay = document.getElementById('tribute-overlay');
    overlay?.classList.remove('show');
    overlay?.classList.remove('tribute-mode');
  }

  // 结算弹窗控制
  private showSettlementOverlay(rankListHtml: string, settlement: SettlementType) {
    const overlay = document.getElementById('settlement-overlay');
    const title = document.getElementById('settlement-title');
    const content = document.getElementById('settlement-content');

    if (!overlay || !title || !content) return;

    // 获取内部 dialog-box 并重置其类名
    const dialogBox = overlay.querySelector('.dialog-box') as HTMLElement;
    if (dialogBox) {
      dialogBox.className = 'dialog-box';
      dialogBox.classList.add('settlement-' + settlement.toLowerCase().replace(/_/g, '-'));
    }

    let titleText = '🎉 恭喜，本局获胜！';
    let detailDesc = '';
    let iconHtml = '';

    // 默认的图标定义
    const trophySvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-trophy" viewBox="0 0 100 100" width="80" height="80">
          <defs>
            <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe082" />
              <stop offset="50%" stop-color="#ffd54f" />
              <stop offset="100%" stop-color="#ffb300" />
            </linearGradient>
            <filter id="trophy-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <path d="M 30,25 Q 30,60 50,65 Q 70,60 70,25 Z" fill="url(#gold-grad)" filter="url(#trophy-glow)" />
          <path d="M 30,30 Q 15,30 20,45 Q 25,55 30,50" fill="none" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round" />
          <path d="M 70,30 Q 85,30 80,45 Q 75,55 70,50" fill="none" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round" />
          <path d="M 45,65 L 45,80 L 55,80 L 55,65 Z" fill="url(#gold-grad)" />
          <path d="M 35,80 L 65,80 Q 70,80 70,85 L 30,85 Q 30,80 35,80 Z" fill="#b0bec5" />
          <polygon points="50,35 53,42 60,42 55,47 57,54 50,50 43,54 45,47 40,42 47,42" fill="#fff" />
        </svg>
      </div>
    `;

    const brokenShieldSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-shield-broken" viewBox="0 0 100 100" width="80" height="80">
          <defs>
            <linearGradient id="shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#b0bec5" />
              <stop offset="100%" stop-color="#37474f" />
            </linearGradient>
          </defs>
          <path d="M 50,15 L 20,25 L 20,55 Q 20,80 50,85 Q 80,80 80,55 L 80,25 Z" fill="url(#shield-grad)" stroke="#ff5252" stroke-width="3" />
          <path d="M 50,15 L 48,45 L 53,60 L 50,85" stroke="#ff5252" stroke-width="4" stroke-linecap="round" fill="none" />
        </svg>
      </div>
    `;

    const iceSnowflakeSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-snowflake" viewBox="0 0 100 100" width="80" height="80">
          <defs>
            <linearGradient id="ice-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e0f7fa" />
              <stop offset="100%" stop-color="#00e5ff" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="40" fill="none" stroke="url(#ice-grad)" stroke-width="2" stroke-dasharray="4,4" />
          <path d="M 50,15 L 50,85 M 15,50 L 85,50 M 25,25 L 75,75 M 25,75 L 75,25" stroke="url(#ice-grad)" stroke-width="4" stroke-linecap="round" />
          <path d="M 40,30 L 50,40 L 60,30 M 40,70 L 50,60 L 60,70 M 30,40 L 40,50 L 30,60 M 70,40 L 60,50 L 70,60" fill="none" stroke="url(#ice-grad)" stroke-width="4" stroke-linecap="round" />
        </svg>
      </div>
    `;

    const packageGiftSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-gift" viewBox="0 0 100 100" width="80" height="80">
          <defs>
            <linearGradient id="gift-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a7ffeb" />
              <stop offset="100%" stop-color="#00bfa5" />
            </linearGradient>
          </defs>
          <rect x="25" y="40" width="50" height="40" fill="url(#gift-grad)" rx="5" />
          <rect x="20" y="30" width="60" height="12" fill="#00bfa5" rx="3" />
          <rect x="46" y="30" width="8" height="50" fill="#ff5252" />
          <rect x="20" y="46" width="60" height="8" fill="#ff5252" />
          <path d="M 50,30 C 40,20 40,10 50,20 C 60,10 60,20 50,30 Z" fill="#ff5252" />
        </svg>
      </div>
    `;

    const shieldSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-shield" viewBox="0 0 100 100" width="80" height="80">
          <defs>
            <linearGradient id="shield-win-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#b2dfdb" />
              <stop offset="100%" stop-color="#00695c" />
            </linearGradient>
          </defs>
          <path d="M 50,15 L 25,25 L 25,55 Q 25,80 50,85 Q 75,80 75,55 L 75,25 Z" fill="url(#shield-win-grad)" stroke="#64ffda" stroke-width="3" />
          <path d="M 40,50 L 48,58 L 62,42" stroke="#64ffda" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </div>
    `;

    const warningSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-warning" viewBox="0 0 100 100" width="80" height="80">
          <polygon points="50,15 85,80 15,80" fill="#ff9100" />
          <rect x="47" y="35" width="6" height="25" fill="#142319" rx="2" />
          <circle cx="50" cy="70" r="4.5" fill="#142319" />
        </svg>
      </div>
    `;

    const redExclamationSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-exclamation" viewBox="0 0 100 100" width="80" height="80">
          <polygon points="50,15 85,80 15,80" fill="#ff1744" />
          <rect x="47" y="35" width="6" height="25" fill="#fff" rx="2" />
          <circle cx="50" cy="70" r="4.5" fill="#fff" />
        </svg>
      </div>
    `;

    const grayStarSvg = `
      <div class="settlement-icon-container">
        <svg class="settlement-star" viewBox="0 0 100 100" width="80" height="80">
          <polygon points="50,15 63,40 90,40 68,57 76,85 50,68 24,85 32,57 10,40 37,40" fill="#78909c" />
        </svg>
      </div>
    `;

    // 各种类型的文字及图标分流
    switch (settlement) {
      case 'US_GAME_WIN':
        titleText = '👑 传奇大结局・我方全盘获胜！';
        detailDesc = `<span style="font-weight:bold;color:#ffd700;">恭喜您和队友成功过 A！</span><br>历经风雨，终于打穿了整场游戏的终极防线，取得了全局胜利！`;
        iconHtml = trophySvg;
        break;
      case 'OPPONENT_GAME_WIN':
        titleText = '🥀 遗憾败北・对手通关获胜';
        detailDesc = `很遗憾，对手在打 A 局中表现完美，<span style="font-weight:bold;color:#ff5252;">成功过 A 赢得了最终大结局！</span>`;
        iconHtml = brokenShieldSvg;
        break;
      case 'US_DEGRADED':
        titleText = '❄️ 功败垂成・我方退回 2 级';
        detailDesc = `<span style="font-weight:bold;color:#00e5ff;">我方连续三次打 A 失败</span>，触发退级规则，您的等级牌被<span style="font-weight:bold;color:#ff5252;">强制重置回了 2 级</span>。`;
        iconHtml = iceSnowflakeSvg;
        break;
      case 'OPPONENT_DEGRADED':
        titleText = '🎁 绝地转机・对手退回 2 级';
        detailDesc = `<span style="font-weight:bold;color:#64ffda;">对手连续三次打 A 失败</span>，触发退级惩罚，其等级牌被<span style="font-weight:bold;color:#ff5252;">强制重置回了 2 级</span>！我方吹响反攻号角！`;
        iconHtml = packageGiftSvg;
        break;
      case 'US_UP_3':
        titleText = '🔥 势如破竹・连升三级！';
        detailDesc = `我方包揽头游与二游（双下大获全胜），级别向上突进 <span style="font-weight:bold;color:#ffd700;font-size:20px;">+3 级</span>！`;
        iconHtml = trophySvg;
        break;
      case 'US_UP_2':
        titleText = '⭐ 捷报频传・晋升两级！';
        detailDesc = `我方获得了第一名和第三名（单下获胜），级别大幅晋升 <span style="font-weight:bold;color:#ffd700;font-size:18px;">+2 级</span>！`;
        iconHtml = trophySvg;
        break;
      case 'US_UP_1':
        titleText = '🎉 稳扎稳打・晋升一级！';
        detailDesc = `我方获得了本局第一名（队友垫底），级别稳健上升 <span style="font-weight:bold;color:#ffd700;">+1 级</span>。`;
        iconHtml = trophySvg;
        break;
      case 'OPPONENT_UP_3':
        titleText = '⚠️ 局势严峻・对方连升三级！';
        detailDesc = `对手包揽头游与二游（双下大败），对方级别狂升 <span style="font-weight:bold;color:#ff5252;font-size:20px;">+3 级</span>！`;
        iconHtml = redExclamationSvg;
        break;
      case 'OPPONENT_UP_2':
        titleText = '⚡ 警惕防范・对方晋升两级';
        detailDesc = `对手获得本局第一名与第三名，其级别上升 <span style="font-weight:bold;color:#ffa726;font-size:18px;">+2 级</span>，请注意防守！`;
        iconHtml = warningSvg;
        break;
      case 'OPPONENT_UP_1':
        titleText = '分毫之争・对方晋升一级';
        detailDesc = `对手取下了本局第一名（其队友垫底），其级别小幅上升 <span style="font-weight:bold;color:#ff8a80;">+1 级</span>。`;
        iconHtml = grayStarSvg;
        break;
      case 'US_FAIL_A':
        titleText = '⚔️ 功亏一篑・打 A 失败';
        detailDesc = `我方本局未能成功过 A（累计打 A 失败 <span style="font-weight:bold;color:#ff5252;">${this.session.failCountTeamA} 次</span>，满三次退回 2 级），下局继续打 A！`;
        iconHtml = warningSvg;
        break;
      case 'OPPONENT_FAIL_A':
        titleText = '🛡️ 坚守成功・成功阻击打 A';
        detailDesc = `我方成功阻击了对手的过 A 企图！（对手累计打 A 失败 <span style="font-weight:bold;color:#64ffda;">${this.session.failCountTeamB} 次</span>，满三次退回 2 级），下局继续阻击！`;
        iconHtml = shieldSvg;
        break;
    }

    title.innerHTML = titleText;

    content.innerHTML = `
      ${iconHtml}
      <p style="margin-bottom: 20px; font-size:16px; color:#e0e0e0;">${detailDesc}</p>
      <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; text-align:left; font-size:14px; border:1px solid rgba(255,255,255,0.08);">
        <strong style="color:var(--gold-color);">🏆 本局排名明细：</strong><br>
        <div style="margin-top: 8px; line-height: 1.8;">${rankListHtml}</div>
      </div>
    `;

    overlay.classList.add('show');
  }

  // 界面状态控制
  private showControls() {
    const el = document.getElementById('controls-panel');
    if (el) {
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
    }
  }

  private hideControls() {
    const el = document.getElementById('controls-panel');
    if (el) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }
  }

  private renderPlayZone(playerIdx: number, cards: Card[], combo?: Combo) {
    const zone = document.getElementById(`play-zone-${playerIdx}`);
    if (zone) {
      zone.innerHTML = '';
      const positions = ['bottom', 'right', 'top', 'left'];
      zone.className = `play-zone ${positions[playerIdx]}`;

      cards.forEach(c => {
        let cardToRender = c;
        if (combo && combo.wildRepresent) {
          const sub = combo.wildRepresent.find(w => w.original && w.original.suit === c.suit && w.original.rank === c.rank);
          if (sub) {
            cardToRender = sub;
          }
        }
        const cardEl = this.createCardElement(cardToRender);
        cardEl.classList.remove('selected');
        cardEl.style.transform = 'none';
        zone.appendChild(cardEl);
      });
    }
  }

  private renderPassZone(playerIdx: number) {
    const zone = document.getElementById(`play-zone-${playerIdx}`);
    if (zone) {
      zone.innerHTML = '<div class="play-hint pass">PASS</div>';
    }
  }

  private clearPlayZones() {
    for (let p = 0; p < 4; p++) {
      const zone = document.getElementById(`play-zone-${p}`);
      if (zone) zone.innerHTML = '';
    }
  }

  private highlightPlayerProfile(playerIdx: number) {
    for (let p = 0; p < 4; p++) {
      const prof = document.getElementById(`profile-${p}`);
      if (p === playerIdx) {
        prof?.classList.add('active');
      } else {
        prof?.classList.remove('active');
      }
    }
  }

  private showToast(msg: string) {
    const container = document.getElementById('toast-container');
    if (container) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
    // 同步写入日志区
    this.addGameLog(msg);
  }

  // 炸弹粒子特效
  private triggerBombEffects(power: number) {
    const table = document.getElementById('game-table-container');
    if (!table) return;

    table.classList.add('screen-shake');
    setTimeout(() => table.classList.remove('screen-shake'), 400);

    const colors = ['#ffeb3b', '#ff9800', '#f44336', '#ff5722', '#ffc107', '#ffffff'];
    for (let i = 0; i < 35; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];

      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 150;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      p.style.setProperty('--tx', `${tx}px`);
      p.style.setProperty('--ty', `${ty}px`);

      p.style.left = '50%';
      p.style.top = '45%';

      table.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }

    let text = '炸弹！💥';
    if (power >= 1000) text = '👑 天王炸 👑 毁天灭地！';
    else if (power >= 200) text = '🌈 同花顺！势不可挡！';
    this.showToast(text);
  }

  // 辅助转化器
  private getRankName(val: number, failCount: number = 0): string {
    if (val === 14) {
      return `A${failCount + 1}`;
    }
    const map: Record<number, string> = {
      2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
      11: 'J', 12: 'Q', 13: 'K', 14: 'A'
    };
    return map[val] || '2';
  }

  private getCardName(card: Card): string {
    const suitNames: Record<Suit, string> = { 'H': '红桃', 'D': '方块', 'C': '梅花', 'S': '黑桃', 'J': '' };
    if (card.rank === 'red_joker') return '大王';
    if (card.rank === 'black_joker') return '小王';
    return suitNames[card.suit] + card.rank;
  }

  private getHandTypeName(type: HandType): string {
    const names: Record<HandType, string> = {
      'SINGLE': '单张', 'PAIR': '对子', 'THREE': '三张', 'THREE_TWO': '三带两',
      'STRAIGHT': '顺子', 'DOUBLE_STRAIGHT': '双顺', 'STEEL_PLATE': '钢板', 'BOMB': '炸弹', 'INVALID': '未知'
    };
    return names[type] || '未知';
  }

  // 动态更新面板玩家名字为 5 字随机名称
  private initPlayerNames() {
    for (let p = 0; p < 4; p++) {
      const nameEl = document.querySelector(`#profile-${p} .player-name`);
      if (nameEl) {
        nameEl.textContent = this.session.players[p].name;
      }
    }
  }

  // 展开/收起日志面板
  private toggleLogPanel() {
    const panel = document.getElementById('log-panel');
    panel?.classList.toggle('show');
  }

  // 向日志面板写入单条记录
  private addGameLog(msg: string, type: 'info' | 'tribute' | 'round-end' = 'info') {
    const container = document.getElementById('log-content-list');
    if (container) {
      const item = document.createElement('div');
      item.className = `log-item ${type}`;

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      item.innerHTML = `<span style="color: #64ffda; font-weight: bold; margin-right: 5px;">[${timeStr}]</span> ${msg}`;
      container.appendChild(item);

      // 自动滚到底部
      container.scrollTop = container.scrollHeight;
    }
  }
}
