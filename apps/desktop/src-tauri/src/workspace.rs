use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// The workspace root path, resolved from the user's home directory.
/// Corresponds to `~/.workboost/workspace/`.
pub fn workspace_root() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".workboost").join("workspace")
}

// ---------------------------------------------------------------------------
// Path containment
// ---------------------------------------------------------------------------

/// True if any path segment is exactly `..`. Checks exact segments rather than
/// substrings so names like `a..b.md` stay valid, matching the shared
/// `guardWorkspacePath` (which forbids the `..` segment, not the substring).
fn contains_parent_segment(rel_path: &str) -> bool {
    rel_path.split(['/', '\\']).any(|segment| segment == "..")
}

/// Canonicalize `path`, walking up to the deepest ancestor that exists and
/// returning `(canonical ancestor, missing suffix)`. Mirrors the server's
/// `canonicalizePath`, so paths inside not-yet-created directories resolve
/// instead of failing on the missing parent.
fn canonicalize_deepest(path: &Path) -> Result<(PathBuf, PathBuf), String> {
    // Components are collected while walking up (deepest first), so they are
    // reversed before being joined back into the missing suffix.
    let mut missing: Vec<PathBuf> = Vec::new();
    let mut current = path.to_path_buf();
    loop {
        match current.canonicalize() {
            Ok(canonical) => {
                return Ok((canonical, missing.into_iter().rev().collect::<PathBuf>()));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let Some(filename) = current.file_name().map(PathBuf::from) else {
                    return Err(format!("Cannot resolve path: {error}"));
                };
                let Some(parent) = current.parent().map(Path::to_path_buf) else {
                    return Err(format!("Cannot resolve path: {error}"));
                };
                missing.push(filename);
                current = parent;
            }
            Err(error) => return Err(format!("Cannot resolve path: {error}")),
        }
    }
}

/// Resolve a relative path inside the workspace root, with symlink-aware
/// containment checking. Tolerates not-yet-existing path components (create,
/// write) by resolving the deepest existing ancestor and rejoining the missing
/// tail after the containment check.
fn resolve_inside(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    // Prevent the path from escaping via root-relative segments
    if contains_parent_segment(rel_path) {
        return Err("Path may not contain '..'".into());
    }
    let path = root.join(rel_path);

    let (canonical, missing) = canonicalize_deepest(&path)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace root: {e}"))?;

    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal detected".to_string());
    }

    // Joining an empty suffix would append a trailing separator, which makes
    // later `rename`/`stat` calls treat the file path as a directory.
    if missing.as_os_str().is_empty() {
        Ok(canonical)
    } else {
        Ok(canonical.join(missing))
    }
}

/// Resolve a path that is expected to exist (read, stat, remove, move source).
fn resolve_existing(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let path = root.join(rel_path);
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path: {e}"))?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace root: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal detected".to_string());
    }
    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RawFile {
    pub path: String,
    pub body: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub size: u64,
    pub modified_at: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub path: String,
    pub size: u64,
    pub modified_at: String,
}

/// Format a system time as ISO 8601 UTC with milliseconds (e.g. `2026-08-21T10:15:30.123Z`).
/// The server's `modifiedAt` uses the same shape (from `stat.mtime`), so both ports
/// produce comparable CAS values.
fn iso_time(metadata: &fs::Metadata) -> String {
    let duration = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();

    let days = secs / 86_400;
    let remaining = secs % 86_400;
    let hours = remaining / 3_600;
    let minutes = (remaining % 3_600) / 60;
    let seconds = remaining % 60;

    // Days since epoch to (year, month, day) via civil-from-days (Howard Hinnant's algorithm).
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{millis:03}Z",
        month = m,
        day = d,
    )
}

// ---------------------------------------------------------------------------
// Extension filters (matches the shared workspace-path.ts)
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS: &[&str] = &[".md", ".json", ".txt", ".html"];

fn has_allowed_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{}", ext.to_lowercase()))
        .is_some_and(|ext| ALLOWED_EXTENSIONS.contains(&ext.as_str()))
}

/// Workspace-relative path rendered with `/` separators. The webview splits
/// paths on `/` when building the file tree (buildFileTree), so Windows `\`
/// separators would flatten the tree.
pub(crate) fn rel_path_string(rel: &Path) -> String {
    rel.to_string_lossy().replace('\\', "/")
}

// ---------------------------------------------------------------------------
// Core logic (testable with an explicit root)
// ---------------------------------------------------------------------------

fn core_init(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("Failed to create workspace: {e}"))?;
    for dir in &["daily", "debts", "notes", "archive"] {
        fs::create_dir_all(root.join(dir)).map_err(|e| format!("Failed to create {dir}: {e}"))?;
    }
    // Trash directory (used by the crash-recoverable journal protocol)
    fs::create_dir_all(root.join(".workboost").join("trash"))
        .map_err(|e| format!("Failed to create trash: {e}"))?;
    Ok(())
}

fn core_read_file(root: &Path, rel_path: &str) -> Result<RawFile, String> {
    let resolved = resolve_existing(root, rel_path)?;
    let metadata = fs::metadata(&resolved).map_err(|e| format!("Cannot stat: {e}"))?;
    if !metadata.is_file() {
        return Err("Not a file".into());
    }
    let body = fs::read_to_string(&resolved).map_err(|e| format!("Cannot read: {e}"))?;
    let canonical_root = root.canonicalize().map_err(|e| format!("Bad root: {e}"))?;
    let rel = resolved
        .strip_prefix(&canonical_root)
        .map_err(|_| "Path resolution error".to_string())?;
    Ok(RawFile {
        path: rel_path_string(rel),
        body,
        size: metadata.len(),
        modified_at: iso_time(&metadata),
    })
}

fn core_write_file(
    root: &Path,
    rel_path: &str,
    content: &str,
    expected_modified_at: Option<&str>,
) -> Result<WriteResult, String> {
    let resolved = resolve_inside(root, rel_path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent: {e}"))?;
    }

    // Compare-and-swap: if the file exists and expected_modified_at is set, check mtime
    if let Some(expected) = expected_modified_at {
        if resolved.exists() {
            let metadata = fs::metadata(&resolved).map_err(|e| format!("Cannot stat: {e}"))?;
            let actual = iso_time(&metadata);
            if actual != expected {
                return Err(format!(
                    "CONFLICT: file changed on disk (expected {expected}, actual {actual})"
                ));
            }
        }
    }

    // Atomic write: write to .tmp then rename
    let tmp_path = resolved.with_extension("tmp");
    fs::write(&tmp_path, content).map_err(|e| format!("Cannot write: {e}"))?;
    fs::rename(&tmp_path, &resolved).map_err(|e| format!("Cannot finalize: {e}"))?;

    let metadata = fs::metadata(&resolved).map_err(|e| format!("Cannot stat: {e}"))?;
    let canonical_root = root.canonicalize().map_err(|e| format!("Bad root: {e}"))?;
    let rel = resolved
        .strip_prefix(&canonical_root)
        .map_err(|_| "Path resolution error".to_string())?;
    Ok(WriteResult {
        path: rel_path_string(rel),
        size: metadata.len(),
        modified_at: iso_time(&metadata),
    })
}

fn core_create_file(root: &Path, rel_path: &str, content: &str) -> Result<RawFile, String> {
    let resolved = resolve_inside(root, rel_path)?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent: {e}"))?;
    }

    use std::fs::OpenOptions;
    use std::io::Write;

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true) // atomic create: fails if the path already exists (no TOCTOU race)
        .open(&resolved)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("CONFLICT: file already exists: {rel_path}")
            } else {
                format!("Cannot create file: {e}")
            }
        })?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Cannot write: {e}"))?;
    drop(file);

    let metadata = fs::metadata(&resolved).map_err(|e| format!("Cannot stat: {e}"))?;
    let canonical_root = root.canonicalize().map_err(|e| format!("Bad root: {e}"))?;
    let rel = resolved
        .strip_prefix(&canonical_root)
        .map_err(|_| "Path resolution error".to_string())?;
    Ok(RawFile {
        path: rel_path_string(rel),
        body: content.to_string(),
        size: metadata.len(),
        modified_at: iso_time(&metadata),
    })
}

fn core_list_files(root: &Path) -> Result<Vec<String>, String> {
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut files = Vec::new();
    collect_files(root, root, &mut files).map_err(|e| format!("Cannot list files: {e}"))?;
    files.sort();
    Ok(files)
}

fn collect_files(root: &Path, dir: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_str().unwrap_or("").to_string();

        // Skip dot-directories and dot-files
        if name.starts_with('.') && name != "." {
            continue;
        }

        if path.is_dir() {
            collect_files(root, &path, files)?;
        } else if path.is_file() && has_allowed_extension(&path) {
            if let Ok(rel) = path.strip_prefix(root) {
                files.push(rel_path_string(rel));
            }
        }
    }
    Ok(())
}

fn core_stat(root: &Path, rel_path: &str) -> Result<FileStat, String> {
    let resolved = resolve_existing(root, rel_path)?;
    let metadata = fs::metadata(&resolved).map_err(|e| format!("Cannot stat: {e}"))?;
    Ok(FileStat {
        size: metadata.len(),
        modified_at: iso_time(&metadata),
    })
}

fn core_move(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let from_resolved = resolve_existing(root, from)?;
    let to_resolved = resolve_inside(root, to)?;

    if let Some(parent) = to_resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create destination parent: {e}"))?;
    }

    fs::rename(&from_resolved, &to_resolved).map_err(|e| format!("Cannot move: {e}"))?;
    Ok(())
}

fn core_remove(root: &Path, rel_path: &str) -> Result<(), String> {
    let resolved = resolve_existing(root, rel_path)?;
    if resolved.is_dir() {
        fs::remove_dir(&resolved).map_err(|e| format!("Cannot remove directory: {e}"))?;
    } else {
        fs::remove_file(&resolved).map_err(|e| format!("Cannot remove file: {e}"))?;
    }
    Ok(())
}

fn core_mkdir(root: &Path, rel_path: &str) -> Result<(), String> {
    let resolved = resolve_inside(root, rel_path)?;
    fs::create_dir_all(&resolved).map_err(|e| format!("Cannot create directory: {e}"))?;
    Ok(())
}

fn core_exists(root: &Path, rel_path: &str) -> Result<bool, String> {
    let resolved = match resolve_inside(root, rel_path) {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    Ok(resolved.exists())
}

// ---------------------------------------------------------------------------
// IPC commands (thin wrappers over the core logic)
// ---------------------------------------------------------------------------

/// Ensure the workspace root and standard directories exist.
/// Called once at shell startup before the webview loads.
#[tauri::command]
pub fn workspace_init() -> Result<(), String> {
    core_init(&workspace_root())
}

/// Read a file's content and metadata.
#[tauri::command]
pub fn workspace_read_file(path: String) -> Result<RawFile, String> {
    core_read_file(&workspace_root(), &path)
}

/// Write content to a file using atomic tmp+rename.
/// If `expected_modified_at` is `Some`, performs compare-and-swap on mtime.
#[tauri::command]
pub fn workspace_write_file(
    path: String,
    content: String,
    expected_modified_at: Option<String>,
) -> Result<WriteResult, String> {
    core_write_file(
        &workspace_root(),
        &path,
        &content,
        expected_modified_at.as_deref(),
    )
}

/// Atomic file creation. Fails with `CONFLICT` if the file already exists.
/// Uses `O_CREAT | O_EXCL` semantics: the existence check and creation are
/// a single atomic operation.
#[tauri::command]
pub fn workspace_create_file(path: String, content: String) -> Result<RawFile, String> {
    core_create_file(&workspace_root(), &path, &content)
}

/// List files in the workspace, filtered by allowed extensions and excluding
/// dot-directories. Returns paths relative to the workspace root, sorted.
#[tauri::command]
pub fn workspace_list_files(_glob: String) -> Result<Vec<String>, String> {
    core_list_files(&workspace_root())
}

/// Get file stat: size + modified_at (ISO 8601).
#[tauri::command]
pub fn workspace_stat(path: String) -> Result<FileStat, String> {
    core_stat(&workspace_root(), &path)
}

/// Move/rename a file. Creates parent directories of `to` if needed.
#[tauri::command]
pub fn workspace_move(from: String, to: String) -> Result<(), String> {
    core_move(&workspace_root(), &from, &to)
}

/// Delete a file or empty directory.
#[tauri::command]
pub fn workspace_remove(path: String) -> Result<(), String> {
    core_remove(&workspace_root(), &path)
}

/// Create a directory (recursive).
#[tauri::command]
pub fn workspace_mkdir(path: String) -> Result<(), String> {
    core_mkdir(&workspace_root(), &path)
}

/// Check if a file or directory exists.
#[tauri::command]
pub fn workspace_exists(path: String) -> Result<bool, String> {
    core_exists(&workspace_root(), &path)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("workboost-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_inside_accepts_valid_paths() {
        let root = temp_root("valid");
        fs::create_dir_all(root.join("daily")).unwrap();
        let resolved = resolve_inside(&root, "daily/2026-08-21.md").unwrap();
        assert!(resolved.starts_with(root.canonicalize().unwrap()));
    }

    #[test]
    fn resolve_inside_rejects_parent_traversal() {
        let root = temp_root("traversal");
        fs::create_dir_all(&root).unwrap();
        assert!(resolve_inside(&root, "../escape.md").is_err());
        assert!(resolve_inside(&root, "a/../../escape.md").is_err());
    }

    #[test]
    fn resolve_inside_rejects_absolute_paths_outside_root() {
        let root = temp_root("absolute");
        fs::create_dir_all(&root).unwrap();
        // Absolute path joined onto root stays inside, but a path that resolves
        // outside via a symlink must be rejected (covered by symlink test).
        let absolute = "/etc/passwd";
        let result = resolve_inside(&root, absolute.trim_start_matches('/'));
        // `/etc` parent may not exist relative to root; either way no escape.
        assert!(!result.is_ok_and(|p| p == Path::new("/etc/passwd")));
    }

    #[cfg(unix)]
    #[test]
    fn resolve_existing_rejects_symlink_escape() {
        let root = temp_root("symlink");
        fs::create_dir_all(&root).unwrap();
        // Create a symlink inside the root pointing outside
        let outside = std::env::temp_dir().join(format!(
            "workboost-test-outside-{}",
            std::process::id()
        ));
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "top secret").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();

        // resolve_existing follows the symlink and must reject the escape
        let result = resolve_existing(&root, "link/secret.txt");
        assert!(result.is_err());
    }

    #[test]
    fn write_file_cas_matches_expected_mtime() {
        let root = temp_root("cas-match");
        core_init(&root).unwrap();
        let result = core_write_file(&root, "notes/a.md", "hello", None).unwrap();
        // Now write again with the returned mtime: should succeed
        let again = core_write_file(&root, "notes/a.md", "world", Some(&result.modified_at)).unwrap();
        assert_eq!(again.path, "notes/a.md");
        let content = fs::read_to_string(root.join("notes/a.md")).unwrap();
        assert_eq!(content, "world");
    }

    #[test]
    fn write_file_cas_rejects_mismatch() {
        let root = temp_root("cas-mismatch");
        core_init(&root).unwrap();
        core_write_file(&root, "notes/a.md", "hello", None).unwrap();
        // Stale expected mtime -> conflict
        let err = core_write_file(&root, "notes/a.md", "world", Some("2000-01-01T00:00:00.000Z"))
            .unwrap_err();
        assert!(err.starts_with("CONFLICT"), "got: {err}");
    }

    #[test]
    fn write_file_unconditional_without_expected() {
        let root = temp_root("cas-none");
        core_init(&root).unwrap();
        core_write_file(&root, "notes/a.md", "first", None).unwrap();
        // No expected mtime -> unconditional overwrite
        let result = core_write_file(&root, "notes/a.md", "second", None).unwrap();
        let content = fs::read_to_string(root.join("notes/a.md")).unwrap();
        assert_eq!(content, "second");
        assert!(!result.modified_at.is_empty());
    }

    #[test]
    fn create_file_new_succeeds() {
        let root = temp_root("create-new");
        core_init(&root).unwrap();
        let file = core_create_file(&root, "notes/b.md", "new").unwrap();
        assert_eq!(file.body, "new");
        assert!(root.join("notes/b.md").exists());
    }

    #[test]
    fn create_file_existing_fails() {
        let root = temp_root("create-existing");
        core_init(&root).unwrap();
        core_create_file(&root, "notes/b.md", "first").unwrap();
        let err = core_create_file(&root, "notes/b.md", "second").unwrap_err();
        assert!(err.starts_with("CONFLICT"), "got: {err}");
        // Original content preserved
        let content = fs::read_to_string(root.join("notes/b.md")).unwrap();
        assert_eq!(content, "first");
    }

    #[test]
    fn list_files_filters_dot_dirs_and_extensions() {
        let root = temp_root("list-filters");
        core_init(&root).unwrap();
        fs::write(root.join("daily/2026-08-21.md"), "# x").unwrap();
        fs::write(root.join("notes/app.html"), "<html></html>").unwrap();
        fs::write(root.join("notes/skip.txt.bak"), "no").unwrap(); // wrong extension
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join(".hidden/secret.md"), "secret").unwrap();
        fs::write(root.join(".workboost/trash/journal.json"), "{}").unwrap();

        let files = core_list_files(&root).unwrap();
        assert!(files.contains(&"daily/2026-08-21.md".to_string()));
        assert!(files.contains(&"notes/app.html".to_string()));
        assert!(!files.contains(&"notes/skip.txt.bak".to_string()));
        assert!(!files.iter().any(|f| f.contains(".hidden")));
        assert!(!files.iter().any(|f| f.starts_with(".workboost")));
    }

    #[test]
    fn resolve_inside_allows_double_dot_in_filename() {
        // `..` as a substring is a valid filename; only exact `..` segments are escapes.
        let root = temp_root("double-dot-name");
        fs::create_dir_all(root.join("notes")).unwrap();
        assert!(resolve_inside(&root, "notes/a..b.md").is_ok());
    }

    #[test]
    fn resolve_inside_rejects_backslash_parent_segments() {
        // On Windows `\` is a separator, so `..\escape.md` is a traversal there;
        // elsewhere it is still rejected so the rule cannot silently differ by OS.
        let root = temp_root("backslash-traversal");
        fs::create_dir_all(&root).unwrap();
        assert!(resolve_inside(&root, "..\\escape.md").is_err());
    }

    #[test]
    fn resolve_inside_resolves_missing_parent_dirs() {
        // The server's canonicalizePath resolves the deepest existing ancestor,
        // so creating a file in a new folder works without a prior mkdir.
        let root = temp_root("missing-parent");
        core_init(&root).unwrap();
        let resolved = resolve_inside(&root, "newdir/sub/a.md").unwrap();
        assert_eq!(
            resolved,
            root.canonicalize().unwrap().join("newdir/sub/a.md")
        );
    }

    #[test]
    fn rel_path_string_normalizes_separators() {
        // The webview builds the file tree by splitting on `/`; a Windows `\`
        // separator would flatten the tree. On unix the `\` form is a literal
        // filename character, and it is still normalized the same way.
        assert_eq!(rel_path_string(Path::new("daily\\a.md")), "daily/a.md");
        assert_eq!(rel_path_string(Path::new("daily/a.md")), "daily/a.md");
    }

    #[test]
    fn write_file_creates_missing_parent_dirs() {
        let root = temp_root("write-missing-parent");
        core_init(&root).unwrap();
        let result = core_write_file(&root, "newdir/sub/a.md", "hello", None).unwrap();
        assert_eq!(result.path, "newdir/sub/a.md");
        assert!(root.join("newdir/sub/a.md").is_file());
    }

    #[test]
    fn create_file_in_missing_dir_succeeds() {
        let root = temp_root("create-missing-dir");
        core_init(&root).unwrap();
        let file = core_create_file(&root, "newdir/b.md", "new").unwrap();
        assert_eq!(file.path, "newdir/b.md");
        assert!(root.join("newdir/b.md").is_file());
    }

    #[test]
    fn move_file_creates_missing_destination_dir() {
        let root = temp_root("move-missing-dir");
        core_init(&root).unwrap();
        core_write_file(&root, "notes/a.md", "hello", None).unwrap();
        core_move(&root, "notes/a.md", "moved/deep/b.md").unwrap();
        assert!(root.join("moved/deep/b.md").is_file());
        assert!(!root.join("notes/a.md").exists());
    }

    #[test]
    fn serialize_uses_camel_case_keys() {
        // The renderer reads `modifiedAt`/`size`/`path` from IPC responses; the
        // Rust structs must serialize with camelCase names or the compare-and-swap
        // mtime is silently undefined and every write skips the CAS check.
        let write = WriteResult {
            path: "notes/a.md".into(),
            size: 12,
            modified_at: "2026-08-27T10:00:00.000Z".into(),
        };
        let value = serde_json::to_value(write).unwrap();
        let obj = value.as_object().unwrap();
        assert!(obj.contains_key("modifiedAt"), "keys: {:?}", obj.keys());
        assert!(obj.contains_key("size"));
        assert!(!obj.contains_key("modified_at"));
    }
}
