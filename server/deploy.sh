#!/bin/bash
# Deploy Dash Live Notes relay server to Deno Deploy
#
# Prerequisites:
# 1. Install Deno: curl -fsSL https://deno.land/install.sh | sh
# 2. Install deployctl: deno install -Arf jsr:@deno/deployctl
# 3. Sign up at https://dash.deno.com (GitHub login, no credit card)
# 4. Create a project named "dash-relay" at https://dash.deno.com/new
# 5. Get your access token from https://dash.deno.com/account#access-tokens
#
# Usage:
#   DENO_DEPLOY_TOKEN=your_token ./deploy.sh
#
# Or set DENO_DEPLOY_TOKEN in your environment.

set -e

if [ -z "$DENO_DEPLOY_TOKEN" ]; then
  echo "Error: DENO_DEPLOY_TOKEN not set"
  echo "Get your token from: https://dash.deno.com/account#access-tokens"
  exit 1
fi

cd "$(dirname "$0")"

echo "Deploying relay server to Deno Deploy..."
deployctl deploy --project=dash-relay --prod relay.ts

echo ""
echo "Deployed! Your relay is live at: https://dash-relay.deno.dev"
echo ""
echo "Update NEXT_PUBLIC_RELAY_URL in your .env.local:"
echo "  NEXT_PUBLIC_RELAY_URL=https://dash-relay.deno.dev"
