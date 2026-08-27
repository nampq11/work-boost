# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

"""Prepare and verify releases without performing irreversible git actions."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

VERSION_PATTERN = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
VERSION_HEADING_PATTERN = re.compile(r"^## \[([^]]+)\](?:\s+-\s+.*)?$")
ARTIFACT_SUFFIXES = (".deb", ".dmg", ".msi")


@dataclass
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


class CommandError(RuntimeError):
    def __init__(self, command: list[str], result: CommandResult):
        rendered_command = " ".join(command)
        details = result.stderr.strip() or result.stdout.strip() or "no output"
        super().__init__(f"Command failed ({result.returncode}): {rendered_command}: {details}")
        self.command = command
        self.result = result


def run_command(
    command: list[str],
    *,
    cwd: Path,
    check: bool = True,
) -> CommandResult:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise RuntimeError(f"Unable to run {' '.join(command)}: {error}") from error

    result = CommandResult(completed.returncode, completed.stdout, completed.stderr)
    if check and result.returncode != 0:
        raise CommandError(command, result)
    return result


def git_output(repo_root: Path, *arguments: str) -> str:
    return run_command(["git", *arguments], cwd=repo_root).stdout.strip()


def validate_version(version: str) -> str:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"Invalid version '{version}'. Use X.Y.Z, for example 0.4.1.")
    return version


def changelog_path(repo_root: Path) -> Path:
    for filename in ("CHANGELOG.md", "CHANGELOG"):
        candidate = repo_root / filename
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Neither CHANGELOG.md nor CHANGELOG exists")


def latest_tag(repo_root: Path) -> str | None:
    result = run_command(
        ["git", "describe", "--tags", "--abbrev=0"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode == 0:
        return result.stdout.strip()
    if "no names found" in result.stderr.lower() or "cannot describe" in result.stderr.lower():
        return None
    raise CommandError(["git", "describe", "--tags", "--abbrev=0"], result)


def changed_paths(repo_root: Path) -> list[str]:
    # Use the raw output (no strip): `git_output` strips leading whitespace,
    # which drops the leading status column of worktree-modified entries like
    # " M CHANGELOG.md" and makes line[3:] slice the path one char too early.
    status = run_command(["git", "status", "--porcelain=v1"], cwd=repo_root).stdout
    paths: list[str] = []
    for line in status.splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.rsplit(" -> ", maxsplit=1)[-1]
        paths.append(path)
    return paths


def remote_tag_exists(repo_root: Path, tag: str) -> bool:
    result = run_command(
        ["git", "ls-remote", "--tags", "origin", f"refs/tags/{tag}"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode == 0:
        return bool(result.stdout.strip())
    if result.returncode == 2 and not result.stderr.strip():
        return False
    raise CommandError(
        ["git", "ls-remote", "--tags", "origin", f"refs/tags/{tag}"],
        result,
    )


def github_release_exists(repo_root: Path, tag: str) -> bool:
    command = ["gh", "release", "view", tag, "--json", "tagName"]
    result = run_command(command, cwd=repo_root, check=False)
    if result.returncode == 0:
        return True
    output = f"{result.stdout}\n{result.stderr}".lower()
    if "not found" in output or "404" in output:
        return False
    raise CommandError(command, result)


def extract_release_notes(changelog: str, version: str) -> str:
    lines = changelog.splitlines()
    version_heading = f"## [{version}]"
    start: int | None = None

    for index, line in enumerate(lines):
        if line.startswith(version_heading) and VERSION_HEADING_PATTERN.fullmatch(line):
            start = index + 1
            break

    if start is None:
        raise ValueError(f"Changelog section '## [{version}]' was not found")

    end = len(lines)
    for index in range(start, len(lines)):
        if VERSION_HEADING_PATTERN.fullmatch(lines[index]):
            end = index
            break

    notes = "\n".join(lines[start:end]).strip()
    if not notes:
        raise ValueError(f"Changelog section '## [{version}]' is empty")
    return f"{notes}\n"


def commit_summaries(repo_root: Path, baseline: str | None) -> list[str]:
    revision_range = f"{baseline}..HEAD" if baseline else "HEAD"
    output = git_output(repo_root, "log", revision_range, "--format=%h|%s")
    return output.splitlines() if output else []


def write_notes(notes_file: Path, notes: str) -> None:
    notes_file.parent.mkdir(parents=True, exist_ok=True)
    notes_file.write_text(notes, encoding="utf-8")


def prepare(repo_root: Path, version: str, notes_file: Path | None) -> dict[str, Any]:
    version = validate_version(version)
    tag = f"v{version}"
    changelog = changelog_path(repo_root)
    baseline = latest_tag(repo_root)
    paths = changed_paths(repo_root)
    changelog_relative_path = str(changelog.relative_to(repo_root))
    unexpected_paths = [path for path in paths if path != changelog_relative_path]
    notes = extract_release_notes(changelog.read_text(encoding="utf-8"), version)

    local_tag_exists = bool(git_output(repo_root, "tag", "--list", tag))
    remote_exists = remote_tag_exists(repo_root, tag)
    release_exists = github_release_exists(repo_root, tag)

    if notes_file is not None:
        write_notes(notes_file, notes)

    return {
        "status": "success",
        "command": "prepare",
        "version": version,
        "tag": tag,
        "baseline": baseline,
        "branch": git_output(repo_root, "branch", "--show-current"),
        "working_tree": {
            "changed_paths": paths,
            "unexpected_paths": unexpected_paths,
            "only_changelog_changed": bool(paths) and not unexpected_paths,
        },
        "existing": {
            "local_tag": local_tag_exists,
            "remote_tag": remote_exists,
            "github_release": release_exists,
        },
        "release_notes": notes,
        "notes_file": str(notes_file) if notes_file is not None else None,
        "commits_since_baseline": commit_summaries(repo_root, baseline),
        "ready": not local_tag_exists and not remote_exists and not release_exists and not unexpected_paths,
    }


def release_data(repo_root: Path, tag: str) -> dict[str, Any]:
    command = [
        "gh",
        "release",
        "view",
        tag,
        "--json",
        "name,tagName,body,isDraft,isPrerelease,assets,url",
    ]
    result = run_command(command, cwd=repo_root)
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"GitHub returned invalid release JSON: {error}") from error
    if not isinstance(data, dict):
        raise RuntimeError("GitHub release response was not an object")
    return data


def workflow_data(repo_root: Path, run_id: str) -> dict[str, Any]:
    command = ["gh", "run", "view", run_id, "--json", "status,conclusion,url"]
    result = run_command(command, cwd=repo_root)
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"GitHub returned invalid workflow JSON: {error}") from error
    if not isinstance(data, dict):
        raise RuntimeError("GitHub workflow response was not an object")
    return data


def verify(repo_root: Path, version: str, run_id: str | None) -> dict[str, Any]:
    version = validate_version(version)
    tag = f"v{version}"
    head_sha = git_output(repo_root, "rev-parse", "HEAD")
    tag_sha = git_output(repo_root, "rev-parse", f"{tag}^{{}}")
    tag_type = git_output(repo_root, "cat-file", "-t", tag)
    release = release_data(repo_root, tag)
    workflow = workflow_data(repo_root, run_id) if run_id else None

    asset_names = {asset.get("name") for asset in release.get("assets", []) if isinstance(asset, dict)}
    bundles = {suffix: any(name.endswith(suffix) for name in asset_names if name) for suffix in ARTIFACT_SUFFIXES}
    checksums = {
        suffix: any(
            name.endswith(f"{suffix}.sha256")
            for name in asset_names
            if name
        )
        for suffix in ARTIFACT_SUFFIXES
    }
    checks = {
        "tag_is_annotated": tag_type == "tag",
        "tag_points_to_head": tag_sha == head_sha,
        "release_tag_matches": release.get("tagName") == tag,
        "release_title_matches": release.get("name") == f"Work Boost {tag}",
        "release_notes_present": bool(str(release.get("body", "")).strip()),
        "release_is_published": not release.get("isDraft", True) and not release.get("isPrerelease", True),
        "desktop_bundles_present": all(bundles.values()),
        "desktop_checksums_present": all(checksums.values()),
    }
    if workflow is not None:
        checks["workflow_succeeded"] = (
            workflow.get("status") == "completed" and workflow.get("conclusion") == "success"
        )

    return {
        "status": "success" if all(checks.values()) else "failure",
        "command": "verify",
        "version": version,
        "tag": tag,
        "head_sha": head_sha,
        "tag_sha": tag_sha,
        "tag_type": tag_type,
        "checks": checks,
        "artifacts": {
            "bundles": bundles,
            "checksums": checksums,
            "names": sorted(name for name in asset_names if name),
        },
        "release": release,
        "workflow": workflow,
    }


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare", help="Validate a release candidate and extract notes")
    prepare_parser.add_argument("version", help="Release version in X.Y.Z form")
    prepare_parser.add_argument("--notes-file", type=Path, help="Write extracted notes to this file")
    prepare_parser.add_argument("--repo-root", type=Path, default=Path.cwd())

    verify_parser = subparsers.add_parser("verify", help="Verify a published release and its artifacts")
    verify_parser.add_argument("version", help="Release version in X.Y.Z form")
    verify_parser.add_argument("--run-id", help="GitHub Actions run ID to verify")
    verify_parser.add_argument("--repo-root", type=Path, default=Path.cwd())

    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    repo_root = arguments.repo_root.resolve()

    try:
        if arguments.command == "prepare":
            result = prepare(repo_root, arguments.version, arguments.notes_file)
        else:
            result = verify(repo_root, arguments.version, arguments.run_id)
    except (CommandError, FileNotFoundError, RuntimeError, ValueError) as error:
        result = {
            "status": "error",
            "command": arguments.command,
            "error": str(error),
        }
        print(json.dumps(result, indent=2))
        return 1

    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
