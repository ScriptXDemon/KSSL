#!/usr/bin/env bash
# Deploy a committed ref (default v2) to the VPS (compose project kssl2 in /opt/kssl-v2) and bring the
# VPS serving schema up to date.   bash deploy/deploy_vps.sh [git-ref]
#   1. ships `git archive <ref>` (committed files only -- never the working tree) to /opt/kssl-v2.
#      backend/ src/ public/ are replaced whole (no stale files); everything else is overwritten in place,
#      so untracked files on the VPS (.env secrets) are kept.
#   2. docker compose build + up -d in /opt/kssl-v2/deploy
#   3. applies the idempotent setup SQL to kssl_serving (staging tables arrive with db/sync_staging_to_vps.sh)
#      and grants the app role access to every table.
# Secrets stay on the VPS; nothing here prints them.
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-v2}"
SSH=(ssh -i "$HOME/.ssh/kssl_vps" -o ConnectTimeout=20 -o BatchMode=yes root@62.72.59.79)
PSQL_VPS="docker exec -i kssl2-db psql -v ON_ERROR_STOP=1 -q -U kssl_admin"

echo "== shipping $(git rev-parse --short "$REF") ($REF)"
git archive --format=tar "$REF" | gzip | "${SSH[@]}" \
  'set -e; cd /opt/kssl-v2 && rm -rf backend src public && tar -xzf - && echo "   unpacked"'

echo "== build + up"
"${SSH[@]}" 'cd /opt/kssl-v2/deploy && docker compose build -q && docker compose up -d &&
  docker ps --format "{{.Names}} {{.Status}}" | grep kssl2'

echo "== serving schema"
# 11_foundations comes from the parallel workstream and may still be untracked locally; applied if present
for f in db/setup/08_competitor_text_columns.sql db/setup/11_foundations.sql db/setup/09_ui_port_tables.sql db/setup/15_signal_published_date.sql; do
  if [ -f "$f" ]; then echo "   $f"; "${SSH[@]}" "$PSQL_VPS -d kssl_serving" < "$f"; else echo "   skip $f (not here)"; fi
done
for db in kssl_serving kssl_staging; do
  "${SSH[@]}" "$PSQL_VPS -d $db" <<'SQL'
DO $$ DECLARE s text; BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname IN ('ui','serving','staging','staging_ui') LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO kssl_app', s);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO kssl_app', s);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO kssl_app', s);
  END LOOP; END $$;
SQL
done

echo "== health"
"${SSH[@]}" 'for c in kssl2-api kssl2-api-review; do
  docker exec $c python -c "import urllib.request,sys; print(sys.argv[1], urllib.request.urlopen(\"http://127.0.0.1:8600/api/health\").status)" $c; done'
