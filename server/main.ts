// Deno Deploy entrypoint for the `dash-relay` app (org `efesop`).
//
// The app's build config expects `main.ts` — inherited from the playground it
// was created as. The server itself lives in relay.ts so the test suite can
// import `handleRequest` without booting anything.
//
// Deploy from this directory (see deploy.sh):
//   DENO_DEPLOY_TOKEN=<org token> deno deploy --org efesop --app dash-relay          # preview
//   DENO_DEPLOY_TOKEN=<org token> deno deploy --org efesop --app dash-relay --prod   # production
import { startServer } from './relay.ts'

startServer()
