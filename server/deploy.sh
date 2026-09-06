#!/bin/bash
# Deploy the Dash relay (sync + entitlements + auth) to Deno Deploy.
#
# The relay runs on Deno Deploy (*.deno.net) as org `efesop`, app `dash-relay`.
# Its build config expects `main.ts` as the entrypoint (inherited from the
# playground the app was created as); main.ts boots relay.ts. Git is the
# source of truth — do not edit in the console playground.
#
# Prerequisites:
#   - Deno >= 2.4 (provides the `deno deploy` subcommand)
#   - An org access token from https://console.deno.com (Settings → Tokens)
#
# Usage:
#   DENO_DEPLOY_TOKEN=ddo_... ./deploy.sh          # preview revision only
#   DENO_DEPLOY_TOKEN=ddo_... ./deploy.sh --prod   # route production
#
# A preview revision gets its own URL (dash-relay-<revision>.efesop.deno.net)
# and shares the production KV database. Smoke-test /health and an
# unauthenticated /sync/pull (expect 401) on it before re-running with --prod.
#
# Env vars (RESEND_*, AUTH_TOKEN_SECRET, RC_WEBHOOK_AUTH, ENTITLEMENT_*) live on
# the app: `deno deploy env list --org efesop --app dash-relay`.

set -e

if [ -z "$DENO_DEPLOY_TOKEN" ]; then
  echo "Error: DENO_DEPLOY_TOKEN not set (org token from https://console.deno.com)"
  exit 1
fi

cd "$(dirname "$0")"

echo "Deploying relay to Deno Deploy (org efesop, app dash-relay) $*"
deno deploy --org efesop --app dash-relay --non-interactive "$@"

echo ""
echo "Production URL: https://dash-relay.efesop.deno.net"
