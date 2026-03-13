# 全家桶镜像：单镜像部署

一个镜像内包含 NapCat + qq-bot，服务器只需拉取并运行，无需 docker-compose、无需源码。

## 构建（本地）

```bash
docker build -f Dockerfile.allinone -t moment073/qq-bot-allinone:latest .
# 推送
docker push moment073/qq-bot-allinone:latest
```

## 服务器上一键运行

配置已写死在镜像里（QQ 号、RWKV 地址等），**只需一条命令**：

```bash
docker run -d --name qq-bot \
  -v $(pwd)/data:/app/napcat \
  -p 18741:18741 \
  -p 18742:18742 \
  --restart unless-stopped \
  moment073/qq-bot-allinone:latest
```

- **数据持久化**：`-v $(pwd)/data:/app/napcat` 必须，否则重启后 QQ 需重新登录。
- 要改 QQ 号、RWKV 等：改 `Dockerfile.allinone` 里的 `ENV` 后重新 build 再 push。

## 查看日志

```bash
docker logs -f qq-bot
```

## WebUI

浏览器访问：`http://服务器IP:18741`
