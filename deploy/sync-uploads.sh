#!/usr/bin/env bash
# ============================================================================
# 予时妍 YUÉ ATELIER · 上传素材同步（容器卷 → 宿主静态目录）
#
# 用法（在服务器上）：
#     sudo bash /opt/mua/deploy/sync-uploads.sh
#
# 为什么需要这个脚本（架构决定的，不是多余的）：
#   后台上传的图/视频由 API 写进**容器卷** mua_uploads_assets:/app/data/uploads，
#   而宿主 Nginx 托管的静态根是 /opt/mua/site —— 容器卷里的文件 Nginx 读不到。
#   所以 Nginx 侧的 /img/uploads/ 实际指向 /opt/mua/site/img/uploads（宿主路径），
#   需要把容器卷里的内容同步出来。
#
# 为什么是"容器 → 宿主"而不是"API 直接写宿主路径"：
#   · 容器可写卷、不可写宿主源码目录（权限隔离，避免应用改代码）
#   · 容器重建不丢素材（卷独立于镜像生命周期）
#   代价就是多一次同步 —— 用 rsync 增量，几百毫秒。
#
# 何时需要跑：
#   ① 首次部署后（把本地uploads 种子推进容器卷，再从容器卷同步到宿主）
#   ② 平时**不需要**跑：update.sh 每次部署完会调用一次
#   ③ 怀疑前端取图 404 时可手动跑一次
# ============================================================================
set -euo pipefail

VOL="mua_uploads_assets"
DEST="/opt/mua/site/img/uploads"
CONTAINER_SRC="/data"

say() { echo "[$(date '+%F %T')] $*"; }

if [ "$(id -u)" != "0" ]; then
  say "✗ 需要 root（要读容器卷、往宿主目录写）⇒ 请用 sudo bash $0"
  exit 1
fi

if ! docker volume inspect "$VOL" >/dev/null 2>&1; then
  say "✗ 卷 $VOL 不存在 ⇒ mua-api 容器可能还没起过。先跑 deploy/update.sh。"
  exit 1
fi

mkdir -p "$DEST"

# -a 归档（保留权限/时间）· -z 压缩 · --delete 删掉宿主多出的旧文件
# --delete 是必须的：否则删掉的一张图在宿主侧仍会被 Nginx 发出去（"删了却还在"）
say "同步 $VOL → $DEST …"
docker run --rm \
  -v "$VOL":"$CONTAINER_SRC" \
  -v "$DEST":"$DEST" \
  alpine:3 sh -c "apk add --no-cache rsync >/dev/null 2>&1 && rsync -az --delete $CONTAINER_SRC/ '$DEST'"

COUNT=$(find "$DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
say "✓ 同步完成：$COUNT 个文件，共 $SIZE"
