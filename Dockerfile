# 构建阶段（使用官方 Node LTS Alpine）
FROM node:lts-alpine3.23 AS builder

WORKDIR /app

# 使用 pnpm 安装依赖并构建
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# 只保留生产依赖，准备给运行时镜像拷贝
RUN pnpm prune --prod

# 运行阶段（使用更安全的 Chainguard Node 运行时镜像）
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 应用内已有默认配置，可不传环境变量；需覆盖时再用 --env-file 或 -e
# 该镜像 ENTRYPOINT 已是 node，这里只传脚本路径
CMD ["dist/index.js"]
