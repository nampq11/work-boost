//! Desktop self-update: a read-only release check plus a single elevated install action.
//!
//! The webview never supplies a URL to Rust. Rust owns the GitHub API endpoint and the asset-free
//! version logic; the webview only receives `{ version, title }` for display. The actual install is
//! delegated to `scripts/install.sh` (the canonical installer), run by a single hardcoded, elevated
//! command - not implemented here.

use std::cmp::Ordering;
use std::time::Duration;

/// Official raw installer URL. A Rust constant, never derived from JS, so a webview XSS cannot
/// direct the app to install an arbitrary artifact.
pub const INSTALL_URL: &str =
    "https://raw.githubusercontent.com/nampq11/work-boost/main/scripts/install.sh";

/// The GitHub API endpoint for the latest non-prerelease/non-draft release.
pub const RELEASES_API_URL: &str =
    "https://api.github.com/repos/nampq11/work-boost/releases/latest";

/// Display-only update info handed to the webview. No URLs, no asset paths.
#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
pub struct UpdateInfo {
    pub version: String,
    pub title: String,
}

/// Windows only ships a manual `.msi`, so it is never auto-updated in-app.
pub fn auto_update_enabled_for(target_os: &str) -> bool {
    target_os != "windows"
}

pub fn auto_update_enabled() -> bool {
    auto_update_enabled_for(std::env::consts::OS)
}

/// A parsed subset of semver used for the update comparison. Build metadata (`+...`) is dropped,
/// a single leading `v` is stripped, and a prerelease segment sorts before the same release.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Version {
    major: u64,
    minor: u64,
    patch: u64,
    prerelease: Option<Vec<PrereleaseId>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PrereleaseId {
    Numeric(u64),
    Alpha(String),
}

impl Ord for PrereleaseId {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (Self::Numeric(a), Self::Numeric(b)) => a.cmp(b),
            // Numeric identifiers always sort below alphanumeric ones (semver 2.0).
            (Self::Numeric(_), Self::Alpha(_)) => Ordering::Less,
            (Self::Alpha(_), Self::Numeric(_)) => Ordering::Greater,
            (Self::Alpha(a), Self::Alpha(b)) => a.cmp(b),
        }
    }
}

impl PartialOrd for PrereleaseId {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.major
            .cmp(&other.major)
            .then(self.minor.cmp(&other.minor))
            .then(self.patch.cmp(&other.patch))
            .then(compare_prerelease(&self.prerelease, &other.prerelease))
    }
}

/// Compare two optional prerelease segments. A prerelease always sorts below the release it
/// qualifies, so `0.4.0-rc.1 < 0.4.0`.
fn compare_prerelease(a: &Option<Vec<PrereleaseId>>, b: &Option<Vec<PrereleaseId>>) -> Ordering {
    match (a, b) {
        (None, None) => Ordering::Equal,
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (Some(x), Some(y)) => {
            for (xi, yi) in x.iter().zip(y.iter()) {
                let ord = xi.cmp(yi);
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            // A shorter set of fields has lower precedence when all shared fields tie.
            x.len().cmp(&y.len())
        }
    }
}

/// Parse a loose version string into a comparable [`Version`]. Returns `None` when the core
/// major/minor/patch is not fully numeric. A leading `v` is stripped and build metadata is dropped.
fn parse_version(input: &str) -> Option<Version> {
    let s = input.trim();
    let s = s.strip_prefix('v').unwrap_or(s);
    // Drop build metadata after '+'.
    let s = s.split('+').next()?;
    let (core, prerelease) = match s.split_once('-') {
        Some((core, prerelease)) => (core, Some(prerelease)),
        None => (s, None),
    };

    let mut nums = core.split('.');
    let major = nums.next()?.parse::<u64>().ok()?;
    let minor = nums.next()?.parse::<u64>().ok()?;
    let patch = nums.next()?.parse::<u64>().ok()?;
    if nums.next().is_some() {
        return None; // More than three numeric components is not a version we understand.
    }

    let prerelease = prerelease.and_then(parse_prerelease_ids);
    Some(Version {
        major,
        minor,
        patch,
        prerelease,
    })
}

fn parse_prerelease_ids(segment: &str) -> Option<Vec<PrereleaseId>> {
    if segment.is_empty() {
        return None;
    }
    segment
        .split('.')
        .map(|id| {
            if id.is_empty() {
                return None;
            }
            if id.chars().all(|c| c.is_ascii_digit()) {
                id.parse::<u64>().ok().map(PrereleaseId::Numeric)
            } else {
                Some(PrereleaseId::Alpha(id.to_string()))
            }
        })
        .collect()
}

/// Pure semver-subset comparison. Non-parsable inputs are treated as unequal (conservatively lower)
/// so a bad remote tag can never be reported as an available update.
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    match (parse_version(a), parse_version(b)) {
        (Some(a), Some(b)) => a.cmp(&b),
        (None, _) => {
            eprintln!("[update] non-parsable version: {a:?}");
            Ordering::Less
        }
        (_, None) => {
            eprintln!("[update] non-parsable version: {b:?}");
            Ordering::Greater
        }
    }
}

/// Parse the body of a `releases/latest` response into display-only [`UpdateInfo`].
/// Returns `None` on malformed input.
pub fn parse_latest_release(body: &str) -> Option<UpdateInfo> {
    #[derive(serde::Deserialize)]
    struct Release {
        tag_name: String,
        #[serde(default)]
        name: String,
    }

    let release: Release = serde_json::from_str(body).ok()?;
    let version = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name)
        .to_string();
    let title = if release.name.trim().is_empty() {
        version.clone()
    } else {
        release.name
    };
    Some(UpdateInfo { version, title })
}

/// Fetch the latest release from GitHub. Returns `Ok(None)` on any network, HTTP, or parse error
/// (offline, rate-limit, non-200, malformed body) so the check can never block or fail launch.
/// Only the client-build step surfaces an `Err`.
pub fn latest_release() -> Result<Option<UpdateInfo>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("work-boost")
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))?;

    let response = match client.get(RELEASES_API_URL).send() {
        Ok(response) => response,
        Err(_) => return Ok(None),
    };
    if !response.status().is_success() {
        return Ok(None);
    }
    let body = match response.text() {
        Ok(body) => body,
        Err(_) => return Ok(None),
    };
    Ok(parse_latest_release(&body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("0.3.1", "0.4.0"), Ordering::Less);
        assert_eq!(compare_versions("0.4.0", "0.4.0"), Ordering::Equal);
        assert_eq!(compare_versions("0.4.1", "0.4.0"), Ordering::Greater);
    }

    #[test]
    fn compares_multi_digit_patch() {
        assert_eq!(compare_versions("0.10.0", "0.9.0"), Ordering::Greater);
    }

    #[test]
    fn prerelease_sorts_before_release() {
        assert_eq!(compare_versions("0.4.0-rc.1", "0.4.0"), Ordering::Less);
        assert_eq!(compare_versions("0.4.0", "0.4.0-rc.1"), Ordering::Greater);
    }

    #[test]
    fn strips_leading_v() {
        assert_eq!(compare_versions("v0.3.1", "0.3.1"), Ordering::Equal);
        assert_eq!(compare_versions("v0.4.0", "0.3.1"), Ordering::Greater);
    }

    #[test]
    fn ignores_build_metadata() {
        assert_eq!(compare_versions("0.4.0+meta", "0.4.0"), Ordering::Equal);
        assert_eq!(compare_versions("v0.4.0+abcd", "0.3.1"), Ordering::Greater);
    }

    #[test]
    fn compares_prerelease_identifiers() {
        // Numeric prerelease ids sort numerically; rc.2 > rc.1.
        assert_eq!(
            compare_versions("0.4.0-rc.2", "0.4.0-rc.10"),
            Ordering::Less
        );
        // A longer tie-break set wins when all shared idents tie.
        assert_eq!(
            compare_versions("0.4.0-alpha.1.1", "0.4.0-alpha.1"),
            Ordering::Greater
        );
    }

    #[test]
    fn non_parsable_is_unequal() {
        // A garbage remote tag is treated as lower, so it can never be reported as an update.
        assert_ne!(compare_versions("not-a-version", "0.1.0"), Ordering::Equal);
        assert_eq!(compare_versions("not-a-version", "0.1.0"), Ordering::Less);
        assert_eq!(
            compare_versions("0.1.0", "not-a-version"),
            Ordering::Greater
        );
        // A non-numeric major is not a version either.
        assert_eq!(compare_versions("a.1.0", "0.1.0"), Ordering::Less);
    }

    #[test]
    fn parses_latest_release() {
        let body = r#"{ "tag_name": "v0.4.0", "name": "Work Boost 0.4.0", "draft": false, "prerelease": false }"#;
        let info = parse_latest_release(body).expect("should parse");
        assert_eq!(info.version, "0.4.0");
        assert_eq!(info.title, "Work Boost 0.4.0");
    }

    #[test]
    fn parses_latest_release_without_v_prefix() {
        let body = r#"{ "tag_name": "0.4.0", "name": "" }"#;
        let info = parse_latest_release(body).expect("should parse");
        assert_eq!(info.version, "0.4.0");
        // Falls back to the version when the release name is empty.
        assert_eq!(info.title, "0.4.0");
    }

    #[test]
    fn rejects_malformed_latest_release() {
        assert!(parse_latest_release("not json").is_none());
        assert!(parse_latest_release(r#"{ "name": "no tag" }"#).is_none());
        assert!(parse_latest_release(r#"[]"#).is_none());
    }

    #[test]
    fn windows_disables_auto_update() {
        assert!(!auto_update_enabled_for("windows"));
        assert!(auto_update_enabled_for("linux"));
        assert!(auto_update_enabled_for("macos"));
    }
}
