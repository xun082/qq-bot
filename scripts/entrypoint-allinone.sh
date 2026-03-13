#!/usr/bin/env bash
set -e

# 先启动 NapCat（与官方镜像一致）
cd /app && bash entrypoint.sh &

# 简单等待一段时间给 NapCat 初始化，qq-bot 内部有重连逻辑
sleep 15

# 本镜像内 NapCat 与 qq-bot 同容器，用 localhost
export ONEBOT_WS_URL="${ONEBOT_WS_URL:-ws://127.0.0.1:18742}"
exec node /app/bot/dist/index.js
