# Production publication

The canonical public address is https://deception-world.vercel.app. The former
Grok-hosted address is a separate deployment and is not modified by this workflow.

Push the reviewed changes to `main`. GitHub Actions runs **Deploy verified main to
Production** using the three existing `production` environment secrets:
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. They must identify the
Dece team and its `deception-world` project. Never commit their values.

The workflow checks lint, tests, types and build, stages a candidate without moving
the public domain, verifies its exact main SHA and delivered image hashes, then
promotes it and verifies the public address. Vercel's native Git auto-publisher is
disabled to prevent it racing the checked promotion. Initial publication is allowed
only for a verified domain already assigned to the authenticated project. Later
releases retain an attested previous deployment and can roll back on failed public
verification, before any destructive migration begins.

Ordinary publication does **not** delete data. The separate retirement cleanup is
disabled unless the production environment variable `APPLY_DESTRUCTIVE_MIGRATIONS`
is explicitly set to `1`; it also requires an existing previous deployment. Do not
enable it as a remedy for a deployment failure.

For a transient infrastructure failure, use Actions → this workflow → Run workflow
on `main`, or re-run the failed job. A code/build failure requires a reviewed fix
on `main`. A green workflow means both promotion and public verification passed;
the public `/release-identity.json` records the deployed commit and image hashes.
Expired credentials or future platform failures still require intervention and
are reported by the failing Action, not treated as a successful publication.
