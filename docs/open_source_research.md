# 掼蛋开源实现与技术评估报告

> 生成日期：2026-07-14（集成版）
> 涵盖：通用架构分析 + 轻量级单机TS原生技术路线

本报告聚焦于**掼蛋智能 AI 实现**、**卡牌本地渲染**以及**游戏 UI/动效提升**三大核心方向。通过深度解析 GitHub 上的热门开源项目，为本项目后续的迭代升级提供详尽的技术评估与方案选择。

---

## 一、10个开源项目全景扫描

| # | 项目名称 | 语言 | 定位 | AI方式 | UI/UX | 架构 |
|---|---------|------|------|:------:|:-----:|:----:|
| 1 | **OpenGuanDan** (NJUPT) | Python | 掼蛋AI研究基准平台 | RL+博弈论 | CLI | 模拟器+Agent |
| 2 | **clawguandan** | TS/CLI | AI原生掼蛋（LLM驱动） | LLM API | CLI+Web | C/S + Skill |
| 3 | **Si-xiyu/GuanDan** | C++/Qt | 掼蛋完整桌面游戏 | 启发式规则 | ⭐⭐⭐⭐⭐ Qt GUI | MVC |
| 4 | **AltmanD/Guandan** | Python | 掼蛋游戏引擎 | 随机/启发式 | CLI | 纯引擎 |
| 5 | **LSTM-Kirigaya/NUAA** | Python | 深度学习掼蛋AI | 模仿+强化学习 | CLI | 训练+评估 |
| 6 | **DouZero** (Kwai) | Python | 斗地主AI标杆 | DMC强化学习 | CLI | 自对弈训练 |
| 7 | **CardHouse** (Pipeworks) | C#/Unity | 通用卡牌游戏框架 | — | ⭐⭐⭐⭐⭐ Unity | 组件式框架 |
| 8 | **gofishing-game** | Go | 棋牌游戏后端 | — | — | 微服务 |
| 9 | **Kagetsu** | Rust | 日本麻将TUI | 规则AI | ⭐⭐⭐⭐ TUI | 函数式引擎 |
| 10 | **ZhouWeikuan/DouDiZhu** | C++/Lua | 斗地主完整游戏 | 权重评分AI | ⭐⭐⭐⭐ Cocos | 完整游戏 |

### 各项目可复用资产分析（轻量级TS视角）

| # | 项目 | 可复用的核心资产 | 可借鉴的设计 | 不适合的部分 |
|---|------|----------------|-------------|-------------|
| 1 | **OpenGuanDan** | 完整规则引擎逻辑、牌型判断算法、Agent接口设计 | 引擎与AI分离架构、回合状态机 | Python代码（需翻译为TS）、并行模拟器 |
| 2 | **clawguandan** | 核心游戏流程、出牌合法性校验 | TS项目结构、模块化核心逻辑 | HTTP API、LLM Skill系统 |
| 3 | **Si-xiyu/GuanDan** | MVC架构设计、UI与逻辑解耦方式 | Controller调度模式、牌型渲染思路 | C++/Qt代码、桌面窗口框架 |
| 4 | **AltmanD/Guandan** | 完整的掼蛋规则实现、进贡还贡逻辑 | 可作为TS翻译的参考蓝本 | Python代码 |
| 5 | **LSTM-Kirigaya/NUAA** | 策略评估思路、手牌价值函数 | 启发式评分函数的数学结构 | Python训练框架、PyTorch依赖 |
| 6 | **DouZero** | 动作分解思路（牌型分类→选牌） | 两阶段决策范式（Type→Cards） | Python+PyTorch、DMC训练 |
| 7 | **CardHouse** | 卡牌交互设计模式、拖拽处理 | CardDrag/CardGroup/CardLayout组件设计 | C#/Unity依赖 |
| 8 | **gofishing-game** | 游戏房间管理流程（可在本地简化） | 游戏状态机、回合管理流程 | Go语言、微服务架构、网络通信 |
| 9 | **Kagetsu** | **纯函数式引擎（最高参考价值）**、403个测试 | 纯函数无副作用设计、Mental Poker理念 | Rust代码、QUIC传输 |
| 10 | **ZhouWeikuan/DouDiZhu** | 权重AI评分算法、牌力评估体系 | 可翻译为TS的纯算法AI | C++/Lua代码、Cocos引擎 |

---

## 二、掼蛋智能 AI 本地算法评估

掼蛋作为四人非完全信息博弈游戏，其 AI 设计的难点在于：**手牌组合穷举空间大**、**逢人配（主牌红桃）的万能替代**以及**强烈的队友合作对抗属性**。

开源项目中主要存在以下三种智能实现方式：

### 1. 启发式规则树与状态判定（推荐本地首选）
*   **代表仓库**：`Si-xiyu/GuanDan`、`ZhouWeikuan/DouDiZhu`（权重体系）、`AltmanD/Guandan`
*   **技术框架**：纯代码逻辑，基于决策树的条件分支判断。
*   **核心逻辑拆解**：
    1.  **手牌预拆分 (Hand Parsing)**：发牌完毕后，算法首先将手牌整理为单张、对子、三带二、三顺（钢板）、单顺、双顺、炸弹等组合的集合，并计算最少的"手路数"。
    2.  **队友配合机制 (Teammate Synergy)**：
        - 每次跟牌时判断当前出大牌的赢家是不是队友。若是队友，则 AI 倾向于 PASS 或垫最小牌，保护队友牌权。
        - "接风"判断：若队友打完最后一张牌，AI 优先打出队友可能喜欢的牌型。
    3.  **防守与阻击 (Defense & Bombing)**：
        - 实时监控对手剩余卡牌数量。当对手手牌 ≤5 张时触发"绝杀拦截"状态。
    4.  **局内记牌器 (Card Tracker)**：记录所有王牌和级牌。当大牌出尽时推算出自己手上牌的控制权。
*   **本地落地评估**：最适合本项目的方案。执行速度极快（<1ms），零第三方依赖。
*   **TS参考来源**：ZhouWeikuan的权重评分体系 + LSTM-Kirigaya的评估函数结构。

### 2. 蒙特卡洛树搜索（MCTS / IS-MCTS）
*   **代表仓库**：部分通用扑克博弈项目。
*   **技术框架**：非完全信息蒙特卡洛树搜索。
*   **核心逻辑**：AI根据场上已知出过的牌和自己手牌，对剩下的卡牌进行随机分配（Determinization），在该模拟世界中进行数万次快速自我对局模拟，统计各个出牌动作的最终胜率。
*   **本地落地评估**：复杂度高，纯TS在浏览器单线程中执行数万次模拟会导致UI卡顿，需使用Web Workers后台多线程推演，适合后续进阶开发。

### 3. 深度学习与强化学习模型
*   **代表仓库**：`OpenGuanDan`（集成DanZero、GuanZero）
*   **技术框架**：PyTorch(训练) → ONNX(部署) → ONNX Runtime Web(本地推理)
*   **核心逻辑**：将对局状态编码为张量，通过神经网络预测每个出牌动作的期望收益值。
*   **本地落地评估**：智能化程度极高，但模型文件较大（10MB~50MB），且需前期大量离线训练支持。**本项目不采用此路线**（不符合轻量级无外部模型约束）。

---

## 三、AI算法设计：纯TypeScript实现路径

### 核心约束
- ❌ 无Python运行时 / 无PyTorch/ONNX/TensorFlow / 无LLM API
- ✅ 纯TypeScript算法 / 权重/评分系统 / MCTS / 对抗搜索

### AI系统分层

```
┌─────────────────────────────────────────┐
│  AI System                              │
│  ┌─────────────────────────────────┐    │
│  │  Layer 1: 合法动作生成器         │    │ （基于规则）
│  │  所有合法的出牌组合（≤80种/轮）    │    │
│  └──────────────┬──────────────────┘    │
│                 ↓                       │
│  ┌─────────────────────────────────┐    │
│  │  Layer 2: 快速评估函数           │    │ （启发式）
│  │  牌型强度 + 剩余牌数 + 级牌状态  │    │
│  └──────────────┬──────────────────┘    │
│                 ↓                       │
│  ┌─────────────────────────────────┐    │
│  │  Layer 3: 搜索策略（选择器）     │    │
│  │  ┌───────┐ ┌──────┐ ┌───────┐ │    │
│  │  │启发式  │ │MCTS  │ │混合   │ │    │
│  │  │贪心    │ │搜索  │ │策略   │ │    │
│  │  └───────┘ └──────┘ └───────┘ │    │
│  └──────────────┬──────────────────┘    │
│                 ↓                       │
│  ┌─────────────────────────────────┐    │
│  │  Layer 4: 队友/对手建模         │    │ （可选进阶）
│  │  基于出牌历史的贝叶斯推断        │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 评估函数设计（TS实现）

```typescript
interface Card { rank: number; suit: Suit; }
type ComboType = 'single' | 'pair' | 'triple' | 'triple_plus' 
  | 'straight' | 'flush' | 'fullhouse' | 'four_plus' 
  | 'straight_flush' | 'bomb' | 'joker_bomb';

// 牌力评估函数（参考ZhouWeikuan权重AI理念）
function evaluateHand(cards: Card[], levelCard: number): number {
  let score = 0;
  // 1. 级牌加权
  score += cards.filter(c => c.rank === levelCard).length * 50;
  // 2. 炸弹加权（掼蛋核心）
  const bombs = findAllBombs(cards);
  score += bombs.length * 300;
  bombs.forEach(b => score += b.length * 20);
  // 3. 手牌剩余惩罚
  score -= cards.length * 10;
  // 4. 牌型分布加分
  score += evaluatePattern(cards);
  return score;
}
```

### AI难度分级

| 难度 | 名称 | 算法 | 搜索深度 | 单步耗时 |
|:----:|:----|:-----|:--------:|:--------:|
| 1 | 新手 | 纯贪心（最大牌策略） | 0 | <1ms |
| 2 | 入门 | 启发式评分+简单出牌逻辑 | 1 | <5ms |
| 3 | 进阶 | 启发式 + 基于规则的搭档配合 | 1 | <10ms |
| 4 | 专家 | MCTS + 启发式评估 | 3 | ~50ms |
| 5 | 大师 | MCTS + 对手模型 + 历史推断 | 3-5 | ~200ms |

### AI算法评分对比（TS原生实现）

| AI方案 | 实现难度 | AI强度 | 性能 | 代码量 | 评分 |
|--------|:-------:|:------:|:----:|:-----:|:----:|
| A. 纯随机出牌 | 1天 | ★☆☆☆☆ | 即时 | ~30行 | 2/10 |
| B. 贪心启发式（最大牌/最小牌） | 2天 | ★★☆☆☆ | 即时 | ~100行 | 4/10 |
| C. 权重评分AI（参考ZhouWeikuan） | 1周 | ★★★☆☆ | <5ms | ~500行 | 6/10 |
| D. C + 牌型组合枚举器 | 1.5周 | ★★★☆☆ | <10ms | ~800行 | 6.5/10 |
| **E. D + 多轮规划（前瞻1-2轮）** | **2周** | **★★★★☆** | **<30ms** | **~1200行** | **7.5/10** |
| F. E + MCTS搜索（参考DouZero两阶段） | 3周 | ★★★★☆ | ~100ms | ~2000行 | 8/10 |
| G. F + 对手出牌模式建模（贝叶斯推断） | 4周 | ★★★★★ | ~200ms | ~3000行 | 9/10 |
| H. G + 自对弈策略迭代（无需外部模型） | 6周 | ★★★★★ | ~200ms | ~4000行 | 9.5/10 |

**推荐起点**：方案E（权重评分+多轮规划），平衡实现成本与AI强度。

---

## 四、卡牌本地渲染与贴图重构评估

开源项目通常采用以下三种图像渲染模式：

### 1. 静态雪碧图定位 (Static Sprite Sheet + CSS Offset)
*   **代表仓库**：`jiaguo1000/eggbomb`、各类网页棋牌游戏
*   **实现机制**：预先准备 `cards_sprite.png` (13列×5行卡牌矩阵)。整个游戏只需1次图片网络请求，GPU通过纹理坐标改变渲染切片。
*   **CSS核心定位公式**：
  ```css
  .card-face {
    background-image: url('cards_sprite.png');
    background-size: 1300% 500%;
    background-position: calc(var(--col) * (100% / 12)) calc(var(--row) * (100% / 4));
  }
  ```

### 2. 客户端 Canvas 动态合成雪碧图 (零请求方案)
*   **技术框架**：HTML5 Canvas 2D Context
*   **实现机制**：游戏启动时在内存Canvas上绘制54张卡牌，生成动态Base64雪碧图。零网络图片请求，完全代码生成，分辨率独立，易于支持多主题切换。

### 3. 独立 SVG 矢量图资源加载
*   **优势**：矢量格式，任何尺寸都清晰锐利
*   **劣势**：首次加载需55次网络请求，弱网环境卡牌逐个显现

### 渲染方案对比

| 方案 | 网络请求 | 清晰度 | 主题切换 | 实现复杂度 |
|:----|:-------:|:-----:|:--------:|:---------:|
| 雪碧图(Static) | 1次 | 依赖贴图分辨率 | 需替换整图 | 低 |
| Canvas动态合成 | **0次** | 矢量级 | 一行代码切换 | 中 |
| 独立SVG | 55次 | 极高 | 按文件替换 | 低 |
| **Pixi.js渲染** | 按需加载 | WebGL级 | 内置支持 | 中 |

---

## 五、UI 与动效细节提升方案

### 1. 发牌飞行动效
从牌桌中心创建临时飞行卡牌，利用 `requestAnimationFrame` 计算发牌中心到四方座位的X/Y坐标差，以缓出曲线飞向座位。

### 2. 出牌区与操作面板自适应
- **负边距重叠**：CSS flex布局，`margin-right: -42px` 叠放手牌
- **Hover凸显**：`transform: translateY(-24px) scale(1.05)` + `z-index: 100`
- **动态重叠度**：TS代码根据手牌张数动态计算 `--card-gap` CSS变量

### 3. 特殊牌型炸弹特效
- **震动特效**：CSS帧动画 `@keyframes shake` 在400ms内做随机位移偏移
- **粒子系统**：动态生成20-30个彩色 `.particle` DOM节点随机放射

---

## 六、轻量级TS单机版技术路线（5条路线）

### 路线A：纯Canvas + 原生TS（最轻量）
**技术栈**：TypeScript + HTML5 Canvas + Vite

**架构**：
```
src/
├── core/           # 纯逻辑层（零依赖）
│   ├── engine.ts   # 函数式游戏引擎
│   ├── card.ts     # 牌型定义与比较
│   ├── rules.ts    # 掼蛋完整规则
│   └── evaluator.ts
├── ai/             # AI决策层（纯算法）
│   ├── heuristic.ts
│   ├── mcts.ts
│   └── strategy.ts
├── ui/             # Canvas渲染层
│   ├── renderer.ts
│   ├── card_render.ts
│   ├── input.ts
│   └── animation.ts
└── state/
    └── game_state.ts
```

| 维度 | 评分 | 说明 |
|------|:----:|------|
| 包体积 | ⭐⭐⭐⭐⭐ | ~100KB min+gzip |
| 性能 | ⭐⭐⭐⭐ | Canvas在卡牌场景已够用 |
| 开发效率 | ⭐⭐⭐ | 需自己实现渲染管线 |
| AI强度 | ⭐⭐⭐ | 启发式+MCTS |
| 综合推荐度 | **⭐⭐⭐⭐** | 最适合极简需求 |

### 路线B：Pixi.js + TS（推荐·最佳平衡）
**技术栈**：TypeScript + Pixi.js 8.x + Vite

**架构**：
```
src/
├── core/          # 与路线A共享
├── ai/            # 与路线A共享
├── pixi/          # Pixi渲染层
│   ├── scenes/    # 场景管理器
│   ├── components/ # CardSprite/HandArea/TableArea
│   └── systems/   # 动画/音效系统
└── state/
```

| 维度 | 评分 | 说明 |
|------|:----:|------|
| 包体积 | ⭐⭐⭐⭐ | Pixi.js ~500KB gzip |
| 性能 | ⭐⭐⭐⭐⭐ | WebGL加速，粒子特效流畅 |
| 开发效率 | ⭐⭐⭐⭐ | 完善的API文档和社区 |
| 综合推荐度 | **⭐⭐⭐⭐⭐** | **最佳平衡选择** |

### 路线C：Terminal TUI（最极致轻量）
**技术栈**：TypeScript + Ink + React

| 维度 | 评分 | 说明 |
|------|:----:|------|
| 包体积 | ⭐⭐⭐⭐⭐ | ~50KB |
| 综合推荐度 | **⭐⭐⭐** | 体验受限，适合调试场景 |

### 路线D：Phaser 3 + TS（偏重游戏引擎）
| 维度 | 评分 | 说明 |
|------|:----:|------|
| 包体积 | ⭐⭐⭐ | ~1.2MB min+gzip |
| 综合推荐度 | **⭐⭐⭐** | 未来需扩展多人时切换 |

### 路线E：纯逻辑引擎（作为模块复用）
**技术栈**：TypeScript + Node.js

| 维度 | 评分 | 说明 |
|------|:----:|------|
| 包体积 | ⭐⭐⭐⭐⭐ | ~30KB |
| 综合推荐度 | **⭐⭐⭐⭐** | 建议作为第一阶段产出 |

### 综合评分雷达对比

| 标准 | 路线A(Canvas) | 路线B(Pixi.js) | 路线C(TUI) | 路线D(Phaser) | 路线E(纯引擎) |
|------|:------------:|:-------------:|:----------:|:-------------:|:------------:|
| 轻量程度 | ★★★★★ | ★★★★☆ | ★★★★★ | ★★★☆☆ | ★★★★★ |
| 视觉效果 | ★★★☆☆ | ★★★★★ | ★☆☆☆☆ | ★★★★★ | ☆☆☆☆☆ |
| 开发效率 | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★★★ | ★★★★★ |
| AI能力(共享) | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ |
| 可维护性 | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ | ★★★★★ |
| 扩展性(未来) | ★★★☆☆ | ★★★★☆ | ★★☆☆☆ | ★★★★★ | ★★★★★ |
| 触屏/移动适配 | ★★★☆☆ | ★★★★★ | ☆☆☆☆☆ | ★★★★★ | — |
| **总分** | **24/35** | **29/35** | **18/35** | **26/35** | **23/30** |

---

## 七、产品架构推荐（单人TS原生版）

### 推荐策略

```
推荐顺序：路线E → 路线B →（未来）路线D
```

### Phase 1：纯逻辑引擎（≈2周）
```
guandan-engine/
├── src/
│   ├── engine.ts        # 游戏引擎（纯函数）
│   ├── card.ts          # 卡牌定义+牌型判断
│   ├── rules.ts         # 掼蛋规则（进贡/升级/接风/炸弹）
│   ├── combo.ts         # 牌型组合枚举器
│   ├── comparator.ts    # 牌型比较器
│   └── ai/
│       ├── evaluator.ts # 牌力评估器
│       ├── heuristic.ts # 启发式策略
│       └── mcts.ts      # MCTS搜索
├── __tests__/
│   └── engine.test.ts   # ≥200个测试（参考Kagetsu 403标准）
└── package.json
```

**验收标准**：
- [ ] 4人游戏状态机：发牌→进贡→出牌→接风→升级→结算
- [ ] 全部合法牌型判断（单/对/三/三带二/顺/同花/钢板/木板/炸弹/天王炸弹）
- [ ] ≥200个单元测试
- [ ] AI可在50ms内出牌
- [ ] 可作为独立的npm包发布

### Phase 2：Pixi.js界面（≈3周）
```
guandan-pixi/
├── src/
│   ├── engine/          # 引用Phase 1引擎包
│   ├── ai/              # 引用Phase 1 AI包
│   ├── screens/         # Pixi场景（Boot/Menu/Game/Result）
│   ├── components/      # CardSprite/HandArea/TableArea/PlayerAvatar/Timer/Button
│   ├── systems/         # AnimationSystem/AudioSystem
│   └── config/themes.ts # 多主题配置
└── vite.config.ts
```

### Phase 3：体验打磨（持续）
- 记牌器功能（参考Si-xiyu）
- 对局回放（状态快照存储）
- 多主题（经典绿/星空/水墨国风）
- 统计面板（胜率/炸弹数/升级记录）
- 特殊牌型炸弹特效（CSS屏幕震动 + 粒子系统）
- 发牌飞行动效（缓出曲线飞行卡牌）

---

## 八、决策树：按需选择路线

```
你的第一优先级是？
    │
├── 极致轻量、零依赖 ──→ 路线A (原生Canvas)
│   └── 但需要好看的UI？ ──→ 路线B (Pixi.js)
│
├── 快速出产品验证 ──→ 路线E → 路线B
│
├── 将来想转多人联机 ──→ 路线B/路线D（需Node.js服务端共享引擎）
│
├── AI强度是核心卖点 ──→ 方案G（MCTS+对手建模）
│
└── 只是练手学习 ──→ 路线C (TUI) 最简单完整
```

---

## 九、推荐执行时间线

```
Week 1-2 ── 路线E: 纯TS引擎 + AI基线(方案C) + 200+测试
Week 3-4 ── 路线B: Pixi.js基础界面（牌桌渲染+手牌交互）
Week 5   ── AI升级到方案E/F + 基础游戏循环联调
Week 6   ── 体验打磨（动画/音效/记牌器/主题）
```

**以上所有路线均符合"单机·TS原生·无HTTP·无LLM·轻量级"的核心约束。**

---

## 十、参考资源索引

### 掼蛋项目
| 项目 | 链接 |
|------|------|
| OpenGuanDan | https://github.com/GameAI-NJUPT/OpenGuanDan |
| clawguandan | https://github.com/mikewei/clawguandan |
| Si-xiyu/GuanDan | https://github.com/Si-xiyu/GuanDan |
| AltmanD/Guandan | https://github.com/AltmanD/Guandan |
| LSTM-Kirigaya NUAA | https://github.com/LSTM-Kirigaya/NUAA-guandan |

### 斗地主AI参考（算法可迁移）
| 项目 | 链接 |
|------|------|
| DouZero (Kwai) | https://github.com/kwai/DouZero |
| 权重AI斗地主 | https://github.com/ZhouWeikuan/DouDiZhu |

### 通用卡牌框架
| 项目 | 链接 |
|------|------|
| CardHouse (Unity) | https://github.com/pipeworks-studios/CardHouse |
| gofishing-game | https://github.com/guogeer/gofishing-game |
| Kagetsu (Rust麻将) | https://github.com/XuanLee-HEALER/kagetsu |

### 可直接翻译为TS的核心算法来源
| 资源 | 可复用的算法/设计 |
|------|-----------------|
| OpenGuanDan 规则引擎 | 完整掼蛋规则逻辑、牌力比较器 |
| AltmanD/Guandan strategies | 启发式策略接口设计 |
| ZhouWeikuan 权重AI | 牌力评估函数、权重计算体系 |
| DouZero 两阶段决策 | 牌型分类→选牌的范式 |
| Kagetsu 纯函数式引擎 | 无副作用设计、测试驱动开发 |
| Si-xiyu MVC架构 | Model/View/Controller解耦方式 |

### 纯TS游戏引擎选择
| 引擎 | 包大小(umd) | 渲染方式 | 适用场景 |
|------|:----------:|:--------:|----------|
| **原生Canvas** | 0KB | Canvas 2D | 极简项目 |
| **Pixi.js v8** | ~500KB | WebGL/Canvas | **掼蛋推荐选择** |
| **Phaser 3** | ~1.2MB | WebGL+物理 | 需扩展为复杂游戏时 |
| **Excalibur.js** | ~300KB | Canvas/WebGL | 轻量备选 |
| **Kaplay (原Kaboom)** | ~200KB | WebGL | 快速原型 |
