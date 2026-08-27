---
name: release
description: Cuts a versioned GitHub release for this repository. Use when asked to "create a release", "cut a release", "publish a version", "tag a release", or "release v...". Updates the changelog, commits the release notes, creates an annotated tag, pushes it, verifies the release workflow, and publishes release notes and desktop artifacts.
---

# Release

Cut a complete release from the repository's current release candidate. Follow `AGENTS.md` and read the commit skill before creating a commit.

## Release rules

- Treat the requested version as `X.Y.Z`; use the tag form `vX.Y.Z`.
- Use the repository's current default branch unless the user specifies another branch.
- Use a tag push as the canonical release path for this repository. The tag-push workflow builds and publishes the desktop artifacts.
- Do not use `gh release create` as the primary path. GitHub API-created tags do not fire the `push: tags` workflow, so the release can be created without `.deb`, `.dmg`, and `.msi` artifacts.
- Create an annotated tag with a descriptive message: `Work Boost vX.Y.Z`.
- Do not force-update, delete, or recreate an existing tag without explicit user approval.
- Derive release notes from the version section in `CHANGELOG.md`. Use `CHANGELOG` only when `CHANGELOG.md` does not exist.
- Do not manually bump desktop package versions when the release workflow derives them from the tag. In this repository, `release.yml` stamps the desktop `package.json`, `tauri.conf.json`, and `Cargo.toml` during the build.

## Helper script

Use the helper for deterministic validation and structured output. Run it from the repository root; it never commits, tags, pushes, or deletes remote data.

### Prepare a release candidate

Run this after cutting the version section in the changelog:

```bash
uv run ${CLAUDE_SKILL_ROOT}/scripts/release_helper.py prepare X.Y.Z \
  --notes-file /tmp/release-notes-X.Y.Z.md
```

The command validates the version, finds the baseline tag, checks for existing local/remote tags and releases, verifies unexpected working-tree changes, extracts the version's release notes, and prints JSON. It exits non-zero on command or input errors. Treat `ready: false` as a reason to stop and investigate.

### Verify a published release

Run this after the release workflow completes:

```bash
uv run ${CLAUDE_SKILL_ROOT}/scripts/release_helper.py verify X.Y.Z \
  --run-id RUN_ID
```

The command prints JSON checks for the annotated tag, tag target, release title and notes, workflow success, published state, desktop bundles, and checksum files. It exits non-zero when any check fails.
## Step 1: Preflight

Run these commands from the repository root:

```bash
pwd
git branch --show-current
git status --short
git remote -v
git describe --tags --abbrev=0
```

Then:

1. Confirm the repository, branch, and remote are correct.
2. Stop if unrelated working-tree changes exist. Ask which files belong in the release rather than staging them automatically.
3. Find the changelog file and read it completely before editing.
4. Read `.github/workflows/release.yml` and any release ADR, especially when the workflow or release path is unfamiliar.
5. Check that `vX.Y.Z` does not already exist locally, on `origin`, or as a GitHub release:

```bash
git tag --list "vX.Y.Z"
git ls-remote --tags origin "refs/tags/vX.Y.Z"
gh release view "vX.Y.Z"
```

Treat a missing GitHub release as expected. Stop on an existing tag or release and ask before changing it.

## Step 2: Prepare the changelog

Determine the baseline with `git describe --tags --abbrev=0`, unless the user supplied one. Review all commits since the baseline:

```bash
git log BASELINE..HEAD --format='%h|%s|%b'
```

Include notable user-facing breaking changes, features, fixes, security fixes, and performance improvements. Omit routine tests, internal refactors, dependency-only changes, and minor documentation changes. Preserve the existing changelog headings, bullet markers, spacing, and link style.

For a release, move the current `Unreleased` entries into a dated version section and leave a fresh empty `## [Unreleased]` section at the top:

```markdown
## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD

### Added

- Added ...

### Fixed

- Fixed ...
```

Mention pull requests when available. Keep entries concise and order them as breaking changes, additions, changes, then fixes.

## Step 3: Review and confirm

Review the complete changelog diff and run:

```bash
git diff --check
git diff -- CHANGELOG.md
```

Before committing or pushing, show the user the release version, commit scope, tag, workflow, and any unexpected changes. Require explicit confirmation when the request did not already clearly authorize the exact release version and normal release actions.

## Step 4: Commit the release notes

Stage only the intended changelog file. Follow the repository commit skill and use a concise message such as:

```bash
git add CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

Verify that the commit contains only the release changelog and that the working tree is clean before tagging.

## Step 5: Create and push the release tag

Create the annotated tag at the release commit, then push the branch and tag:

```bash
git tag -a "vX.Y.Z" -m "Work Boost vX.Y.Z"
git push origin BRANCH "vX.Y.Z"
```

The tag push starts `.github/workflows/release.yml`. Do not claim that the release succeeded until the workflow and GitHub release have been verified.

## Step 6: Monitor the build

Find the run corresponding to the release commit and tag:

```bash
gh run list --workflow=release.yml --limit 5
```

Watch it to completion:

```bash
gh run watch RUN_ID
```

If it fails, inspect the logs with `gh run view RUN_ID --log` and investigate the root cause before retrying. Use the workflow's `workflow_dispatch` fallback only when the tag-push run cannot complete or must be rerun:

```bash
gh workflow run release.yml -f version=X.Y.Z
```

## Step 7: Publish release notes

Use the notes file generated by the helper's `prepare` command. If it is unavailable, rerun `prepare` with `--notes-file` after reviewing the changelog. Do not overwrite existing notes from another actor without reviewing them first. Then update the release metadata:

```bash
gh release edit "vX.Y.Z" \
  --title "Work Boost vX.Y.Z" \
  --notes-file RELEASE_NOTES_FILE
```

Ensure the release body is not empty and contains the same user-facing changes as the changelog.

## Step 8: Verify and report

Verify all of the following:

```bash
git status --short
git rev-parse HEAD
git rev-parse "vX.Y.Z^{}"
gh release view "vX.Y.Z" --json name,tagName,body,isDraft,isPrerelease,assets,url
gh run view RUN_ID --json status,conclusion,url
```

Require:

- Clean working tree.
- The tag resolves to the release commit.
- The workflow conclusion is `success`.
- The GitHub release is not a draft or prerelease unless requested.
- The release title and notes are populated.
- The expected desktop artifacts and checksum files are attached when the workflow builds them.

Report the commit, tag, release URL, workflow URL, and artifact status. If the workflow remains queued or in progress, report that exact state instead of calling the release complete.
