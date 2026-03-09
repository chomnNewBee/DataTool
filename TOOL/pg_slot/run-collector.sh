#!/usr/bin/env bash
set -euo pipefail

# 可选并发(默认5) 通过第一个参数指定，例如: ./run-collector.sh 8
CONCURRENCY=${1:-159}

# 使用 ts-node 执行多任务采集 (自动读取 list.txt)
if ! command -v npx >/dev/null 2>&1; then
  echo "需要 npm / npx 支持" >&2
  exit 1
fi

npx ts-node multi-collector.ts --concurrency=1 --processors=1
