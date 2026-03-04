## QQ Bot 使用说明

这是一个基于 NapCat（OneBot v11 协议）和公司内部 RWKV 模型的 QQ 机器人项目，支持：

- 私聊：所有消息都会走 AI 回复  
- 群聊：只有在群里 **@机器人** 时才会触发 AI 回复，并自动带入最近一段时间的群聊上下文

---

### 一、环境准备

- **Node.js**：建议 ≥ 18  
- **包管理器**：推荐 `pnpm`（也可以用 `npm` / `yarn`）  
- **Docker & Docker Compose**：用于一键启动 NapCat

---

### 二、克隆与安装依赖

```bash
git clone <你的仓库地址>
cd qq-bot

# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install
```

---

### 三、配置环境变量（`.env`）

项目已经自带一个示例 `.env` 文件，核心变量含义如下：

- `ONEBOT_WS_URL`：NapCat 暴露的 OneBot WebSocket 地址，默认 `ws://127.0.0.1:3001`
- `RWKV_BASE_URL`：公司 RWKV API 的基础地址（不要带末尾 `/`）
- `RWKV_PASSWORD`：调用 RWKV API 的密码
- `AI_SYSTEM_PROMPT`：系统提示词（控制机器人的人格、语气等）
- `RWKV_MAX_TOKENS`：单次回复的最大 token 数
- `HISTORY_LIMIT`：每个会话保留的历史消息条数
- `GROUP_LOG_LIMIT`：每个群保留的最近群聊明文消息条数（用于构造群聊上下文）

你可以直接修改根目录下的 `.env` 文件，**启动前务必确认必填项都已设置**，否则程序会直接退出并报错提示缺少的环境变量名。

---

### 四、启动 NapCat（OneBot 服务端）

本项目推荐通过 `docker-compose` 来启动 NapCat：

```bash
docker compose up -d
```

`docker-compose.yml` 中主要配置：

- 容器名：`napcat`
- WebUI 端口：映射到宿主机 `6099`
- OneBot HTTP / WebSocket 端口：映射到宿主机 `3001`
- `ACCOUNT`：你的 QQ 号，用于自动登录

启动后：

- 浏览器访问 `http://127.0.0.1:6099` 可打开 NapCat WebUI，完成登录与 OneBot 设置  
- 确认已经启用 **OneBot v11 WebSocket 服务**，地址与端口需要与 `.env` 中的 `ONEBOT_WS_URL` 保持一致

---

### 五、本地开发运行（TypeScript 直跑）

开发阶段可以直接运行 TypeScript 源码：

```bash
# 使用 pnpm
pnpm dev

# 或使用 npm
npm run dev
```

脚本会：

- 使用 `tsx` 加载 `src/index.ts`
- 自动读取根目录 `.env` 中的环境变量

在控制台你会看到类似日志：

```text
[QQ-BOT] 已连接 NapCat | API: http://...
```

此时：

- 私聊机器人：直接给机器人 QQ 账号发消息即可
- 群聊机器人：在群里 **@机器人** 并输入内容，机器人会基于最近的群聊天记录回复

---

### 六、构建与部署运行

#### 1. 构建 TypeScript

```bash
# 使用 pnpm
pnpm build

# 或使用 npm
npm run build
```

编译结果会输出到 `dist` 目录。

#### 2. 以编译后代码运行

```bash
# 使用 pnpm
pnpm deploy

# 或使用 npm
npm run deploy
```

该命令会：

- 通过 Node.js 运行 `dist/index.js`
- 同样从 `.env` 读取环境变量

适合线上 / 后台部署场景，可以配合 `pm2`、`systemd` 等进行守护。

---

### 七、项目结构简要说明

- `src/index.ts`：机器人主逻辑  
  - 连接 NapCat 提供的 OneBot WebSocket  
  - 处理私聊和群聊消息  
  - 调用公司 RWKV 模型 API 生成回复，并做 Markdown 转纯文本处理  
  - 管理会话历史与群聊滚动日志
- `.env`：机器人运行所需的全部配置
- `docker-compose.yml`：一键启动 NapCat（OneBot 服务端）
- `tsconfig.json`：TypeScript 编译配置
- `package.json`：依赖与脚本定义

---

### 八、常见问题

- **Q: 启动时报 `缺少必填环境变量` 怎么办？**  
  **A**: 根据报错信息在 `.env` 中补齐对应变量，再重新运行。

- **Q: 群里发消息机器人不回？**  
  **A**: 确认是否使用了 **@机器人**，只有被 @ 时才会触发 AI 回复；同时检查 NapCat 的 OneBot WebSocket 是否已启用且地址与 `ONEBOT_WS_URL` 一致。

- **Q: 回复风格想改成另一种人格？**  
  **A**: 修改 `.env` 中的 `AI_SYSTEM_PROMPT`，重启程序即可生效。

