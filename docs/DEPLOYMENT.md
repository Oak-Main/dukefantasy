# Duke Fantasy deployment

The production target is Cloudflare Worker `dukefantasy`. `wrangler.deploy.jsonc` deploys `dist/server/index.js` and `dist/client` to `dukefantasy.com` and `www.dukefantasy.com`. The Worker redirects www to the apex with HTTP 308, preserving path and query.

The owner explicitly authorized this October 20, 2026 content release and deployment. Preserve existing runtime flags and secret bindings. This release does not activate odds, advertising, affiliate integrations or email sending.

## Release sequence

1. Import reviewed research and select its immutable snapshot in `data/content-refresh/current.json`.
2. Run `npm ci`, `npm run verify`, and `npm run dataset:verify`. The latter is a fresh ESPN comparison, not a second publisher; the committed register records NFL/ESPN corroboration.
3. Run `npm run cf:types` and `npm run deploy:dry-run`.
4. Record the previous production version with `wrangler deployments list --config wrangler.deploy.jsonc`. Commit and push the exact checked source.
5. Deploy with `wrangler deploy --config wrangler.deploy.jsonc`. `npm run deploy:production` additionally repeats the full verification suite.
6. Verify apex/www, health/readiness/scoreboard APIs, robots, sitemap, source dates, Week 7 games, fantasy boards, injury/practice reports, transactions, leaders, canonical metadata, assets and security headers.

`X-Content-Version: 2026-10-20` and the health endpoint identify the edition. Module freshness uses source age. A healthy Worker does not imply current research; inspect module freshness and coverage.

## Rollback

Before this release the active version was `f21bbb99-b2ce-4cc1-b7d7-a9d6b33c8f31` (October 3, 2026). Use `wrangler rollback <version-id> --config wrangler.deploy.jsonc` if release smoke checks fail. Verify both hostnames again. The previous edition is stale, so rollback is a temporary recovery action.

## Data failures

Builds materialize reviewed data without network mutations. Invalid snapshot/report inputs abort before writing `lib/nfl-generated.ts`. Explicit `--live` pulls write only after retrieval and schedule validation; failed injury retrieval aborts instead of shipping an empty feed. Never treat the build clock as a source timestamp.

Final Week 7 designations, inactives and weather require subsequent verified updates. Planned review slots are not automatic jobs or evidence an update occurred. No future job was created by this release.
