# 全家桶镜像：单镜像部署

一个镜像内包含 NapCat + qq-bot，服务器只需拉取并运行，无需 docker-compose、无需源码。

## 构建（本地）

全家桶推成 **latest**，服务器只拉 `moment073/qq-bot:latest` 即可：

```bash
docker build -f Dockerfile.allinone -t moment073/qq-bot:latest .
docker push moment073/qq-bot:latest
```

## 服务器上一键运行

先 `cd` 到要放数据的目录（如 `cd /opt/rwkv/apps/qq-bot`），然后整段粘贴执行：

```bash
mkdir -p data && docker pull moment073/qq-bot:latest && \
docker stop qq-bot 2>/dev/null; docker rm qq-bot 2>/dev/null; \
docker run -d --name qq-bot -v "$(pwd)/data:/app/napcat" -p 18741:18741 -p 18742:18742 --restart unless-stopped moment073/qq-bot:latest
```

- **数据持久化**：`-v $(pwd)/data:/app/napcat` 会把当前目录下的 `data` 挂进去，重启不丢登录。
- 要改 QQ 号、RWKV 等：改 `Dockerfile.allinone` 里的 `ENV` 后重新 build 再 push。

## 查看日志

```bash
docker logs -f qq-bot
```

## WebUI

浏览器访问：`http://服务器IP:18741`
