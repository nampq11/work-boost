---
type: ADR
id: "0017"
title: "Make the desktop release build manually re-triggerable"
status: active
date: 2026-08-26
---

## Context

The desktop release build (`release.yml`) is triggered only by `on: push: tags`. There is no manual
re-run path, so if a tag-push run fails or dies at startup there is no way to re-trigger the build
without re-tagging. Re-tagging is unreliable: pushing a tag to the same commit that already has
runs for that `head_sha`/event is deduplicated by GitHub and produces no new run. In addition,
`gh release create` creates the tag via the GitHub API, which does not fire the `on: push: tags`
workflow at all, so the bundle build silently never runs - a footgun.

During the 2026-08-26 GitHub Actions major outage, a single tag push produced several stuck runs
(`startup_failure` / un-cancellable `queued` runs). Neither `cancel` nor `force-cancel` could
clear them (`409 "Cannot cancel a workflow run that has not been queued yet"`), confirming these are
orphaned/corrupted run records created during the incident. With no manual trigger available, the
release had no recovery path beyond waiting on GitHub Support.

## Decision

**Add a `workflow_dispatch` trigger with a required `version` input to `release.yml` so the desktop
bundle build can be triggered manually and re-run after a failure or outage.** Add a `concurrency`
group keyed on `github.ref_name` with `cancel-in-progress: true` so only one release build runs per
ref/version at a time and a newer trigger cancels a stale one.

- When dispatched manually, the `version` input drives both the bundle version and the target release
  tag (`v` + version).
- When triggered by a tag push, the tag name drives both (unchanged behavior).
- The upload step targets `env.RELEASE_TAG` so `softprops/action-gh-release` finds the correct
  release even without a tag ref (manual dispatch runs against `refs/heads/main`).

## Options considered

1. **Keep tag-push-only trigger (status quo)** - no manual re-run path; stuck on the outage with no
   recourse, and `gh release create` silently skips the build.
2. **Add `workflow_dispatch` with a `version` input (chosen)** - gives a manual, repeatable trigger
   that does not depend on tag events or GitHub's dedup logic, and works during/after an outage.
3. **Re-push the tag to a new commit to force a fresh run** - requires noise commits or history
   rewriting to change the `head_sha`; fragile and pollutes history.
4. **Tauri updater plugin** - out of scope; rejected in ADRs 0015 and 0016.

## Consequences

- The build can be manually triggered and re-run at any time:
  `gh workflow run release.yml -f version=0.4.0`.
- `concurrency` prevents duplicate release runs for the same ref from piling up (the root cause of
  the observed #5/#6/#7 mess).
- The tag-push path is unchanged: `on: push: tags v*` still builds and publishes.
- For manual dispatch, the `version` and matching release tag must be supplied correctly; the
  workflow builds the bundle with that version and publishes against the corresponding release.
- Orphaned runs created during an outage remain as history and cannot be cleared via the API (a
  GitHub-side limitation); they are no longer the only path to release a version.

## Advice

Researched before implementing: GitHub REST API `force-cancel` (some/confirm not all stuck runs can
be force-cancelled), GitHub Docs on `concurrency` and `workflow_dispatch`, and confirmed that
`gh release create` does not fire `on: push: tags`. Observed the `409 "Cannot cancel a workflow run
that has not been queued yet"` response on both `cancel` and `force-cancel` during the Actions
outage.
