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
# ⚠️ safe.directory 必须在这里配好，且**不能吞掉错误**（2026-10-03 踩过，很隐蔽）。
#
#   仓库属主是 root（clone 时 sudo 创建），当脚本以 root 跑时 git 正常；
#   但只要有任一 git 命令以**非 root** 身份执行（如下面第 8 步构建 admin 时
#   若切换了用户、或有人手动用 ubuntu 跑过），git 就会报
#     fatal: detected dubious ownership in repository at '/opt/mua'
#   而原写法 `git config --global ... >/dev/null 2>&1 || true` 把这个**静默吞掉**，
#   紧接着的 `git rev-parse origin/$BRANCH` 在 set -e 下失败 ⇒ NEW_REV 为空
#   ⇒ 脚本拿着一堆空变量继续跑，工作副本永远停在旧提交，
#   却全程显示"成功"，日志里也找不到任何 git 报错。**部署看起来在跑，其实在原地踏步。**
#
#   下面两处都改成"配置后立刻验证，失败就明确退出"：
git config --global --add safe.directory "$REPO_DIR"
git config --global --add safe.directory /opt/mua.git
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  say "✗ git 拒绝访问 $REPO_DIR（dubious ownership）。已尝试写入 safe.directory 但仍失败。"
  say "  请检查： sudo git config --global --add safe.directory $REPO_DIR"
  exit 1
fi

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
# ⚠️ 这里的 `git reset --hard "$OLD_REV"` 是**部署编排配置**的回滚，
#    不是业务代码的。它有一个实测踩过的陷阱：
#      回滚会连带把 deploy/docker-compose.yml 一起退回旧版，
#      而旧版 compose 里可能有**当时还没发现的 bug**（例如 logging 键名写错）。
#      于是 `docker compose up -d` 用坏配置重建容器 → 重现同一个错误 →
#      「回滚」本身失败，线上既没有新版本也没有旧版本。
#    实测：2026-10-03 首次部署就是这样，API 明明健康（/api/health 200），
#    健康检查却因 502 超时，回滚又因旧 compose 报错，最后全线卡死。
#
#    正确做法：**回滚只回滚镜像，不回滚编排文件**。
#    编排配置（compose / nginx）属于「环境」，修复它对旧镜像只有好处没有坏处；
#    旧镜像配新编排照样能跑（本次实测 mua-api:prev + 新 compose 正常启动）。
#    所以这里**不 reset**，只切镜像标签。
rollback() {
  say "！！ 更新失败：$1"
  say "自动回滚镜像到 ${OLD_REV:0:8}（**不**回退编排配置，见函数头注释）…"
  # 工作副本代码保持在失败的新版本 —— 它是当前 origin/main，
  # 下次重跑 update.sh 能直接拿到修复后的内容；回退代码只会把 bug 一起带回来。
  if docker image inspect mua-api:prev >/dev/null 2>&1; then
    docker tag mua-api:prev mua-api:latest || true
    cd "$SCRIPT_DIR"
    docker compose up -d --force-recreate --remove-orphans 2>&1 | tail -5 || true
  else
    say "  ⚠ 没有 :prev 镜像可回退（首次部署场景），请人工介入。"
  fi
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
# ⚠️ 切完必须核对真的到位了（2026-10-03 踩过）：
#   曾出现裸仓已是新提交、工作副本却停在旧提交的情况，脚本全程无报错、
#   日志一片正常，但**部署的是旧代码**（编排文件也因此是旧的，缺 diagnose 段）。
#   根因是 safe.directory 失败被静默吞掉，导致 NEW_REV 取空。
#   这里显式比对，多花 0.01 秒换掉一整类"假成功"。
ACTUAL_REV="$(git rev-parse HEAD)"
if [ "$ACTUAL_REV" != "$NEW_REV" ]; then
  say "✗ 切代码后校验失败：期望 ${NEW_REV:0:8}，实际 ${ACTUAL_REV:0:8}"
  say "  多半是 git safe.directory / 权限问题；脚本终止，不要在这种状态下继续。"
  exit 1
fi
say "代码已切换到 ${NEW_REV:0:8}（已校验）"

cd "$SCRIPT_DIR"

# uploads 目录权限：这是本项目最容易踩的一处，两端都要照顾到。
#
#   写的一侧：bind mount 的宿主目录必须对容器内 node 用户（uid 1000）可写，
#             否则后台上传静默 EACCES。git 不跟踪权限位，clone 出来是 root:root 755。
#   读的一侧：宿主 Nginx 以 **www-data** 身份跑，必须能读 uploads 里的每个文件。
#
# ⚠️ 为什么必须显式 chmod 644（2026-10-03 首次部署踩过）：
#   素材第一次是 tar/rsync 传上来的，**会保留源文件权限**。
#   本地 macOS 上有些视频是 -rw-------（仅属主可读），
#   传到服务器后 nginx 读不了 ⇒ 前台视频 **403**，
#   而同目录的 png 是 644 ⇒ 图片正常、视频 403。
#   这种"部分资源 403、部分正常"的分裂现象极难定位，
#   一定要连文件权限一起核对（curl 一下每个类型，别只看目录存在）。
#   nginx 错误日志里的 `open() ... failed (13: Permission denied)` 是判据。
if [ -d "$REPO_DIR/site/img/uploads" ]; then
  chown -R 1000:1000 "$REPO_DIR/site/img/uploads" 2>/dev/null || true
  # 目录 755（可遍历可列）、文件 644（www-data 可读、node 可读）
  find "$REPO_DIR/site/img/uploads" -type d -exec chmod 755 {} + 2>/dev/null || true
  find "$REPO_DIR/site/img/uploads" -type f -exec chmod 644 {} + 2>/dev/null || true
  # macOS 资源叉垃圾：tar/scp 传输会带出 ._xxx（AppleDouble），共 28 个左右。
  # 它们不影响功能但会污染目录、且在某些工具下被当真实文件扫到。
  find "$REPO_DIR/site/img/uploads" -name '._*' -type f -delete 2>/dev/null || true
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
#
# ⚠️ 超时时**必须打印分层诊断**，否则只能干瞪眼（2026-10-03 实测踩过）：
#   当时容器 healthy、docker exec 直连 /api/health 200 且 db:true，
#   但经 Nginx 就是 502 —— 因为 compose 用的是 `expose` 而非 `ports`，
#   宿主上根本没开监听端口，而后端确实好好地活着，只是"没有门进"。
#   没有这层诊断的话，看到「健康检查超时」只能怀疑后端挂了，
#   实际上后端一点问题都没有。
diagnose() {
  say "----- 分层诊断 -----"
  local c
  for c in $(docker compose ps -q api 2>/dev/null); do
    say "  容器状态: $(docker inspect -f '{{.State.Status}}{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c" 2>/dev/null)"
  done
  say "  宿主监听 8082: $(ss -ltn 2>/dev/null | grep -q ':8082' && echo 有 || echo '**无**（compose 用了 expose 而非 ports？宿主 Nginx 连不上）')"
  say "  直连后端 8082: $(curl -fsS --max-time 5 http://127.0.0.1:8082/api/health 2>/dev/null || echo '**不通**')"
  say "  经 Nginx /api/health: HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${HTTP_PORT}/api/health 2>/dev/null || echo '**不通**')"
  say "  经 Nginx /healthz:    HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${HTTP_PORT}/healthz 2>/dev/null || echo '**不通**')"
  say "---------------------"
}

say "健康检查（最多等待 ${HEALTH_WAIT}s）…"
deadline=$(( $(date +%s) + HEALTH_WAIT ))
HEALTHY=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  if curl -fsS --max-time 5 "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1 \
     && curl -fsS --max-time 5 "http://127.0.0.1:${HTTP_PORT}/api/health" >/dev/null 2>&1; then
    say "✓ 新版本健康，部署完成：${NEW_REV:0:8}"
    docker compose ps
    HEALTHY=1
    break
  fi
  sleep 5
done

# ⚠️ 这里必须靠标志位分支，**不能靠"循环跑完就往下走"**（2026-10-03 踩过）：
#   健康检查成功时若不 break，循环会一直转到 deadline，
#   然后把一次**成功的部署**报成"新版本启动后健康检查未通过"并触发回滚。
#   表现极具迷惑性：日志里几十行「✓ 新版本健康，部署完成」，
#   紧接着却是「！！ 更新失败」—— 明明成功了却说失败。
if [ "$HEALTHY" != "1" ]; then
  diagnose
  rollback "新版本启动后健康检查未通过"
fi

# ------------------------------------------------------------------ 11) 收尾
# uploads 是 bind mount（宿主 /opt/mua/site/img/uploads ⇄ 容器 /site/img/uploads），
# API 写入与 Nginx 读取同属一个目录，无需同步。sync-uploads.sh 已随之退休。
#
# ⚠️ 这里做**真实验证**而不是「配了就当好了」—— 2026-10-03 首次部署就是
#    配完权限就以为完事，结果前台视频一直 403：
#      写侧：容器内 node 用户能否写（test -w）
#      读侧：宿主 nginx 能否真的取到文件（curl 实取一个真实文件，拿 HTTP 码）
#    两者都不是配置能保证的，必须实测。
say "校验上传目录（写：容器 node 用户 / 读：宿主 nginx）…"
if ! docker compose exec -T api test -w /site/img/uploads 2>/dev/null; then
  say "  ✗ 容器内 /site/img/uploads 不可写 ⇒ 后台上传会 EACCES 失败。"
  say "    修复： sudo chown -R 1000:1000 $REPO_DIR/site/img/uploads"
else
  say "  ✓ 容器内可写（上传可用）"
fi
# 取目录里任意一个真实文件做读验证（优先视频，因为权限问题最先在视频上暴露）
SAMPLE="$(find "$REPO_DIR/site/img/uploads" -maxdepth 1 -type f \( -name '*.mp4' -o -name '*.png' -o -name '*.jpg' \) -printf '%f\n' 2>/dev/null | head -1)"
if [ -n "$SAMPLE" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${HTTP_PORT}/img/uploads/$SAMPLE" 2>/dev/null || echo 000)"
  if [ "$CODE" = "200" ] || [ "$CODE" = "206" ]; then
    say "  ✓ 宿主可读（$SAMPLE → HTTP $CODE）"
  else
    say "  ✗ 宿主读不到 $SAMPLE（HTTP $CODE）⇒ 前台素材会加载失败。"
    say "    修复： sudo chmod 644 $REPO_DIR/site/img/uploads/*"
  fi
else
  say "  ⚠ uploads 目录里没有可用文件（首次部署需先上传素材）"
fi

# ------------------------------------------------------------------ 12) 同步 Nginx 站点配置
# ⚠️ **必须做**（2026-10-04 分叉事故的直接对策）：
#    此前本脚本完全不管 nginx，服务器跑的是早期手工写的一份，
#    而仓库里那份带 gzip/缓存/正确 healthz/正确 admin alias 的配置**从未部署**。
#    两份并存且互不干涉，肉眼完全看不出来，直到某个功能出事才暴露。
#    现在每次部署都用仓库版本覆盖，让「仓库 = 线上」成为不变量。
#
#    安全边界：只在 nginx -t 通过后才 reload。语法不过就 reload 会把现有站点全搞挂，
#    所以失败时宁可保留旧配置、只告警。
if [ -f "$SCRIPT_DIR/nginx.conf" ]; then
  NGX_TARGET="${NGX_TARGET:-/etc/nginx/sites-available/mua}"
  if [ -d "$(dirname "$NGX_TARGET")" ]; then
    if cp "$SCRIPT_DIR/nginx.conf" "$NGX_TARGET" 2>/dev/null; then
      if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx 2>/dev/null || true
        say "  ✓ Nginx 站点配置已同步并重载"
      else
        say "  ⚠ $SCRIPT_DIR/nginx.conf 语法未通过，已保留旧配置线上不动："
        nginx -t 2>&1 | tail -3 | sed 's/^/      /'
      fi
    fi
  else
    say "  ⚠ 未找到 $(dirname "$NGX_TARGET")，跳过 nginx 同步（非标准安装？）"
  fi
fi

say "✓ 全部完成：${NEW_REV:0:8}（前台 /  → http://127.0.0.1:${HTTP_PORT}/）"
docker image prune -f >/dev/null 2>&1 || true
exit 0
