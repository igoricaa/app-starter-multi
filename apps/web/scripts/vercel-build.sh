#!/usr/bin/env bash
# Vercel's build command. A new Vercel project's first Git deployment goes to production whatever
# its branch, so production builds only from main.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = production ] && [ "${VERCEL_GIT_COMMIT_REF:-}" != main ]; then
  echo "Refusing to build: production builds only from main, not '${VERCEL_GIT_COMMIT_REF:-}'." >&2
  exit 1
fi

bun run build
