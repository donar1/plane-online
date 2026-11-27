# 打飞机联机版 · 容器镜像
# 魔搭创空间要求：服务必须监听 0.0.0.0、端口固定 7860（不可改）、不能占用 8080
FROM node:22-slim

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 再拷代码
COPY server.js ./
COPY public ./public

# 创空间固定 7860；本地 docker run 时可用 -e PORT=3000 覆盖
ENV PORT=7860 \
    NODE_ENV=production

EXPOSE 7860

CMD ["node", "server.js"]
