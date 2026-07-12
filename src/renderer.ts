/**
 * renderer.ts - 视图渲染与交互逻辑 (TypeScript版)
 * 纯视图层，通过监听 GameSession 事件进行 UI 绘制及特效呈现
 */

import { Card, Combo, HandType, Suit } from './types';
import { GameSession } from './session';
import { sortCards } from './rules';
import { aiFollowPlay } from './ai';

export class DOMRenderer {
  private session: GameSession;

  // 拖拽多选变量
  private isDragging = false;
  private draggedCards = new Set<HTMLElement>();

  // 进贡退贡暂存选择
  private selectedTributeCard: Card | null = null;

  constructor(session: GameSession) {
    this.session = session;
    this.initEventListeners();
    this.subscribeSessionEvents();
    this.initDragSelect();
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
  }

  // 订阅核心引擎抛出的事件
  private subscribeSessionEvents() {
    this.session.on('deal_started', () => {
      this.showToast('正在洗牌发牌，请稍等...');
      this.clearPlayZones();
      this.hideControls();
      this.updateStatusUI();
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
      document.getElementById('tribute-overlay')?.classList.remove('show');
    });

    this.session.on('turn_started', (playerIdx: number, isLead: boolean) => {
      this.updateStatusUI();
      this.highlightPlayerProfile(playerIdx);

      if (playerIdx === 0) {
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
      this.renderPlayZone(playerIdx, cards);
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

    this.session.on('round_ended', (winnerTeam: number, levelClimbed: number, isDouble: boolean, rankListHtml: string) => {
      this.hideControls();
      this.showSettlementOverlay(winnerTeam, levelClimbed, isDouble, rankListHtml);
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
      playerContainer.innerHTML = '';
      hands[0].forEach(card => {
        const cardEl = this.createCardElement(card);
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
    const isRed = card.suit === 'H' || card.suit === 'D';
    cardEl.className = `card ${isRed ? 'red' : 'black'}`;

    if (card.rank === this.session.currentRank && card.suit === 'H') {
      cardEl.classList.add('wild');
    }

    const suitSymbols: Record<Suit, string> = {
      'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠', 'J': '🃏'
    };

    let rankLabel = card.rank;
    if (card.rank === 'red_joker' || card.rank === 'black_joker') {
      rankLabel = '王';
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
    if (ourLevel) ourLevel.textContent = this.getRankName(this.session.levelTeamA);
    if (enemyLevel) enemyLevel.textContent = this.getRankName(this.session.levelTeamB);

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
    this.session.playerHands[0] = sortCards(this.session.playerHands[0], this.session.currentRank);
    this.renderAllHands(this.session.playerHands);
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
  }

  private handleConfirmTribute() {
    if (!this.selectedTributeCard) return;
    this.session.submitTributeCard(this.selectedTributeCard);
    document.getElementById('tribute-overlay')?.classList.remove('show');
  }

  // 结算弹窗控制
  private showSettlementOverlay(winnerTeam: number, levelClimbed: number, isDouble: boolean, rankListHtml: string) {
    const overlay = document.getElementById('settlement-overlay');
    const title = document.getElementById('settlement-title');
    const content = document.getElementById('settlement-content');

    if (!overlay || !title || !content) return;

    let upgradeDesc = `升级数：<span style="color:#ffd700;font-weight:bold;font-size:22px;">+${levelClimbed} 级</span>`;
    let winDesc = isDouble ? '双游大获全胜！' : '顺利胜出！';

    if (winnerTeam === 0) {
      title.textContent = '🎉 恭喜，我方赢了！';
      title.style.color = '#ffd700';
    } else {
      title.textContent = '💔 很遗憾，本局输了';
      title.style.color = '#ff5252';
      winDesc = '敌方大获全胜！';
    }

    content.innerHTML = `
      <p style="margin-bottom: 15px;">${winDesc} ${upgradeDesc}</p>
      <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; text-align:left; font-size:14px; border:1px solid rgba(255,255,255,0.1);">
        <strong>本局出牌顺序：</strong><br>
        ${rankListHtml}
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

  private renderPlayZone(playerIdx: number, cards: Card[]) {
    const zone = document.getElementById(`play-zone-${playerIdx}`);
    if (zone) {
      zone.innerHTML = '';
      const positions = ['bottom', 'right', 'top', 'left'];
      zone.className = `play-zone ${positions[playerIdx]}`;

      cards.forEach(c => {
        const cardEl = this.createCardElement(c);
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
  private getRankName(val: number): string {
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
}
