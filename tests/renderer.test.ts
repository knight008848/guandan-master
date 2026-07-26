// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameSession } from '../src/session';
import { DOMRenderer } from '../src/renderer';

describe('DOMRenderer UI Rendering & Interaction Tests', () => {
  let session: GameSession;
  let renderer: DOMRenderer;

  beforeEach(() => {
    // 载入真实的 index.html DOM 结构进行视图交互测试
    const htmlPath = path.resolve('index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // 取出 <body> 内部的 HTML 节点，并过滤掉标签 script 避免模式加载错误
    let bodyContent = htmlContent.match(/<body>([\s\S]*)<\/body>/i)?.[1] || '';
    bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '');
    document.body.innerHTML = bodyContent;

    session = new GameSession();
    renderer = new DOMRenderer(session);
  });

  it('应该在连续生成超过 1000 条日志时，严格将 DOM 日志行数限制为 1000 行（防内存泄露）', () => {
    const container = document.getElementById('log-content-list');
    expect(container).not.toBeNull();

    // 模拟高频写入 1050 条运行日志
    for (let i = 0; i < 1050; i++) {
      (renderer as any).addGameLog(`测试日志条目 #${i + 1}`, 'info');
    }

    // 断言 DOM 节点数量被严格截断并限制为 1000
    expect(container!.children.length).toBe(1000);
    // 断言最早的前 50 条日志已被弹出淘汰，第一条应为 #51
    expect(container!.firstElementChild?.textContent).toContain('测试日志条目 #51');
    // 断言最新一条为 #1050
    expect(container!.lastElementChild?.textContent).toContain('测试日志条目 #1050');
  });

  it('应该在接收到 remaining_cards_logged 事件时向日志面板正常写入未出完手牌记录', () => {
    const container = document.getElementById('log-content-list');
    expect(container).not.toBeNull();

    // 触发单局结束未出完手牌日志抛出
    session.emit('remaining_cards_logged', [
      { playerIndex: 0, playerName: '你 (玩家)', cards: [], cardCount: 0, formattedCards: '已出完' },
      { playerIndex: 1, playerName: '对手1 (AI)', cards: [], cardCount: 2, formattedCards: '红桃A, 黑桃10' }
    ]);

    const roundEndLogs = container!.querySelectorAll('.log-item.round-end');
    expect(roundEndLogs.length).toBeGreaterThan(0);
    expect(container!.textContent).toContain('单局结算 - 玩家未出完手牌');
    expect(container!.textContent).toContain('对手1 (AI): 剩余 2 张 [红桃A, 黑桃10]');
  });

  it('应该正常响应“运行日志”按钮点击，切换日志面板的显示与关闭状态', () => {
    const panel = document.getElementById('log-panel');
    const toggleBtn = document.getElementById('btn-toggle-log');
    const closeBtn = document.getElementById('btn-close-log');

    expect(panel).not.toBeNull();
    expect(toggleBtn).not.toBeNull();
    expect(closeBtn).not.toBeNull();

    // 初始不包含 show
    expect(panel!.classList.contains('show')).toBe(false);

    // 点击打开面板
    toggleBtn!.click();
    expect(panel!.classList.contains('show')).toBe(true);

    // 点击关闭按钮
    closeBtn!.click();
    expect(panel!.classList.contains('show')).toBe(false);
  });

  it('应该在调用 showToast 时在页面左上角成功插入吐司通知提示', () => {
    const toastContainer = document.getElementById('toast-container');
    expect(toastContainer).not.toBeNull();

    (renderer as any).showToast('出牌不符合规则！');

    const toastItem = toastContainer!.querySelector('.toast');
    expect(toastItem).not.toBeNull();
    expect(toastItem!.textContent).toBe('出牌不符合规则！');
  });
});
