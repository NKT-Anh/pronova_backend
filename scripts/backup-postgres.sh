#!/usr/bin/env sh
set -eu

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="./backups"
backup_file="$backup_dir/pronunciation_db-$timestamp.sql"

mkdir -p "$backup_dir"
docker exec pronunciation-postgres pg_dump -U postgres pronunciation_db > "$backup_file"

echo "Backup created: $backup_file"
