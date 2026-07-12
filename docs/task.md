# 任务清单 - 掼蛋大师 (TODO List)

为了将当前的开源项目完美对齐我们设计的 PRD 与系统架构，以下是接下来的开发任务清单：

## 🚀 已完成事项 (Completed)
- [x] 将 PRD 文档 ([prd.md](file:///c:/Users/xx/.gemini/antigravity-ide/scratch/guandan-master/docs/prd.md)) 归档至代码仓库中
- [x] 将架构设计文档 ([architecture.md](file:///c:/Users/xx/.gemini/antigravity-ide/scratch/guandan-master/docs/architecture.md)) 归档至代码仓库中
- [x] 配置 GitHub Pages 部署路径基准并编写 GitHub Actions 自动部署流水线

---

## 🛠 核心规则校验严谨化 (Rules & Tribute Constraints)
- [ ] **严格进贡规则限制**：
  - 修改 `src/session.ts` 中的进贡逻辑。玩家进贡时，计算玩家手牌中最大点数的非逢人配卡牌，仅允许玩家在最高点数对应的卡牌中选择（多张同点数可选不同花色），杜绝投机性选择小牌进贡。

---

## 🤖 AI 智能分级机制 (AI Levels)
- [ ] **AI 行为模型分级**：
  - 在 `src/ai.ts` 中实现：
    - **初级 AI**：策略偏简单，有大牌就出，优先出单牌/对子，不防守。
    - **中级 AI**：即当前的决策树（保持炸弹和顺子完整度，配合队友接风，对方剩牌少时用炸弹拦截）。
    - **高级 AI**：能够记忆并推算场上已出的大牌、王牌数量，并基于剩余卡牌分布做深度防守或反击。
- [ ] **难度选择 UI 界面**：
  - 在顶栏或游戏主界面中增加难度选择控件（初级/中级/高级），并将其状态同步给 `GameSession` 和 AI 决策模块。

---

## 🎵 音效与多媒体体验 (Audio & UX)
- [ ] **音效文件导入与配置**：
  - 寻找或录制适合的卡牌音效（发牌声、出牌声、PASS声、炸弹爆炸声、结算背景音乐）。
- [ ] **音效引擎实现**：
  - 在 `src/renderer.ts` 中利用 `Web Audio API` 或 `HTMLAudioElement` 在对应的事件发生时（如 `deal_card`、`cards_played`、`pass_played`、`round_ended`）播放对应的音效。
- [ ] **静音开关**：
  - 在 UI 界面添加一个音量/静音切换按钮。
