## QQ Bot 使用说明

基于 NapCat（OneBot v11 协议）和公司内部 RWKV 模型的 QQ 机器人，支持：

- **私聊**：所有消息都会走 AI 回复  
- **群聊**：仅在 **@机器人** 时触发 AI 回复，并自动带入最近一段时间的群聊上下文

---

### 一、环境准备

- **Node.js**：≥ 18（本地开发 / 构建时需要）
- **包管理器**：推荐 `pnpm`（也可用 `npm` / `yarn`）
- **Docker & Docker Compose**：用于运行 NapCat，以及可选地将本机器人打成镜像运行

---

### 二、端口与网络说明

部署前请确认以下端口可访问、防火墙/安全组已放行。

| 组件 | 端口 | 说明 |
|------|------|------|
| **NapCat WebUI** | **6099** | 浏览器访问，用于登录 QQ、配置 OneBot，仅本机或内网访问即可 |
| **NapCat OneBot** | **3001** | HTTP / WebSocket，本机器人作为客户端连接此端口，需与 `ONEBOT_WS_URL` 一致 |
| **QQ Bot 容器/进程** | **无** | 本机器人不监听任何端口，只主动连接 NapCat 和 RWKV API |

**注意：**

- 若 NapCat 与 QQ Bot 同机部署：`ONEBOT_WS_URL` 填 `ws://127.0.0.1:3001`（本机）或 `ws://宿主机IP:3001`（容器连宿主机）。
- 若 QQ Bot 与 NapCat 在同一 Docker 网络：可填 `ws://napcat:3001`。
- 本机器人需能**访问** RWKV API（`RWKV_BASE_URL`），确保该地址在部署环境中可达（内网或 VPN 等）。

---

### 三、克隆与安装依赖

```bash
git clone <你的仓库地址>
cd qq-bot

# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install
```

---

### 四、配置环境变量（`.env`）

在项目根目录配置 `.env`，核心变量如下：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ONEBOT_WS_URL` | 是 | NapCat OneBot WebSocket 地址，如 `ws://127.0.0.1:3001` |
| `RWKV_BASE_URL` | 是 | RWKV API 基础地址（不要带末尾 `/`） |
| `RWKV_PASSWORD` | 是 | 调用 RWKV API 的密码 |
| `AI_SYSTEM_PROMPT` | 是 | 系统提示词（人格、语气等） |
| `RWKV_MAX_TOKENS` | 是 | 单次回复最大 token 数 |
| `HISTORY_LIMIT` | 是 | 每个会话保留的历史消息条数 |
| `GROUP_LOG_LIMIT` | 否 | 每个群保留的最近群聊条数（默认 30） |

**启动前务必确认必填项已设置**，否则程序会退出并提示缺少的环境变量名。

---

### 五、启动 NapCat（OneBot 服务端）

用 Docker Compose 启动 NapCat：

```bash
docker compose up -d
```

`docker-compose.yml` 要点：

- 容器名：`napcat`
- **端口映射**：WebUI `6099`，OneBot `3001`
- `ACCOUNT`：你的 QQ 号，用于自动登录

启动后：

1. 浏览器打开 `http://127.0.0.1:6099`，完成 QQ 登录与 OneBot 设置。  
2. 在 NapCat 中启用 **OneBot v11 WebSocket 服务**，端口与 `.env` 中的 `ONEBOT_WS_URL` 一致（默认 3001）。

---

### 六、运行 QQ 机器人

#### 方式 A：本地开发（TypeScript 直跑）

```bash
pnpm dev
# 或 npm run dev
```

- 使用 `tsx` 运行 `src/index.ts`，自动读取根目录 `.env`。  
- 控制台出现 `[QQ-BOT] 已连接 NapCat | API: ...` 即表示连接成功。

#### 方式 B：编译后运行（适合生产 / pm2 / systemd）

```bash
pnpm build
pnpm deploy
# 或 npm run build && npm run deploy
```

- 编译产物在 `dist/`，运行 `dist/index.js`，同样从 `.env` 读配置。

#### 方式 C：Docker 镜像运行

```bash
# 构建镜像
docker build -t qq-bot .

# 运行（通过 --env-file 注入配置，不把 .env 打进镜像）
docker run -d --name qq-bot --env-file .env qq-bot
```

- 本机器人**不暴露任何端口**，只需能访问 NapCat（如 `ONEBOT_WS_URL`）和 RWKV API。
- 若 NapCat 也在 Docker 且同网络，可先创建网络并指定：
  ```bash
  docker network create qqbot-net
  docker run -d --name napcat --network qqbot-net ...  # 你的 napcat 启动方式
  docker run -d --name qq-bot --network qqbot-net --env-file .env qq-bot
  ```
  此时 `.env` 中 `ONEBOT_WS_URL` 可设为 `ws://napcat:3001`。
  - 默认使用官方 `node:lts-alpine3.23` 作为基础镜像，具体 CVE 情况以官方镜像为准，如有安全合规要求请在部署环境中再用镜像扫描工具（如 Docker Scout / Trivy 等）进行校验。

---

### 七、项目结构

| 路径 | 说明 |
|------|------|
| `src/index.ts` | 主逻辑：连接 OneBot WebSocket、处理私聊/群聊、调 RWKV API、管理会话与群聊上下文 |
| `.env` | 运行配置（不要提交敏感信息） |
| `docker-compose.yml` | 启动 NapCat 服务 |
| `Dockerfile` | 将本机器人构建为 Docker 镜像 |
| `tsconfig.json` / `package.json` | 构建与依赖配置 |

---

### 八、常见问题

- **Q: 启动时报 `缺少必填环境变量`？**  
  **A**: 按报错提示在 `.env` 中补齐对应变量后重试。

- **Q: 群里 @ 了机器人但不回复？**  
  **A**: 确认已 **@机器人**；检查 NapCat 是否启用 OneBot WebSocket，且 `ONEBOT_WS_URL` 的地址和端口（默认 3001）正确；若用 Docker，确认容器能访问 NapCat（网络/主机名/端口）。

- **Q: 想改回复风格？**  
  **A**: 修改 `.env` 中的 `AI_SYSTEM_PROMPT`，重启本机器人即可。

- **Q: 要开放哪些端口？**  
  **A**: 只需保证 **NapCat** 的 **6099**（WebUI）、**3001**（OneBot）对运行 QQ Bot 的环境可达；QQ Bot 本身不监听端口，无需开放。
