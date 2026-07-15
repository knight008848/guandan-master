# 掼蛋大师 (Guandan Master) - 项目开发规范 & 行为约束 (Project Rules & Guidelines)

## 🧪 测试与 CI/CD 规范 (Testing & CI/CD Guidelines)

- **不影响 GitHub Actions / CI/CD 运行 (No Impact on GitHub CI/CD)**:
  - 所有的测试架构修改与测试用例编写，必须保证可以在无头/无代理环境下的 GitHub Actions CI/CD 流水线中正常运行。
  - **优先使用内存 DOM 仿真环境 (Prefer In-Memory DOM for View Tests)**：
    - 针对 UI 和渲染层（如 `DOMRenderer`）的测试，优先使用 Vitest 结合 `jsdom` 或 `happy-dom` 进行单元测试。
    - 避免在默认 CI 流水线中引入依赖真实浏览器（如 Playwright / Cypress 等）的端到端或截图测试，以防由于代理占用、图形环境缺失或 Git 身份认证冲突导致 GitHub 工作流构建失败。
  - **凭据与本地配置隔离 (Credential & Local Config Isolation)**：
    - 严禁将本地测试凭据、网络代理配置、个人 Access Token 或环境特有的本地配置文件提交到 Git 仓库中。
