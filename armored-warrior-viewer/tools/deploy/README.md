# Deploying the viewer to Vercel (REST API + curl)

Files: `deploy.mjs` (Node 22, no dependencies, shells out to `curl`), `../../work/vercel.json` (headers),
`test/` (scratch site and a loopback mock API used to exercise the upload/deploy/poll logic).

Auth: the script never sees a token. Once the owner saves a Vercel token as a network secret for
`api.vercel.com`, the egress proxy adds `Authorization` itself. If a request is refused only for lack of a
header, set a DUMMY value: `VERCEL_DUMMY_AUTH=dummy` (sent as `Authorization: Bearer dummy`; the proxy replaces it).
TLS verification is never disabled; `--api` must be https (loopback http only for the mock).

Assume `SP=/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad`.

## The release pipeline: pack, assemble, deploy `SP/release`

`deploy.mjs` now publishes `SP/release`, not `SP/work`. `work/` still points at `model-v10` (31 MB before the
first frame); `release/` is the lean tree. Three commands, run from `$SP`, in this order. Nothing here touches
`work/` or calls the Vercel API until the last step.

    cd $SP
    # 1. pack: byte-level surgery on the models -> SP/pack-out/model-v15/ (+ pack-report.json)
    venv/bin/python tools/pack/pack_models.py --src work/model-v10 --out pack-out/model-v15 \
        --mapping tools/pack/mapping.json [--emissive-webp Q|lossless]
    # 2. assemble: copy + two edits + request log + prune + re-check -> SP/release/ (several minutes: software GL)
    NODE_PATH=/opt/node-tools/node_modules venv/bin/python tools/pack/assemble.py
    # 3. publish (see sections 0-4 below, with `release` instead of `work`)
    node tools/deploy/deploy.mjs release --dry-run
    node tools/deploy/deploy.mjs release --name armored-warrior-3d-viewer [--team ...] [--prod]

`tools/pack/mapping.json` maps material name -> base-colour WebP for `standard` and `detail`. The test run uses
`tools/pack/mapping.test.json` (stand-ins). Make the final one from the `paintcel_*` files, one entry per material
the manifest gives a `paint` to, or that material keeps downloading its old JPEG for nothing.
Re-run step 1 whenever a mapped file changes: step 2 refuses a stale pack (it compares SHA-256 of every mapped file
with the report). Step 2 also fails if `work/` changed while it was copying, if any request 404s, or if
`viewer.js`'s `MODELS` line is no longer the exact expected text.
Details and numbers: `pack-out/pack-report.json`, `pack-out/assemble-report.json`, request logs in `pack-out/logs/`.

## 0. Before every deploy (no network)

    cd $SP
    node tools/deploy/deploy.mjs release --dry-run       # plan, ten largest, anything suspicious
    node tools/deploy/deploy.mjs release --print-requests # the exact curl commands, contents elided

Fix anything under SUSPICIOUS first. The script refuses a live run when a file is over `--max-file-mb`
(default 100, an UNVERIFIED limit) or a symlink is broken.

## 1. Preview deploy (default)

    node tools/deploy/deploy.mjs release --name armored-warrior-3d-viewer [--team <team_id or slug>]

## 2. Production deploy

    node tools/deploy/deploy.mjs release --name armored-warrior-3d-viewer [--team <team_id or slug>] --prod

The first deployment to a name that does not exist creates the project implicitly (`name`/`project` in the
body). Use the same `--name` and `--team` every time or you will create a second project.
`--team` starting with `team_` is sent as `teamId`, anything else as `slug`; omit it for the token's personal scope.

What happens: hash everything, try to create the deployment, the API answers `missing_files` with the SHA-1s it
lacks, upload only those (4 in parallel, retries on network errors/429/5xx), create again, poll every 3 s.
`--upload-all` uploads everything up front; `--force-new` bypasses Vercel's "identical deployment" de-dup;
`--no-wait` skips polling; `--wait-seconds N` changes the 600 s budget.

## 3. Reading the result

    deployment created: id dpl_..., url https://<project>-<hash>-<scope>.vercel.app, state QUEUED
    final:  state READY   (production also lists alias https://<project>.vercel.app and waits for aliasAssigned)

- exit 0 = READY. Exit 1 = any API/network error, ERROR/CANCELED, or poll timeout (the body of the API's
  error response is printed). Exit 2 = bad arguments.
- `url` is the unique per-deployment URL. The stable production URL is the alias (normally
  `https://armored-warrior-3d-viewer.vercel.app` if that project name is free; Vercel may add a suffix if taken).
- A preview URL on a new project is probably login-gated by Vercel Authentication (unverified, see lead's notes).
  Check with a private window before sharing; the lead can turn protection off in Project Settings > Deployment Protection.
- Smoke test after READY: open the URL, check the console for 404s, and `curl -I` the `.glb` (expect
  `content-type: model/gltf-binary`, `cache-control: public, max-age=31536000, immutable`) and `viewer.js`
  (expect `max-age=0, must-revalidate`).

## 4. Rolling back

Deployments are immutable, so rollback means pointing production back at an older one. Nothing is deleted.

- Dashboard: Project > Deployments > pick the last good production deployment > "..." > Instant Rollback / Promote.
- API (token via the proxy): `POST /v1/projects/{projectId}/promote/{deploymentId}` or the MCP tool `request_rollback`.
  (Rollback is limited on Hobby: Instant Rollback to the previous production deployment only. Unverified.)
- Or redeploy the previous folder contents with `--prod`; because files are content-addressed, only the changed files upload.
- Preview URLs never need rollback; just stop using them.

## Cache policy in `work/vercel.json` (and why)

| Path | Cache-Control | Why |
|---|---|---|
| `/`, `/index.html`, `/viewer.js`, `/viewer.css`, `/look/*` | `public, max-age=0, must-revalidate` | They change in place (`viewer.js?v=14` busts only if someone bumps the number); always revalidate, cheap 304s. |
| `/vendor/*` | `public, max-age=86400, stale-while-revalidate=604800` | three.js modules rarely change but paths carry no version, so no `immutable`; a bad vendor swap heals within a day. |
| `/model-v<N>/*`, `/previews-*/*` | `public, max-age=31536000, immutable` | Big files (26 MB glb, 9 MB bin); safe only because of the lead's rule: **a changed asset gets a new folder name, never an in-place edit.** If any file in these folders is edited in place, browsers that have it will keep the old copy for a year. |

Content-Type is forced for `.glb` (model/gltf-binary), `.gltf` (model/gltf+json), `.bin` (application/octet-stream),
`.mjs` (text/javascript) and `.webp` (image/webp). Vercel probably serves these correctly already; the override is
a safety net for module scripts. No rewrites, redirects, `cleanUrls` or `trailingSlash`, so `./viewer.js?v=14` and
the import map resolve exactly as on a static server. `framework: null` = no build.

## Final run in one command, and the zip for ChatGPT Sites

    cd $SP && tools/pack/release.sh      # mapping from manifest -> pack (emissive lossless) -> assemble -> zip + verify

Manual steps are the three above. `--emissive-webp lossless` is the recommended setting: the render is
pixel-identical (max difference 0 on 4 views x 2 modes) and it saves 2.5 MB (standard) / 2.5 MB (detail).
Lossy WebP (q95/90/80) changes glow edges and sparkles (mean 0.05-0.29, max 55-107 of 255 on a few pixels) and was not chosen.
`tools/pack/mapping_from_manifest.py` makes the mapping from every manifest `paint` with `paintForce: true`;
embedding a non-forced `paint` would change behaviour, so it is opt-in (`--all-paint`).

`tools/pack/make_zip.py` builds `SP/handover/armored-warrior-viewer.zip` from `SP/release` (index.html at the root,
no vercel.json, no dot-files, `MANIFEST.txt` inside: line 1 `files=N<TAB>bytes=TOTAL`, then `path<TAB>size<TAB>sha256`
sorted by path) and `SP/handover/SUMMARY.txt` (count, bytes, five largest, files above 20 MiB). Above 45,000,000 bytes it
writes `-part1.zip` (standard mode, has index.html) and `-part2.zip` (detail-only files) with `MANIFEST-part1.txt` /
`MANIFEST-part2.txt`; extract both into the same folder. `--verify` unzips into `pack-out/zipcheck/`, checks the
manifest, serves it and repeats the request log (desktop + phone, both modes). Nothing is published.
