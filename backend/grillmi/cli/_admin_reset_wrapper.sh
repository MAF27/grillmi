#!/usr/bin/env bash
# Admin password-reset wrapper: prompts for password without echo, pipes it
# into grillmi-admin-reset --password-stdin via a temporary fd. The password
# never appears in argv or in the environment.
#
# Usage: doppler run -- bash _admin_reset_wrapper.sh --email <email>
set -euo pipefail

EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$EMAIL" ]]; then
  echo "usage: $0 --email <email>" >&2
  exit 2
fi

read -rs -p "New password (>= 12 chars): " PASSWORD; echo
read -rs -p "Confirm password: " CONFIRM; echo
if [[ "$PASSWORD" != "$CONFIRM" ]]; then
  echo "passwords do not match" >&2
  exit 2
fi

TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"; unset PASSWORD CONFIRM' EXIT
chmod 600 "$TMPFILE"
printf '%s\n' "$PASSWORD" > "$TMPFILE"

grillmi-admin-reset --email "$EMAIL" --password-stdin < "$TMPFILE"
