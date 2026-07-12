/**
 * main.ts - 游戏入口文件
 */

import './style.css';
import { GameSession } from './session';
import { DOMRenderer } from './renderer';

window.addEventListener('DOMContentLoaded', () => {
  const session = new GameSession();
  // 绑定 DOM 渲染层
  new DOMRenderer(session);
  
  // 注入全局便于测试调试
  (window as any).game = session;
  
  // 启动状态机，开始第一局
  session.initGame();
});
