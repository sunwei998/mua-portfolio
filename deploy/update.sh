#!/usr/bin/env bash
# ============================================================================
# 予时妍 YUÉ ATELIER · 服务端一键更新（人工部署与 CI 自动部署共用同一入口）
#
#   在服务器上执行：  sudo bash /opt/mua/deploy/update.sh
#   ⚠️ **必须用 root / sudo**：
#      · /opt/mua/.git 属root，普通用户 git fetch 会报
#        `cannot open '.git/FETCH_HEAD': Permission denied`——
#        这个报错看起来像"连不上远端"，极易被误判成网络问题（sanhe 实测踩过）
#      · 脚本用 docker compose（不带 sudo），非 root 也过不了
#
# 设计要点（沿用 sanhe 的成熟做法，每一条都有代价换来的）：
#   1) **幂等**：没有新提交就 exit 0、不重建 —— 可安全放进 cron 反复跑。
#   2) **先备份再更新**：数据库迁移是单向的，代码能回滚、数据回滚不了。
#   3) **先构建再切换**：build 失败时线上仍是旧容器在服务，不 downtime。
#   4) **健康检查 + 自动回滚**：新版本起不来就自动退回上一版。
#   5) **数据库不自动回滚**：只打印备份路径由人决定——
#      自动还原会用旧数据覆盖这期间录入的内容，那比停机更糟。
#
# 环境变量（可选）：
#   BRANCH       要跟随的分支，默认 main
#   HEALTH_WAIT  健康检查最长等待秒数，默认 120
#   SKIP_MIGRATE 设为 1 时跳过数据库迁移（纯前端改版时省一次连接开销）
#   FORCE        设为 1 时**跳过幂等短路**，即使没有新提交也强制走一遍构建。
#                首次部署必用：此时 HEAD 已等于 origin/main，幂等判断会
#                「无新提交 → exit 0」，容器根本没起来（排查时极具迷惑性：
#                脚本 exit 0 一片绿，站点却 502）。
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"          # deploy/ 的上一级 = 仓库根
BRANCH="${BRANCH:-main}"
HEALTH_WAIT="${HEALTH_WAIT:-120}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"
FORCE="${FORCE:-0}"
BACKUP_DIR="${BACKUP_DIR:-/opt/mua/backups}"

# 对外端口（与 env.example 一致；update.sh 里的自检要用）
HTTP_PORT="${HTTP_PORT:-8083}"

say() { echo "[$(date '+%F %T')] $*"; }

# ------------------------------------------------------------------ 0) 前置检查
cd "$REPO_DIR"

# 运行身份自检（理由见文件头）
if [ "$(id -u)" != "0" ]; then
  SELF="$(basename "${BASH_SOURCE[0]}")"
  if [ -d .git ] && [ ! -w .git ]; then
    say "✗ 当前用户（$(id -un)）无法写入 $REPO_DIR/.git（属主 $(stat -c '%U:%G' .git 2>/dev/null || echo '非 root')）"
    say "  ⇒ 接下来 git fetch 会报 \"cannot open '.git/FETCH_HEAD': Permission denied\"。"
    say "     这是本地权限问题，与远端 /opt/mua.git 能否访问无关。"
    say "  请改用： sudo bash $SCRIPT_DIR/$SELF"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    say "✗ 当前用户（$(id -un)）没有 docker 权限 ⇒ 脚本里的 docker compose 会失败。"
    say "  请改用： sudo bash $SCRIPT_DIR/$SELF"
    exit 1
  fi
fi

if [ ! -d .git ]; then
  say "✗ $REPO_DIR 还不是 git 仓库（最初是用 rsync 传上来的），请先执行一次："
  cat <<EOT

    cd /opt/mua
    sudo git init
    # 部署源是服务器本地的裸仓库 /opt/mua.git（不连 GitHub；GitHub 只是备份镜像）
    sudo git remote add origin /opt/mua.git
    sudo git fetch origin main
    sudo git reset --hard origin/main
    # .env 属被忽略的未跟踪文件，不会被删掉

EOT
  exit 1
fi
git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true

# ------------------------------------------------------------------ 1) 取新代码
say "拉取 origin/$BRANCH …"
if ! git fetch --quiet origin "$BRANCH"; then
  say "✗ git fetch 失败：检查 origin（应为 /opt/mua.git）是否可访问，或本地是否已 push 新提交到该裸仓库。"
  say "  ⚠️ 若报 \"cannot open '.git/FETCH_HEAD': Permission denied\"，那是没以 root 运行 ⇒ 请 sudo 重跑。"
  exit 1
fi

NEW_REV="$(git rev-parse "origin/$BRANCH")"
OLD_REV="$(git rev-parse HEAD)"
if [ "$NEW_REV" = "$OLD_REV" ] && [ "$FORCE" != "1" ]; then
  say "无新提交（HEAD=${OLD_REV:0:8}），跳过构建。"
  exit 0
fi
if [ "$FORCE" = "1" ]; then
  say "FORCE=1：跳过幂等短路，强制构建 ${OLD_REV:0:8} → ${NEW_REV:0:8}"
else
  say "发现新版本 ${OLD_REV:0:8} → ${NEW_REV:0:8}"
fi

# ------------------------------------------------------------------ 2) 更新前备份
# 备份放在**迁移之前**：迁移是单向的，出问题时要还原的正是迁移前的数据。
mkdir -p "$BACKUP_DIR"

# 读 deploy/.env 拿数据库凭据（与 compose 用的是同一份，口径唯一）
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
  MUA_DB_USER="${DB_USER:-mua}"
  MUA_DB_PASSWORD="${DB_PASSWORD:-}"
  HTTP_PORT="${HTTP_PORT:-8083}"
fi
if [ -z "${MUA_DB_PASSWORD:-}" ]; then
  say "✗ deploy/.env 里没有 DB_PASSWORD —— 无法备份数据库，拒绝更新。"
  say "  （备份不了就不动数据：迁移不可逆，出问题将无法还原）"
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx sanhe-mysql; then
  say "备份数据库 mua_portfolio → $BACKUP_DIR"
  # ⚠️ 凭据从 deploy/.env 读（DB_USER / DB_PASSWORD），**不用**容器里的
  #    $MYSQL_PASSWORD —— 那是 sanhe 自己的数据库账号，导 mua 库会 Access denied。
  #    而且不能写成 `mysqldump -p$PASS` 裸传：那样密码会进容器进程列表
  #    （docker exec ... ps 全服可见）。用 MYSQL_PWD 环境变量传参更安全。
  DB_DUMP="$BACKUP_DIR/mua-db-$(date +%F-%H%M).sql.gz"
  set +e
  docker exec -e MYSQL_PWD="$MUA_DB_PASSWORD" sanhe-mysql \
    mysqldump -u"$MUA_DB_USER" --single-transaction --quick mua_portfolio 2>/tmp/mua-dump.err \
    | gzip > "$DB_DUMP"
  DUMP_RC=${PIPESTATUS[0]}
  set -e
  SIZE=$(wc -c < "$DB_DUMP" | tr -d ' ')
  # 防「备份成功但内容是空的」：dump 太小基本可断定失败（正常库远大于此）
  if [ "$DUMP_RC" != "0" ] || [ "$SIZE" -lt 512 ]; then
    say "✗ 数据库备份异常（rc=$DUMP_RC，${SIZE} 字节）—— 宁可不更新，也不在无备份的情况下动数据库。"
    say "  错误信息：$(head -3 /tmp/mua-dump.err 2>/dev/null | tr '\n' ' ')"
    exit 1
  fi
  say "  ✓ 备份完成 ${DB_DUMP}（${SIZE} 字节）"
else
  say "sanhe-mysql 未运行（视为首次部署），跳过数据库备份。"
fi

# ------------------------------------------------------------------ 3) 记住旧镜像
# 打 :prev 标签后，回滚只是把旧镜像重新打回 :latest，无需重新构建（快且必定成功）
if docker image inspect mua-api:latest >/dev/null 2>&1; then
  docker tag mua-api:latest mua-api:prev || true
fi

# ------------------------------------------------------------------ 4) 回滚函数
rollback() {
  say "！！ 更新失败：$1"
  say "自动回滚到 ${OLD_REV:0:8} …"
  cd "$REPO_DIR" && git reset --hard --quiet "$OLD_REV"
  cd "$SCRIPT_DIR"
  if docker image inspect mua-api:prev >/dev/null 2>&1; then
    docker tag mua-api:prev mua-api:latest || true
  fi
  docker compose up -d --remove-orphans || true
  say "----- API 最后 60 行日志 -----"
  docker compose logs --tail 60 api 2>/dev/null || true
  say "已回滚。注意：数据库未回滚（迁移不可逆）。"
  say "若确需还原数据，用本次更新前的备份文件："
  ls -lt "$BACKUP_DIR"/mua-db-*.sql.gz 2>/dev/null | head -3 || echo "  （未找到备份文件，目录：${BACKUP_DIR}）"
  exit 1
}

# ------------------------------------------------------------------ 5) 切代码
cd "$REPO_DIR"
git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -B "$BRANCH" "origin/$BRANCH"
git reset --hard --quiet "$NEW_REV"
say "代码已切换到 ${NEW_REV:0:8}"

cd "$SCRIPT_DIR"

# uploads 目录权限：bind mount 的宿主目录必须对容器内 node 用户（uid 1000）可写，
# 否则后台上传静默 EACCES。git 不跟踪目录权限位，clone 出来是 root:root 755。
if [ -d "$REPO_DIR/site/img/uploads" ]; then
  chown -R 1000:1000 "$REPO_DIR/site/img/uploads" 2>/dev/null || true
  chmod 755 "$REPO_DIR/site/img/uploads" 2>/dev/null || true
fi

# ------------------------------------------------------------------ 6) 装依赖 + 构建
# 依赖装在仓库目录（node_modules/），不进镜像层——镜像只带 src 与迁移。
# 这样切代码后只需增量装变更的依赖，不必每次重建镜像。
say "安装 server 依赖（--ignore-scripts 跳过 ffmpeg 下载，见 Dockerfile.api 注释）…"
if ! npm --prefix "$REPO_DIR/server" ci --omit=dev --ignore-scripts; then
  say "  依赖安装失败，重试一次（网络抖动）…"
  npm --prefix "$REPO_DIR/server" ci --omit=dev --ignore-scripts || rollback "依赖安装失败"
fi

say "构建 API 镜像（首次较慢，之后走缓存通常 1-2 分钟）…"
docker compose build || rollback "镜像构建失败"

# ------------------------------------------------------------------ 7) 数据库迁移
# ⚠️ 必须在新镜像起来**之前**跑：迁移失败要能干净回滚，不留半启动状态。
# 迁移脚本自带 _migrations 账本（sha256 校验），重复执行是幂等的。
if [ "$SKIP_MIGRATE" != "1" ]; then
  say "执行数据库迁移…"
  # 用一次性容器跑迁移：镜像已构建、代码已就位，但不影响正在服务的旧容器
  if ! docker compose run --rm --no-deps api node_modules/.bin/tsx src/db/migrate.ts; then
    rollback "数据库迁移失败"
  fi
  say "  ✓ 迁移完成"
else
  say "SKIP_MIGRATE=1，跳过数据库迁移。"
fi

# ------------------------------------------------------------------ 8) 构建后台前端
# ⚠️ admin/dist **不入库**（.gitignore ②：构建产物不进版本库），
#    所以每次部署都必须在服务器上现构建。
#    实测峰值 524MB / 9秒（单端后台，比 sanhe 的 PC+H5 双端 1.5GB 轻得多），
#    机器可用内存足够。构建失败时线上仍是旧 dist（build 输出到临时目录再替换）。
say "构建后台前端（vite build，产物在 admin/dist）…"
# 构建期间内存吃紧时先提醒，但不自动停任何容器 —— 本项目只新增一个 API 容器，
# 且实测峰值 524MB，没有 sanhe 那种"必须停库腾内存"的必要。
if ! (cd "$REPO_DIR/admin" && npm ci --no-audit --no-fund && npm run build); then
  say "  ⚠ 后台构建失败，保留旧 dist 继续部署前台与 API"
  say "    （后台会暂时是上一个版本；修完代码重新跑本脚本即可）"
else
  say "  ✓ 后台构建完成"
fi

# ------------------------------------------------------------------ 9) 起新容器
say "启动新版本…"
docker compose up -d --remove-orphans || rollback "容器启动失败"

# ------------------------------------------------------------------ 10) 健康检查
# 两个入口都验：/healthz 验 Nginx、/api/health 验后端（含 DB ping）真的起来了
say "健康检查（最多等待 ${HEALTH_WAIT}s）…"
deadline=$(( $(date +%s) + HEALTH_WAIT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if curl -fsS --max-time 5 "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1 \
     && curl -fsS --max-time 5 "http://127.0.0.1:${HTTP_PORT}/api/health" >/dev/null 2>&1; then
    say "✓ 新版本健康，部署完成：${NEW_REV:0:8}"
    docker compose ps
  fi
  sleep 5
done

# ⚠️ 必须在这里终止：健康检查超时意味着新版本起不来，
#    若继续往下走会同步素材并 exit 0 —— 部署失败却被报成"成功"，是最坏的失败模式。
rollback "新版本启动后健康检查未通过"

# ------------------------------------------------------------------ 11) 收尾
# uploads 已是 bind mount（宿主 /opt/mua/site/img/uploads ⇄ 容器 /site/img/uploads），
# API 写入与 Nginx 读取同属一个目录，无需同步。sync-uploads.sh 已随之退休。
# 唯一要确认的是写权限：node 用户（uid 1000）必须能写该目录，否则后台上传会 EACCES。
if ! docker compose exec -T api test -w /site/img/uploads 2>/dev/null; then
  say "  ⚠ 容器内 /site/img/uploads 不可写 —— 后台上传会失败。"
  say "    修复： sudo chown -R 1000:1000 $REPO_DIR/site/img/uploads"
fi

say "✓ 全部完成：${NEW_REV:0:8}（前台 /  → http://127.0.0.1:${HTTP_PORT}/）"
docker image prune -f >/dev/null 2>&1 || true
exit 0
