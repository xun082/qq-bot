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
COPY .env ./.env

# NOTE: This intentionally loads env from the baked-in `.env`.
CMD ["node", "--env-file=.env", "dist/index.js"]
