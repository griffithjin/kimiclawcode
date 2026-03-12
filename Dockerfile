# ==========================================
# Tower of Fate V1.3.12 - Docker 构建文件
# ==========================================

FROM node:20-alpine AS base

# 安装依赖
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ==========================================
# 依赖安装阶段
# ==========================================
FROM base AS deps

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# ==========================================
# 构建阶段
# ==========================================
FROM base AS builder

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建（如果有前端构建步骤）
# RUN npm run build

# ==========================================
# 生产运行阶段
# ==========================================
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# 创建日志目录
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs

# 复制必要文件
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/docs ./docs

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# 暴露端口
EXPOSE 3000

# 切换到非 root 用户
USER nodejs

# 启动命令
CMD ["node", "src/server.js"]
