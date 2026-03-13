#!/usr/bin/env bash
# 服务器上一键部署（仅拉取镜像，无需源码）
# 用法：把本仓库的 docker-compose.yml 放到某目录，进入该目录后执行:
#   bash scripts/deploy-server.sh
# 或直接: curl -sL https://raw.githubusercontent.com/.../deploy-server.sh | bash
# （需保证当前目录已有 docker-compose.yml）

set -e
cd "$(dirname "$0")/.."

if [ ! -f docker-compose.yml ]; then
  echo "错误: 当前目录没有 docker-compose.yml，请先进入项目目录或复制 docker-compose.yml 到当前目录"
  exit 1
fi

echo "[1/4] 创建数据目录..."
mkdir -p data

echo "[2/4] 停止可能存在的旧容器（避免端口/名称冲突）..."
docker stop qq-bot napcat 2>/dev/null || true
docker rm qq-bot napcat 2>/dev/null || true

echo "[3/4] 拉取镜像并启动..."
docker compose pull
docker compose up -d

echo "[4/4] 状态:"
docker compose ps

echo ""
echo "NapCat 就绪后 qq-bot 会自动连上。查看日志:"
echo "  docker logs -f napcat   # NapCat"
echo "  docker logs -f qq-bot   # QQ 机器人"
echo "WebUI: http://<服务器IP>:18741"
