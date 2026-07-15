# 掼蛋大师 (Guandan Master) - 项目开发规范 & 行为约束 (Project Rules & Guidelines)

## 🧪 测试与 CI/CD 规范 (Testing & CI/CD Guidelines)

- **不影响 GitHub Actions / CI/CD 运行 (No Impact on GitHub CI/CD)**:
  - 所有的测试架构修改与测试用例编写，必须保证可以在无头/无代理环境下的 GitHub Actions CI/CD 流水线中正常运行。
  - **优先使用内存 DOM 仿真环境 (Prefer In-Memory DOM for View Tests)**：
    - 针对 UI 和渲染层（如 `DOMRenderer`）的测试，优先使用 Vitest 结合 `jsdom` 或 `happy-dom` 进行单元测试。
    - 避免在默认 CI 流水线中引入依赖真实浏览器（如 Playwright / Cypress 等）的端到端或截图测试，以防由于代理占用、图形环境缺失或 Git 身份认证冲突导致 GitHub 工作流构建失败。
  - **凭据与本地配置隔离 (Credential & Local Config Isolation)**：
    - 严禁将本地测试凭据、网络代理配置、个人 Access Token 或环境特有的本地配置文件提交到 Git 仓库中。

## 🔄 开发流程规范 (Development Workflow Guidelines)

- **循序渐进的研发步骤 (Step-by-Step R&D Process)**:
  - **第一步：研究成熟开源架构 (Step 1: Research Mature Open-Source Architectures)**：
    在开始任何重大功能或重构设计前，必须先调研和研究业内流行的开源项目、成熟的算法实现（如扑克牌型判定、AI 决策树设计等），汲取最佳实践。
  - **第二步：输出开发方案与路径 (Step 2: Propose Design & Implementation Path)**：
    在动工编写业务代码前，必须先理清技术方案、数据流向和模块依赖关系，制定清晰的修改步骤与测试方案，并在需要时与团队对齐方案。
  - **第三步：循序进行开发与测试 (Step 3: Implementation & Comprehensive Testing)**：
    按照既定方案开始编码，在开发过程中同步补齐单元测试或集成测试，严禁在未经过完整方案设计的情况下直接进行侵入式开发。

