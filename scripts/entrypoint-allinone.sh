#!/usr/bin/env bash
set -e
# 先启动 NapCat（与官方镜像一致）
cd /app && bash entrypoint.sh &
# 等待 OneBot 端口就绪
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:18741/ >/dev/null 2>&1; then break; fi
  if [ "$i" -eq 60 ]; then echo "[QQ-BOT] NapCat 未在 60s 内就绪"; exit 1; fi
  sleep 2
done
# 本镜像内 NapCat 与 qq-bot 同容器，用 localhost
export ONEBOT_WS_URL="${ONEBOT_WS_URL:-ws://127.0.0.1:18742}"
exec node /app/bot/dist/index.js
