# 掼蛋大师 (Guandan Master) - Agent 开发工作流与协作指南 (Agent Workflow Guide)

为了保持项目极高的代码质量、健壮的测试覆盖与清晰的提交历史，所有 AI Agent 与开发者在本仓库中工作时，必须严格遵循 **SDD (规范驱动) + TDD (测试驱动)** 范式与 **强制 GitHub Pull Request (PR)** 门禁流程。

---

## 🌿 一、 分支管理规范 (Branching Strategy)

- **`main` 分支**：受保护的生产主分支。**严禁直接在本地向 `main` 分支提交或执行 `git push`**。
- **特性开发分支**：从 `main` 分支拉出，命名格式为 `feature/<feature-name>`（例如：`feature/ai-scoring-optimization`）。
- **漏洞修复分支**：从 `main` 分支拉出，命名格式为 `fix/<issue-name>`（例如：`fix/issue-10-autoplay-guard`）。

---

## 🔄 二、 标准研发工作流 (Standard R&D Workflow)

本项目推荐采用 **SDD (规范驱动) + TDD (测试驱动) 混合开发流程**：

```
[ Step 1: 研究与规范定义 (SDD) ] ───► [ Step 2: 编写失败单元测试 (🔴 TDD Red) ]
                                                        │
                                                        ▼
[ Step 4: 重构优化与全量回归 ] ◄─── [ Step 3: 实现业务代码使测试变绿 (🟢 TDD Green) ]
```

1. **Step 1：研究与规范设计 (SDD)**：动工前先在 `docs/` 或接口文件中定义数据结构、类型签名与 3 级 Fallback 容灾策略。
2. **Step 2：测试先行 (🔴 TDD Red)**：在 `tests/` 目录下编写对应功能的单元测试断言，并运行 `npx vitest run` 确认捕捉预期的失败。
3. **Step 3：编码实现 (🟢 TDD Green)**：编写业务代码使所有测试 100% 变绿通过。
4. **Step 4：重构与全量回归**：执行 `npm run lint`、`npm run format` 及全量测试套件回归扫描，确保 0 显存泄漏与 0 警告。

---

## ⚛️ 三、 原子化 Commit 规范 (Atomic Commit Guidelines)

- **单一职责提交**：每次 Commit 必须保持原子性，一个 Commit 仅包含一个独立且完整的逻辑变更。
- **提交信息格式**：严格遵循 Conventional Commits 规范格式 `<type>(<scope>): <short summary>`：
  - `feat`: 新增特性或算法功能
  - `fix`: 修复逻辑漏洞或 Bug
  - `test`: 增加或修补单元测试 / Benchmark
  - `docs`: 文档补充与更新
  - `chore`: 构建配置、依赖包或忽略文件调整
  - `refactor`: 重构优化（不改变既有功能）

---

## 🔍 四、 Pre-Push Code Review 审核门禁 (Pre-Push Code Review Gate)

- **严禁擅自直接 Push**：在未经过 Code Review 报告审查并获批准前，禁止向远程仓库执行 `git push`。
- **调用 `code-review-inspector` Subagent**：审查内存/显存防泄露 (`tf.tidy`)、静态类型安全、三级 Fallback 及测试覆盖率。
- **本地归档隔离**：审查报告保存在本地 `.agents/reviews/` 目录中，并由 `.gitignore` 显式隔离，绝不提交至 Public 仓库。

---

## 🔀 五、 强制 Pull Request (PR) 发布流程 (Mandatory PR Policy)

**所有代码合入 `main` 主分支必须 100% 走 GitHub Pull Request 流程，绝对禁止在本地直接 merge main！**

### 🚀 发起 PR 步骤：
1. **推送当前分支**：
   ```bash
   git push origin feature/<feature-name>
   ```
2. **创建 Pull Request**：
   在 GitHub 仓库网页上点击 **"Compare & pull request"**，目标分支选择 `base: main` ⬅ `compare: feature/<feature-name>`。
3. **填写 PR 描述**：
   简述本次变更点、影响范围与测试结果。
4. **GitHub Actions 自动化门禁 (CI Gate)**：
   云端 CI 流水线会自动对 PR 触发 TypeScript 编译检查、ESLint 扫描与全量单元测试。
5. **审核与合并 (Merge)**：
   由项目负责人审核通过后，点击 **"Merge pull request"** 自动合入主分支并触发 GitHub Pages 生产自动部署！

---

## 🧪 六、 本地校验命令参考

在提交或发起 PR 前，请确保以下命令全部通过：

```bash
# 1. 运行全量单元测试
npm run test

# 2. 运行 TypeScript 严格类型检查
npx tsc --noEmit

# 3. 运行代码规范与样式检查
npm run lint

# 4. 执行代码自动格式化
npm run format
```
