#!/usr/bin/env bash
#
# One command to get a working local environment: `npm run dev`.
#
# Starts Postgres, applies migrations, seeds the database if it is empty, then
# runs the API and the frontend together with their output labelled.
#
# It deliberately does the setup steps too. "Start the servers" and "make sure
# the database they need actually exists and has a schema" are the same job
# from where you are sitting, and splitting them is how you end up staring at a
# connection error on a Monday morning.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f infra/docker-compose.yml"

# Colours, but only when writing to a terminal. Piping this to a file or a log
# collector should not fill it with escape codes.
if [ -t 1 ]; then
  DIM=$'\033[2m'; BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  CYAN=$'\033[36m'; MAGENTA=$'\033[35m'; RESET=$'\033[0m'
else
  DIM=""; BOLD=""; RED=""; GREEN=""; CYAN=""; MAGENTA=""; RESET=""
fi

step() { printf "%s==>%s %s\n" "$BOLD" "$RESET" "$1"; }
fail() { printf "%serror:%s %s\n" "$RED" "$RESET" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
# Killing the npm process alone is not enough: npm spawns tsx and next, which
# spawn their own children, and orphaned dev servers keep holding ports 3000
# and 4000. The next run then fails with "port already in use" and the cause is
# invisible. So walk the tree and kill depth-first.
#
# Note this does NOT use `kill 0`, which signals the whole process group — when
# a script shares its parent's group, that takes the user's shell down with it.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

PIDS=()
cleanup() {
  trap - EXIT INT TERM

  # Nothing was started, so there is nothing to stop. Without this check a
  # failed preflight printed "stopping dev servers…" straight after its error,
  # which reads as though it had started something and then killed it.
  if [ ${#PIDS[@]} -eq 0 ]; then
    return
  fi

  printf "\n%s==>%s stopping dev servers…\n" "$BOLD" "$RESET"
  for pid in "${PIDS[@]}"; do
    [ -n "$pid" ] && kill_tree "$pid"
  done

  # A bounded wait, not a bare `wait`. If anything survives the signal, an
  # unbounded wait hangs the shell forever with no explanation — which is
  # exactly what happened the first time this was tested.
  for _ in $(seq 1 20); do
    pgrep -f "tsx watch src/index.ts|next dev|next-server" >/dev/null 2>&1 || break
    sleep 0.25
  done
  printf "%sPostgres is still running — 'npm run db:down' stops it.%s\n" "$DIM" "$RESET"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker info >/dev/null 2>&1 || fail "Docker is not running — start Docker Desktop and try again"

# The containerised stack binds the same ports. Catching that here with a clear
# message beats two servers failing to bind a minute from now.
if $COMPOSE ps --services --filter status=running 2>/dev/null | grep -qE '^(backend|frontend)$'; then
  fail "the container stack is running and holds ports 3000/4000.
       Stop it first:  npm run stack:down"
fi

for port in 3000 4000; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $port is already in use — something else is listening on it"
  fi
done

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
step "starting Postgres"
$COMPOSE up -d postgres >/dev/null

printf "%s    waiting for it to accept connections…%s\n" "$DIM" "$RESET"
for _ in $(seq 1 60); do
  if $COMPOSE exec -T postgres pg_isready -U nekretnine -d nekretnine >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
$COMPOSE exec -T postgres pg_isready -U nekretnine -d nekretnine >/dev/null 2>&1 \
  || fail "Postgres did not become ready in 60s — check 'npm run stack:logs'"

step "applying migrations"
npm run db:migrate --silent

# Seed only an empty database. Re-seeding one you have been working in would
# delete the listings you created, which is a genuinely annoying surprise.
USER_COUNT=$($COMPOSE exec -T postgres psql -U nekretnine -d nekretnine -t -A -c \
  "select count(*) from users;" 2>/dev/null | tr -d '[:space:]' || echo 0)

if [ "${USER_COUNT:-0}" = "0" ]; then
  step "database is empty — seeding test data"
  npm run db:seed --silent
else
  printf "%s==>%s database already has data (%s users) — not seeding\n" "$BOLD" "$RESET" "$USER_COUNT"
fi

# ---------------------------------------------------------------------------
# Dev servers
# ---------------------------------------------------------------------------
# Output from both is prefixed so it is obvious which process a line came from.
# awk with fflush() rather than `sed -u`, because -u is GNU-only and this has
# to work on macOS.
step "starting API and frontend"
printf "\n  %sapi%s      http://localhost:4000\n" "$CYAN" "$RESET"
printf "  %sfrontend%s http://localhost:3000\n" "$MAGENTA" "$RESET"
printf "\n  %sadmin@nekretnine.test / lozinka123%s\n" "$DIM" "$RESET"
printf "  %sCtrl-C stops both.%s\n\n" "$DIM" "$RESET"

# Each pipeline is wrapped in a subshell, and that is load bearing.
#
# For `cmd | awk &`, bash sets $! to the PID of the LAST command in the
# pipeline — the awk, not the npm. Recording that and killing it on exit tore
# down the log formatter while the dev servers carried on holding ports 3000
# and 4000, and the cleanup then blocked forever waiting on children it had
# never signalled.
#
# Wrapping in ( ) makes $! the subshell, which is the parent of both npm and
# awk, so walking its process tree reaches everything.
( npm run dev:backend 2>&1 | awk -v c="$CYAN" -v r="$RESET" '{print c "[api]" r " " $0; fflush()}' ) &
PIDS+=($!)

( npm run dev:frontend 2>&1 | awk -v c="$MAGENTA" -v r="$RESET" '{print c "[web]" r " " $0; fflush()}' ) &
PIDS+=($!)

# Wait for either to exit; the trap tears the other one down.
wait -n 2>/dev/null || wait
