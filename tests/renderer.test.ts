// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameSession } from '../src/session';
import { DOMRenderer } from '../src/renderer';

// 一次性只在文件全域从磁盘读取 1 次 index.html，极大提升 DOM 测试性能
const htmlContent = fs.readFileSync(path.resolve('index.html'), 'utf-8');
const bodyTemplate = (htmlContent.match(/<body>([\s\S]*)<\/body>/i)?.[1] || '').replace(
  /<script[\s\S]*?<\/script>/gi,
  ''
);

describe('DOMRenderer UI Rendering & Interaction Tests', () => {
  let session: GameSession;
  let renderer: DOMRenderer;

  beforeEach(() => {
    vi.useFakeTimers();

    // 内存快速重置 DOM 树结构
    document.body.innerHTML = bodyTemplate;

    session = new GameSession();
    renderer = new DOMRenderer(session);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('应该在连续生成超过日志上限时，严格将 DOM 日志行数限制在指定数量（防内存泄露）', () => {
    const container = document.getElementById('log-content-list');
    expect(container).not.toBeNull();

    const originalMax = (DOMRenderer as any).MAX_LOG_LINES;
    (DOMRenderer as any).MAX_LOG_LINES = 10;

    for (let i = 0; i < 15; i++) {
      (renderer as any).addGameLog(`测试日志条目 #${i + 1}`, 'info');
    }

    expect(container!.children.length).toBe(10);
    expect(container!.firstElementChild?.textContent).toContain('测试日志条目 #6');
    expect(container!.lastElementChild?.textContent).toContain('测试日志条目 #15');

    (DOMRenderer as any).MAX_LOG_LINES = originalMax;
  });

  it('应该在用户勾选卡牌时，依据 canPlay 规则动态更新出牌按钮 (#btn-play) 的 disabled 状态', () => {
    const playBtn = document.getElementById('btn-play') as HTMLButtonElement;
    expect(playBtn).not.toBeNull();

    session.phase = 'PLAYING';
    session.currentPlayer = 0;
    session.playerHands[0] = [
      { suit: 'S', rank: '5' },
      { suit: 'H', rank: '5' },
      { suit: 'D', rank: 'K' }
    ];

    (renderer as any).renderAllHands(session.playerHands);

    const cardElements = document.querySelectorAll('#player-cards-container .card');
    expect(cardElements.length).toBe(3);

    // 初始没有任何卡牌被选中 -> 出牌按钮为 disabled
    renderer.updatePlayButtonState();
    expect(playBtn.disabled).toBe(true);

    // 模拟勾选一张 5 和一张 K (非合法牌型 5 + K)
    (cardElements[0] as HTMLElement).classList.add('selected');
    (cardElements[2] as HTMLElement).classList.add('selected');
    renderer.updatePlayButtonState();

    expect(playBtn.disabled).toBe(true);

    // 改为勾选对 5 (5 + 5)
    (cardElements[2] as HTMLElement).classList.remove('selected');
    (cardElements[1] as HTMLElement).classList.add('selected');
    renderer.updatePlayButtonState();

    expect(playBtn.disabled).toBe(false);
  });

  it('应该在用户在非法选择下强行点击出牌时展示 Toast 错误提示', () => {
    const playBtn = document.getElementById('btn-play') as HTMLButtonElement;
    const toastContainer = document.getElementById('toast-container');
    expect(playBtn).not.toBeNull();
    expect(toastContainer).not.toBeNull();

    session.phase = 'PLAYING';
    session.currentPlayer = 0;
    session.playerHands[0] = [
      { suit: 'S', rank: '3' },
      { suit: 'H', rank: '7' }
    ];

    (renderer as any).renderAllHands(session.playerHands);

    const cardElements = document.querySelectorAll('#player-cards-container .card');
    (cardElements[0] as HTMLElement).classList.add('selected');
    (cardElements[1] as HTMLElement).classList.add('selected');

    playBtn.click();

    const toast = toastContainer!.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('不符合规则');
  });

  it('应该在点击“提示”和“整理”按钮时自动更新选牌状态和手牌排序模式', () => {
    const tipBtn = document.getElementById('btn-tip') as HTMLButtonElement;
    const sortBtn = document.getElementById('btn-sort') as HTMLButtonElement;
    const toastContainer = document.getElementById('toast-container');

    session.phase = 'PLAYING';
    session.currentRank = '2';
    session.lastPlay = { type: 'SINGLE', power: 8, cardCount: 1, playerIndex: 1 };
    session.playerHands[0] = [
      { suit: 'S', rank: '5' },
      { suit: 'S', rank: '10' },
      { suit: 'H', rank: '2' }
    ];

    (renderer as any).renderAllHands(session.playerHands);

    // 提示按钮
    tipBtn.click();
    expect(toastContainer!.textContent).toContain('已自动选择');

    // 整理按钮
    sortBtn.click();
    expect((renderer as any).sortMode).toBe('SUIT');
  });

  it('应该在点击“托管”按钮时激活 AI 接管并更新按钮 UI 状态', () => {
    const takeoverBtn = document.getElementById('btn-takeover') as HTMLButtonElement;
    const toastContainer = document.getElementById('toast-container');

    session.players[0].isAI = false;

    takeoverBtn.click();
    expect(session.players[0].isAI).toBe(true);
    expect(takeoverBtn.disabled).toBe(true);
    expect(takeoverBtn.textContent).toBe('已托管');
    expect(toastContainer!.textContent).toContain('自动接管');
  });

  it('应该在触发 round_ended 事件时成功渲染结算弹窗与对应的样式图标', () => {
    const overlay = document.getElementById('settlement-overlay');
    const title = document.getElementById('settlement-title');

    session.emit('round_ended', 0, 3, true, '<div>结算列表</div>', 'US_UP_3');

    expect(overlay!.classList.contains('show')).toBe(true);
    expect(title!.textContent).toContain('连升三级');
  });



  it('应该在点击“重选”按钮 (#btn-reset) 时批量清空手牌选中状态', () => {
    const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();

    session.playerHands[0] = [
      { suit: 'S', rank: '3' },
      { suit: 'H', rank: '7' }
    ];
    (renderer as any).renderAllHands(session.playerHands);

    const cardEls = document.querySelectorAll('#player-cards-container .card');
    cardEls.forEach((el) => el.classList.add('selected'));
    expect(document.querySelectorAll('#player-cards-container .card.selected').length).toBe(2);

    resetBtn.click();
    expect(document.querySelectorAll('#player-cards-container .card.selected').length).toBe(0);
  });

  it('应该在 turn_started 事件触发时根据领打/跟牌状态正确更新过牌按钮 (#btn-pass) 的 disabled 状态', () => {
    const controls = document.getElementById('controls-panel');
    const btnPass = document.getElementById('btn-pass') as HTMLButtonElement;
    expect(controls).not.toBeNull();
    expect(btnPass).not.toBeNull();

    session.players[0].isAI = false;

    // 1. 领打（isLead = true）-> 必须出牌，禁止过牌 (pass.disabled = true)
    session.emit('turn_started', 0, true);
    expect(controls!.style.opacity).toBe('1');
    expect(btnPass.disabled).toBe(true);

    // 2. 跟牌（isLead = false）-> 可以过牌 (pass.disabled = false)
    session.emit('turn_started', 0, false);
    expect(btnPass.disabled).toBe(false);
  });


  it('应该在触发 tribute_required 事件时弹出进贡选择框，选择卡牌后允许提交', () => {
    const tributeOverlay = document.getElementById('tribute-overlay');
    const cardsChoice = document.getElementById('tribute-cards-choice');
    const confirmBtn = document.getElementById('btn-confirm-tribute') as HTMLButtonElement;
    expect(tributeOverlay).not.toBeNull();
    expect(cardsChoice).not.toBeNull();
    expect(confirmBtn).not.toBeNull();

    session.emit('tribute_required', '请选择一张最大的牌进贡', [
      { suit: 'S', rank: 'A' },
      { suit: 'S', rank: 'K' }
    ]);

    expect(tributeOverlay!.classList.contains('show')).toBe(true);
    expect(confirmBtn.disabled).toBe(true);

    const tributeCardEls = cardsChoice!.querySelectorAll('.card');
    expect(tributeCardEls.length).toBe(2);

    (tributeCardEls[0] as HTMLElement).click();
    expect(confirmBtn.disabled).toBe(false);
    expect((renderer as any).selectedTributeCard).toEqual({ suit: 'S', rank: 'A' });

    confirmBtn.click();
    expect(tributeOverlay!.classList.contains('show')).toBe(false);
  });

  it('应该在触发 round_ended 事件时成功渲染退级与对手大结局弹窗类型', () => {
    const overlay = document.getElementById('settlement-overlay');
    const dialogBox = overlay?.querySelector('.dialog-box');
    const title = document.getElementById('settlement-title');

    // 1. 我方退级 (US_DEGRADED)
    session.emit('round_ended', 1, 0, false, '<div>结算列表</div>', 'US_DEGRADED');
    expect(dialogBox!.classList.contains('settlement-us-degraded')).toBe(true);
    expect(title!.textContent).toContain('退回 2 级');

    // 2. 对手过 A 大结局 (OPPONENT_GAME_WIN)
    session.emit('round_ended', 1, 0, false, '<div>结算列表</div>', 'OPPONENT_GAME_WIN');
    expect(dialogBox!.classList.contains('settlement-opponent-game-win')).toBe(true);
    expect(title!.textContent).toContain('遗憾败北');
  });


  it('应该在触发 remaining_cards_logged 事件时成功在 DOM 日志面板中注入各玩家未出完手牌节点', () => {
    const logContentList = document.getElementById('log-content-list');

    session.emit('remaining_cards_logged', [
      {
        playerIndex: 0,
        playerName: '你 (玩家)',
        cards: [{ suit: 'S', rank: 'A' }],
        cardCount: 1,
        formattedCards: '黑桃A'
      },
      { playerIndex: 1, playerName: '对手1 (AI)', cards: [], cardCount: 0, formattedCards: '无' }
    ]);

    expect(logContentList!.textContent).toContain('🂠 【单局结算 - 玩家未出完手牌】');
    expect(logContentList!.textContent).toContain('你 (玩家): 剩余 1 张 [黑桃A]');
  });
});




