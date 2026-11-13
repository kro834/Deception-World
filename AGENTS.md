# Agent guidance

- Read the applicable owner specifications before changing behavior or visuals; preserve approved copy, art, interaction, and motion decisions.
- Keep generated `src/` files synchronized with `source-parts/`; after edits run `node scripts/sync-source-parts.mjs` and verify with `node scripts/sync-source-parts.mjs --check`.
- Use the common verification entry point, `npm run harness -- plan|run|compare`. Treat required but unknown test coverage as unverified; do not weaken tests to obtain a pass.
- Use `gpt-6-astra` for delegated work under the owner's current staffing instruction, including browser and visual review. A later explicit assignment takes priority.
- Follow `docs/production-release.md` for production publication. Local verification, Git publication, deployment, public behavior, and physical-device coverage are separate evidence.
- Do not confuse browser frame timing with GPU performance or measurements on a physical device.
- Report pass, failure, skipped, partial, and unverified coverage distinctly. Keep the commands, target, revision, and artifacts needed to reproduce each result.
- Do not change or delete user work, publish, or commit unless explicitly requested. Keep secrets out of logs and reports.
