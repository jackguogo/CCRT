# HS-CRT-01 体验版｜医生端单端上线镜像
# 必须 Node 20：better-sqlite3 11.10.0 原生模块按 NODE_MODULE_VERSION 115 编译
FROM node:20-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
# sqlite3 CLI 供 HexHub 在容器内做一致性快照备份（.backup 会正确处理 WAL）
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY server/ ./server/
COPY web/ ./web/
RUN mkdir -p data/backups
# 服务进程实际监听三个端口；本期只在宿主机映射 3211（医生端）
EXPOSE 3210 3211 3212
CMD ["node", "server/index.js"]
