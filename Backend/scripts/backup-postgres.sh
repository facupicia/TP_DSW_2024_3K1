#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${BACKUP_DATABASE:?Set the application database name explicitly}"
PG_CONTAINER="${PG_CONTAINER:-postgres-server}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/eventlife-backups}"
[[ "$BACKUP_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || { printf 'Invalid database name\n' >&2; exit 1; }
[[ "$PG_CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]] || { printf 'Invalid container name\n' >&2; exit 1; }
[[ "$BACKUP_DIR" = /* ]] || { printf 'Backup directory must be absolute\n' >&2; exit 1; }
mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { printf 'Another backup is active\n' >&2; exit 1; }

temporary="$(mktemp "$BACKUP_DIR/.postgres-XXXXXXXX.dump")"
trap 'rm -f -- "$temporary"' EXIT
docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom' sh "$BACKUP_DATABASE" > "$temporary"
docker exec -i "$PG_CONTAINER" pg_restore --list < "$temporary" > /dev/null
name="${BACKUP_DATABASE}-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
mv -- "$temporary" "$BACKUP_DIR/$name"
(cd "$BACKUP_DIR" && sha256sum -- "$name" > "$name.sha256")
printf 'BACKUP_OK %s\n' "$BACKUP_DIR/$name"
# No automatic deletion: choose retention together with an off-host destination.
