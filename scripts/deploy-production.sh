#!/bin/bash

# ==========================================
# Tower of Fate - Production Deployment Script
# ==========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PROJECT_NAME="tower-of-fate"
PROJECT_VERSION="1.3.12"
DOCKER_REGISTRY="ghcr.io/griffithjin"
BACKUP_DIR="/opt/backups/${PROJECT_NAME}"
LOG_FILE="/var/log/${PROJECT_NAME}/deploy.log"

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a ${LOG_FILE}
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a ${LOG_FILE}
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a ${LOG_FILE}
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a ${LOG_FILE}
}

# 检查环境
check_environment() {
    log "检查部署环境..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        error "Docker 未安装"
    fi
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose 未安装"
    fi
    
    # 检查磁盘空间
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$DISK_USAGE" -gt 80 ]; then
        warning "磁盘使用率超过 80%: ${DISK_USAGE}%"
    fi
    
    # 检查内存
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$MEMORY_USAGE" -gt 90 ]; then
        warning "内存使用率超过 90%: ${MEMORY_USAGE}%"
    fi
    
    success "环境检查通过"
}

# 备份数据
backup_data() {
    log "开始备份数据..."
    
    mkdir -p ${BACKUP_DIR}
    BACKUP_FILE="${BACKUP_DIR}/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    # 备份 PostgreSQL
    if docker-compose ps | grep -q "postgres"; then
        docker-compose exec -T postgres pg_dump -U postgres tower_of_fate > ${BACKUP_FILE}
        if [ $? -eq 0 ]; then
            success "数据库备份完成: ${BACKUP_FILE}"
        else
            error "数据库备份失败"
        fi
    fi
    
    # 备份 Redis
    if docker-compose ps | grep -q "redis"; then
        docker-compose exec -T redis redis-cli BGSAVE
        sleep 2
        docker cp $(docker-compose ps -q redis):/data/dump.rdb ${BACKUP_DIR}/redis_$(date +%Y%m%d_%H%M%S).rdb
        success "Redis 备份完成"
    fi
    
    # 清理旧备份（保留7天）
    find ${BACKUP_DIR} -type f -mtime +7 -delete
    
    success "数据备份完成"
}

# 拉取最新镜像
pull_images() {
    log "拉取最新镜像..."
    
    docker-compose pull
    
    success "镜像拉取完成"
}

# 执行数据库迁移
run_migrations() {
    log "执行数据库迁移..."
    
    # 等待 PostgreSQL 就绪
    log "等待数据库就绪..."
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
            success "数据库就绪"
            break
        fi
        sleep 2
    done
    
    # 运行迁移
    docker-compose run --rm app npm run db:migrate
    
    success "数据库迁移完成"
}

# 滚动部署
rolling_deploy() {
    log "开始滚动部署..."
    
    # 启动新容器（扩容）
    log "启动新容器..."
    docker-compose up -d --no-deps --scale app=2 app
    
    # 等待新容器健康
    log "等待新容器健康检查..."
    sleep 10
    
    # 检查新容器健康状态
    NEW_CONTAINER=$(docker-compose ps -q app | tail -1)
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' ${NEW_CONTAINER})
    
    if [ "$HEALTH_STATUS" != "healthy" ]; then
        error "新容器健康检查失败"
    fi
    
    # 停止旧容器
    log "停止旧容器..."
    OLD_CONTAINER=$(docker-compose ps -q app | head -1)
    docker stop ${OLD_CONTAINER}
    docker rm ${OLD_CONTAINER}
    
    # 缩容到正常数量
    docker-compose up -d --no-deps --scale app=1 app
    
    success "滚动部署完成"
}

# 清理旧资源
cleanup() {
    log "清理旧资源..."
    
    # 清理未使用的镜像
    docker image prune -af --filter "until=168h"
    
    # 清理未使用的卷
    docker volume prune -f
    
    # 清理构建缓存
    docker builder prune -f
    
    success "清理完成"
}

# 健康检查
health_check() {
    log "执行健康检查..."
    
    # 检查应用健康端点
    for i in {1..10}; do
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
        if [ "$HTTP_STATUS" == "200" ]; then
            success "应用健康检查通过"
            return 0
        fi
        log "健康检查尝试 ${i}/10..."
        sleep 3
    done
    
    error "健康检查失败"
}

# 发送通知
send_notification() {
    local status=$1
    local message=$2
    
    # Slack 通知
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"${PROJECT_NAME} ${PROJECT_VERSION} 部署${status}: ${message}\"}" \
            $SLACK_WEBHOOK_URL
    fi
    
    # 飞书通知
    if [ -n "$FEISHU_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"msg_type\":\"text\",\"content\":{\"text\":\"${PROJECT_NAME} ${PROJECT_VERSION} 部署${status}: ${message}\"}}" \
            $FEISHU_WEBHOOK_URL
    fi
}

# 回滚函数
rollback() {
    error "部署失败，执行回滚..."
    
    # 使用上一个版本的镜像
    docker-compose down
    docker-compose up -d
    
    # 恢复数据库（如果有备份）
    LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/*.sql | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        log "恢复数据库备份: ${LATEST_BACKUP}"
        docker-compose exec -T postgres psql -U postgres tower_of_fate < ${LATEST_BACKUP}
    fi
    
    send_notification "失败" "已回滚到上一版本"
    exit 1
}

# 主函数
main() {
    log "=============================================="
    log "开始部署 ${PROJECT_NAME} v${PROJECT_VERSION}"
    log "=============================================="
    
    # 设置错误处理
    trap rollback ERR
    
    # 执行部署步骤
    check_environment
    backup_data
    pull_images
    rolling_deploy
    run_migrations
    health_check
    cleanup
    
    log "=============================================="
    success "部署完成！"
    log "=============================================="
    
    send_notification "成功" "版本 ${PROJECT_VERSION} 已成功部署"
}

# 执行主函数
main "$@"
