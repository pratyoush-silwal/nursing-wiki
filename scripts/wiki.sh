#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  printf 'Missing %s/.env. Copy .env.example to .env and set your credentials first.\n' "$ROOT_DIR" >&2
  exit 1
fi

compose=(docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/docker-compose.yml")

prepare_object_storage() {
  local root=/data/objects
  if [[ -L "$root" ]]; then
    printf 'Refusing to change ownership: %s is a symlink.\n' "$root" >&2
    return 1
  fi
  if [[ ! -d "$root" ]]; then
    if (( EUID == 0 )); then
      install -d -m 0755 -o 1000 -g 1000 -- "$root"
    else
      sudo install -d -m 0755 -o 1000 -g 1000 -- "$root"
    fi
  fi

  local path owner needs_fix=0
  for path in "$root" "$root/articles" "$root/.drafts" "$root/.deletions" "$root/.edits"; do
    [[ ! -L "$path" ]] || { printf 'Refusing to change ownership: %s is a symlink.\n' "$path" >&2; return 1; }
    [[ ! -e "$path" ]] && continue
    owner="$(stat -c '%u:%g' -- "$path")"
    if [[ "$owner" != 1000:1000 || ! -w "$path" ]]; then needs_fix=1; fi
  done

  if (( needs_fix )); then
    printf 'Fixing ownership of the dedicated object-storage directory for API UID 1000.\n'
    if (( EUID == 0 )); then
      chown -R --no-dereference 1000:1000 -- "$root"
    else
      sudo chown -R --no-dereference 1000:1000 -- "$root"
    fi
  fi
}

usage() {
  cat <<'EOF'
Usage: scripts/wiki.sh COMMAND [SERVICE...]

  start          Fix object-storage permissions, build, and start all services
  stop           Stop all services; preserve containers and data
  restart        Restart all services
  status         Show service and API health status
  logs [SERVICE] Follow all logs, or just the named service (default: api)
  seed-demo      Import 106 demo articles and six sample flashcard decks (prompts for owner login)
  down           Remove containers and network; preserve all data volumes
EOF
}

command_name="${1:-}"
case "$command_name" in
  start)
    for file in infra/tls/fullchain.pem infra/tls/privkey.pem; do
      if [[ ! -s "$file" ]]; then
        printf 'Missing TLS file: %s\nCreate the certificate and key as described in README.md, then retry.\n' "$file" >&2
        exit 1
      fi
    done
    prepare_object_storage
    if ! "${compose[@]}" up --build --detach --wait --wait-timeout 180; then
      "${compose[@]}" ps
      printf '\nStartup failed. Inspect logs with: bash scripts/wiki.sh logs api\n' >&2
      exit 1
    fi
    # Apply bind-mounted proxy configuration and discard old upstream addresses.
    "${compose[@]}" restart nginx
    "${compose[@]}" ps
    ;;
  stop)
    "${compose[@]}" stop
    ;;
  restart)
    "${compose[@]}" restart
    ;;
  status)
    "${compose[@]}" ps
    ;;
  logs)
    shift
    if (( $# )); then
      "${compose[@]}" logs --follow --tail=100 "$@"
    else
      "${compose[@]}" logs --follow --tail=100 api
    fi
    ;;
  seed-demo)
    read -r -p 'Owner username: ' demo_username
    read -r -s -p 'Owner password: ' demo_password
    printf '\n'
    printf '%s\n%s\n' "$demo_username" "$demo_password" | "${compose[@]}" exec -T api node --import tsx scripts/seed-demo.ts
    unset demo_username demo_password
    ;;
  down)
    "${compose[@]}" down --remove-orphans
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
