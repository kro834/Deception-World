# Web development harness

The harness plans and runs focused checks against a local Deception World build, and compares a candidate with a baseline. It gives developers and existing agents reproducible browser evidence; it does not implement UI changes or call a new paid AI API.

## Commands

```sh
npm run harness -- plan [options]
npm run harness -- run [options]
npm run harness -- compare [options]
```

Options:

| Option | Purpose |
| --- | --- |
| `--base-ref REF` | Reference used to find candidate changes; defaults to `origin/main`. |
| `--files a,b` | Plan checks for the specified comma-separated files instead of the detected changes. |
| `--full` | Include the full planned check set. |
| `--output PATH` | Artifact directory; defaults to a timestamped directory under `artifacts/harness/`. |
| `--base-url URL` | Use an already-running loopback preview. Without it, the harness builds and starts a local preview automatically. |
| `--baseline-url URL` | Use an existing loopback baseline preview for comparison. |
| `--baseline-ref REF` | Build an isolated baseline worktree from this reference for comparison; defaults to `origin/main`. |
| `--profiles phone,desktop` | Browser viewport profiles for measurements. Additional supported profiles include `320`, `phone-landscape`, `ipad-portrait`, `ipad-landscape`, and reduced-motion variants. |
| `--engines chromium,webkit` | Browser engines for measurements. Existing mapped verification scripts use their declared engines. |
| `--samples N` | Repeated samples for measurement; defaults to `3`. |
| `--routes /world,/rexonance-saga` | Routes to inspect. |
| `--scene hero\|transformation` | Scene to include in visual/performance probes. |
| `--probe` | Include browser performance measurements during `run`. |
| `--memory` | Add the Chrome heap regression: two preparation returns followed by five measured SPA returns with forced garbage collection. Every return checks page DOM and native retaining paths; preparation may release canvas storage but cannot grow other resources, and the five measured cohorts must match. Rexonance changes select it automatically. GPU resource release remains unverified. |
| `--reuse-build` | Explicitly reuse an existing build and skip building. |
| `--no-browser` | Run static checks only; the report is marked partial because browser checks were not run. |

`plan` prints the proposed changes and checks as JSON. `run` builds a local production preview when needed, executes the selected checks, and writes JSON/HTML reports. `compare` builds or uses baseline and candidate previews, alternates their measurement order, and records screenshots and metric reports to help control ordering effects. `--base-ref` selects candidate changes; the comparison baseline is selected independently by `--baseline-ref` or defaults to `origin/main`. Review the report's target, revision, selected checks, and status before using it as evidence.

## Automatic runs

Pull requests run `.github/workflows/web-harness.yml` against their base commit. The existing production workflow captures the current Production deployment, verifies that its commit belongs to main, then uses that verified Production SHA for both change selection and the comparison baseline before staging a Vercel candidate. Only an initial publication with no existing Production deployment falls back to `HEAD^`. Both retain the HTML/JSON reports and supporting evidence as GitHub Actions artifacts, including on failure. Candidate attestation, promotion, rollback, and public-SHA checks still follow [production-release.md](production-release.md).

A missing required verifier fails before execution. Comparison runs record the application's observable rendering settings, DPR, and reduced-motion setting before and after each observation. Missing, changing, or different conditions fail the required comparison and preserve the evidence. Equal observed settings do not establish identical renderer implementation or GPU quality. Unsupported individual browser metrics, such as WebKit long-task entries, remain explicitly unverified without failing unrelated checks.

## Safety and interpretation

Automatic previews and browser targets are loopback-only. The harness does not write to shared production galleries. Do not point arbitrary verification scripts at a public service: their network and persistence behavior varies. Production publication and public read-only checks remain governed by [production-release.md](production-release.md).

Browser timing, frame samples, page resource timing, and screenshots are diagnostic evidence. Frame timing is not a GPU measurement, and a browser profile that emulates a phone is not physical iPhone/iPad testing. Cross-origin resource timing may hide transfer sizes. For device-specific claims, record the actual device and OS separately.

Reports are intended to be read by a developer or an existing agent to choose a repair and then rerun the same checks. A pass applies only to the checks and target recorded in that report; partial, skipped, failed, or unverified checks must not be represented as a complete pass. Preserve the artifacts needed to reproduce a comparison.

For visual work, connect the reference, approved copy/art, intended interaction, and specific states to the comparison screenshots. Pixel differences do not rate design quality. The research notes cover [design references and production tools](design-tools-research-20261113.md) and [design integration and diagnostic tools](design-integrations-research-20261113.md).

Keep credentials, cookies, authorization headers, and secret environment values out of command output, logs, screenshots, and reports. Inspect artifacts before sharing them.
