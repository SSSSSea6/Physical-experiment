# lab.nuaaguide.online 实验图表生成器（MVP）

架构（与需求对齐）：

- 前端：Cloudflare Pages（`apps/frontend`，SPA：`/login`、`/dashboard`、`/exp/:id`）
- 后端：Cloudflare Worker（`apps/worker`，域名建议 `lab-api.nuaaguide.online`）
- 数据库：D1（用户、余额、兑换码、历史、日志）
- 会话：KV（`session:{id}` -> `student_id`，24h）
- 存储：R2（裁剪后的图片/可选导出图；Worker Cron 每天清理 3 天过期）
- 扣次强一致：Durable Object（按 `student_id` 串行化 `consume/redeem/refund`）
- 人机验证：Turnstile（登录/兑换/识别）

本仓库包含 1 个示例实验模板：`experiments/hall`（Hall 效应）。

## 1) 本地开发

### 1.1 安装依赖

在仓库根目录：

```bash
npm install
```

### 1.2 启动 Worker

> `wrangler.toml` 在仓库根目录，默认允许前端 Origin 为 `http://localhost:5173`。

```bash
npm run dev:worker
```

### 1.3 启动前端

```bash
npm run dev:frontend
```

前端默认读取 `VITE_API_BASE`，未配置时使用 `http://localhost:8787`。

## 2) Cloudflare 资源创建

### 2.1 创建 D1

```bash
wrangler d1 create lab_db
```

把输出的 `database_id` 填到根目录 `wrangler.toml` 的 `[[d1_databases]]`。

应用迁移：

```bash
wrangler d1 migrations apply lab_db --remote
```

### 2.2 创建 KV

```bash
wrangler kv namespace create "LAB_SESSION"
```

把输出的 `id` 填到根目录 `wrangler.toml` 的 `[[kv_namespaces]]`。

### 2.3 创建 R2

```bash
wrangler r2 bucket create lab-uploads
```

### 2.4 创建 Turnstile

在 Cloudflare Dashboard -> Turnstile 创建站点：

- Site key：配置到 Pages 环境变量 `VITE_TURNSTILE_SITE_KEY`
- Secret key：配置到 Worker 环境变量 `TURNSTILE_SECRET`

### 2.5 Gemini Key

把 `GEMINI_API_KEY` 写入 Worker 环境变量（`wrangler.toml` `[vars]` 或 Dashboard）。

## 3) 部署 Worker（lab-api）

### 3.1 配置域名与 CORS

建议：

- Pages：`https://lab.nuaaguide.online`
- Worker：`https://lab-api.nuaaguide.online`

在 `wrangler.toml` `[vars]` 设置：

- `FRONTEND_ORIGIN="https://lab.nuaaguide.online"`（可逗号分隔多个 origin）
- `COOKIE_DOMAIN=".nuaaguide.online"`（推荐，便于跨子域一致）
- `TURNSTILE_SECRET=...`
- `GEMINI_API_KEY=...`

### 3.2 部署

```bash
wrangler deploy
```

> Durable Object 的迁移已在 `wrangler.toml` 中配置（`LedgerDO`）。

## 4) 部署 Pages（lab）

Cloudflare Pages 创建项目时：

- Root directory：`apps/frontend`
- Build command：`npm ci && npm run build`
- Build output directory：`dist`

Pages 环境变量：

- `VITE_API_BASE=https://lab-api.nuaaguide.online`
- `VITE_TURNSTILE_SITE_KEY=...`

并在 DNS 中配置：

- `lab` CNAME -> Pages 项目域名
- `lab-api` CNAME / route -> Worker

## 5) 创建用户与兑换码

### 5.1 创建用户

本项目提供一个可选的管理员注册接口：

- `POST /v1/auth/register`
- Header：`X-Admin-Secret: <ADMIN_SECRET>`

开启方式：在 `wrangler.toml` `[vars]` 配置 `ADMIN_SECRET`。

### 5.2 生成兑换码（离线）

运行：

```bash
node scripts/generate-redeem-codes.mjs --count 100 --amount 10 --length 18 > redeem.sql
wrangler d1 execute lab --file redeem.sql
```

把输出的兑换码发放给用户即可。

## 6) 清理过期（3 天）

Worker 已配置 Cron（`wrangler.toml` `[triggers].crons`），每天清理：

- D1：`expires_at <= now` 的 `artifacts`
- R2：对应的 `image_key/plot_key` 对象

也可以手动触发（可选）：

- `POST /v1/cron/cleanup`
- Header：`X-Cron-Secret: <CRON_SECRET>`

## 7) 实验模板扩展

每个实验维护一套目录（示例：`experiments/hall`）：

- `schema.json`：表格结构
- `prompt.txt`：抽取提示词（供人维护）
- `prompt.ts`：Worker 使用的提示词字符串
- `plot.ts`：前端作图脚本（固定样式）

要新增实验：

1) 新建 `experiments/<exp_id>/...`
2) 后端：在 `apps/worker/src/index.ts` 中把 `exp_id` 加入允许列表（映射 schema + prompt）
3) 前端：在 `apps/frontend/src/experiments.ts` 注册 schema + plot builder
