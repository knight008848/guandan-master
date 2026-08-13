# 掼蛋大师 (Guandan Master) - 项目开发规范 & 行为约束 (Project Rules & Guidelines)

## 🧪 测试与 CI/CD 规范 (Testing & CI/CD Guidelines)

- **不影响 GitHub Actions / CI/CD 运行 (No Impact on GitHub CI/CD)**:
  - 所有的测试架构修改与测试用例编写，必须保证可以在无头/无代理环境下的 GitHub Actions CI/CD 流水线中正常运行。
  - **优先使用内存 DOM 仿真环境 (Prefer In-Memory DOM for View Tests)**：
    - 针对 UI 和渲染层（如 `DOMRenderer`）的测试，优先使用 Vitest 结合 `jsdom` 或 `happy-dom` 进行单元测试。
    - 避免在默认 CI 流水线中引入依赖真实浏览器（如 Playwright / Cypress 等）的端到端或截图测试，以防由于代理占用、图形环境缺失或 Git 身份认证冲突导致 GitHub 工作流构建失败。
  - **凭据与本地配置隔离 (Credential & Local Config Isolation)**：
    - 严禁将本地测试凭据、网络代理配置、个人 Access Token 或环境特有的本地配置文件提交到 Git 仓库中。
  - **发布前的静态检查与格式化 (Pre-push Lint & Format Gate)**：
    - 所有的代码提交或发布前，必须在本地运行并完成 `npm run lint` 和 `npm run format`，确保 ESLint、Stylelint 和 Prettier 检查通过（0 错误，0 警告）。
    - CI 流水线中已配置了 Lint 和 Test 拦截。严禁提交未经过 Lint 校验的代码以防导致 CI 构建失败。
  - **测试覆盖率要求 (Test Coverage Gate)**：
    - 核心逻辑层（包含 `src/rules.ts` 规则引擎、`src/session.ts` 对局会话及 `src/ai/` 决策算法层）的代码行覆盖率（Line Coverage）必须保持在 **80% 以上**。
    - 任何新增功能或修补程序（Bugfix）提交时，必须同步补充对应的单元测试用例，确保新代码行被测试充分覆盖，禁止提交无测试覆盖的业务逻辑代码。

## 🔄 开发流程规范 (Development Workflow Guidelines)

- **循序渐进的研发步骤 (Step-by-Step R&D Process)**:
  - **第一步：研究成熟开源架构 (Step 1: Research Mature Open-Source Architectures)**：
    在开始任何重大功能或重构设计前，必须先调研和研究业内流行的开源项目、成熟的算法实现（如扑克牌型判定、AI 决策树设计等），汲取最佳实践。
  - **第二步：输出开发方案与路径 (Step 2: Propose Design & Implementation Path)**：
    在动工编写业务代码前，必须先理清技术方案、数据流向和模块依赖关系，制定清晰的修改步骤与测试方案，并在需要时与团队对齐方案。
  - **第三步：循序进行开发与测试 (Step 3: Implementation & Comprehensive Testing)**：
    按照既定方案开始编码，在开发过程中同步补齐单元测试或集成测试，严禁在未经过完整方案设计的情况下直接进行侵入式开发。

## ⚛️ 原子化 Commit 规范 (Atomic Commit Guidelines)

- **单次提交原则 (Single Purpose Commit)**：
  - 每次 Git 提交必须具备高度的原子性（Atomic Commit），即一个 Commit 仅包含一个独立且完整的逻辑变更（如：一个独立的新特性、一组 TDD 测试、一个专门的 Bug 修复或一次文档更新）。
  - 严禁将大跨度、多主题或无关的代码改动混合打包在一个 Commit 中提交。
- **提交信息规范 (Standardized Commit Messages)**：
  - Commit Message 必须严格遵循 Standardized Conventional Commits 规范，格式为 `<type>(<scope>): <short summary>`：
    - `feat`: 新增功能特性
    - `fix`: 修复漏洞 Bug
    - `test`: 增加或修改单元测试/基准测试
    - `docs`: 文档补充或更新
    - `chore`: 构建配置、依赖项或忽略文件变更
    - `refactor`: 重构代码（不改变既有功能与逻辑）

## 🔍 Pre-Push Code Review 审核门禁 (Pre-Push Code Review Gate)

- **严禁擅自直接 Push (No Direct Push Without Approval)**：
  - AI Agent 或开发人员在完成本地代码开发与 Commit 之后，**严禁擅自直接向远程仓库（GitHub）或 `main` 主分支执行 `git push` 操作**。
- **调用 Code Review Subagent 独立审计 (Code Review Subagent Invocation)**：
  - 在每次发起 `git push` 命令之前，必须先调用专门定义的 **`code-review-inspector` Subagent** 以第三方审查视角执行全方位深度代码审计。
  - **审查范围**：
    1. **内存与显存防泄露**：检查 TensorFlow.js 代码是否 100% 作用域包裹在 `tf.tidy()` 或手动 `dispose()` 中。
    2. **静态与类型安全**：检查 `npx tsc --noEmit` 0 错误与 ESLint / Stylelint 0 警告。
    3. **降级防护网**：检查三级 Fallback 降级在断网/网络异常下的 0ms 拦截能力。
    4. **原子性 Commit 与测试覆盖率**：检查全量单元测试 100% 绿灯且覆盖率合格。
- **本地审计报告归档与 `.gitignore` 隔离 (Local-Only Archiving Policy)**：
  - 每次生成的 Code Review 报告更新保存在本地 [`.agents/reviews/`](file:///d:/Repos/guandan-master/.agents/reviews/) 目录下（命名格式：`CR-<feature-name>.md`）。
  - **`.gitignore` 显式隔离**：该目录已被 `.gitignore` 明确忽略，**仅存在于本地开发环境**，绝不会提交或发布到远程 Public 仓库中，确保 GitHub 开源项目 100% 干净且 0 隐私隐患。
- **显式批准方可推送 (Explicit Approval Required)**：
  - 呈现归档的 Code Review 报告并由项目审核人显式确认批准（回复“Approve”、“同意”或“允许 Push”）之后，方可执行 `git push` 命令推送到远程仓库。
