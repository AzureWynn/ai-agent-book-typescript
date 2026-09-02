#!/usr/bin/env bash
# SearXNG 一键启动/停止脚本（本地 web-search-agent 用）
#
# 用法:
#   ./scripts/searxng.sh start    启动（首次会自动拉镜像，等待就绪）
#   ./scripts/searxng.sh stop     停止
#   ./scripts/searxng.sh restart  重启
#   ./scripts/searxng.sh status   查看状态
#   ./scripts/searxng.sh logs     查看日志
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
SEARXNG_URL="${SEARXNG_URL:-http://localhost:8080}"

cd "$PROJECT_DIR"

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ 未找到 docker，请先安装 Docker Desktop 并启动。"
    echo "   下载: https://www.docker.com/products/docker-desktop/"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker Desktop。"
    exit 1
  fi
}

wait_ready() {
  local max_wait=90  # 首次拉镜像可能较慢
  echo "⏳ 等待 SearXNG 就绪（最多 ${max_wait}s）..."
  for i in $(seq 1 "$max_wait"); do
    if curl -sf "$SEARXNG_URL/search?q=test&format=json" >/dev/null 2>&1; then
      echo "✅ SearXNG 已就绪: $SEARXNG_URL"
      return 0
    fi
    sleep 1
  done
  echo "⚠️  SearXNG 未在 ${max_wait}s 内就绪，请检查: docker compose -f $COMPOSE_FILE logs searxng"
  return 1
}

case "${1:-start}" in
  start)
    require_docker
    echo "🚀 启动 SearXNG..."
    docker compose -f "$COMPOSE_FILE" up -d
    wait_ready
    ;;
  stop)
    require_docker
    echo "🛑 停止 SearXNG..."
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    require_docker
    echo "🔄 重启 SearXNG..."
    docker compose -f "$COMPOSE_FILE" restart
    wait_ready
    ;;
  status)
    require_docker
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  logs)
    require_docker
    docker compose -f "$COMPOSE_FILE" logs -f searxng
    ;;
  *)
    echo "用法: ./scripts/searxng.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac