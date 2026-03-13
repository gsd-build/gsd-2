//! BLAKE3 content hashing exposed to JS via N-API.
//!
//! Provides ultra-fast content hashing (~GB/s) for:
//! - File change detection between agent loops
//! - Cache invalidation for parsed results
//! - Content deduplication across worktrees
//! - Quick content comparison without reading full files

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::Path;

/// BLAKE3 hash of a UTF-8 string, returned as lowercase hex (64 chars).
#[napi(js_name = "hashString")]
pub fn hash_string(text: String) -> String {
	blake3::hash(text.as_bytes()).to_hex().to_string()
}

/// BLAKE3 hash of a file's contents, returned as lowercase hex (64 chars).
#[napi(js_name = "hashFile")]
pub fn hash_file(path: String) -> Result<String> {
	let data = std::fs::read(&path)
		.map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read {path}: {e}")))?;
	Ok(blake3::hash(&data).to_hex().to_string())
}

/// BLAKE3 hash of multiple files in parallel via rayon.
/// Returns a map of path -> hex hash. Skips files that fail to read.
#[napi(js_name = "hashFiles")]
pub fn hash_files(paths: Vec<String>) -> HashMap<String, String> {
	paths
		.into_par_iter()
		.filter_map(|p| {
			let data = std::fs::read(&p).ok()?;
			let hex = blake3::hash(&data).to_hex().to_string();
			Some((p, hex))
		})
		.collect()
}

/// Options for `hashDirectory`.
#[napi(object)]
pub struct HashDirectoryOptions {
	/// Glob pattern to filter files (e.g. "**/*.ts"). Defaults to all files.
	pub glob: Option<String>,
	/// Whether to respect .gitignore rules. Defaults to true.
	pub gitignore: Option<bool>,
}

/// BLAKE3 hash all files in a directory (optionally filtered by glob).
/// Uses the `ignore` crate for .gitignore support and rayon for parallelism.
/// Returns a map of relative path -> hex hash.
#[napi(js_name = "hashDirectory")]
pub fn hash_directory(
	dir_path: String,
	options: Option<HashDirectoryOptions>,
) -> Result<HashMap<String, String>> {
	let dir = Path::new(&dir_path);
	if !dir.is_dir() {
		return Err(Error::new(
			Status::GenericFailure,
			format!("Not a directory: {dir_path}"),
		));
	}

	let gitignore = options.as_ref().and_then(|o| o.gitignore).unwrap_or(true);
	let glob_pattern = options.as_ref().and_then(|o| o.glob.clone());

	let mut builder = ignore::WalkBuilder::new(dir);
	builder.git_ignore(gitignore).hidden(false);

	if let Some(ref pat) = glob_pattern {
		let mut types = ignore::types::TypesBuilder::new();
		types.add("custom", pat).map_err(|e| {
			Error::new(Status::GenericFailure, format!("Invalid glob pattern: {e}"))
		})?;
		types.select("custom");
		builder.types(types.build().map_err(|e| {
			Error::new(Status::GenericFailure, format!("Failed to build types: {e}"))
		})?);
	}

	let entries: Vec<_> = builder
		.build()
		.filter_map(|e| e.ok())
		.filter(|e| e.file_type().map_or(false, |ft| ft.is_file()))
		.map(|e| e.into_path())
		.collect();

	let results: HashMap<String, String> = entries
		.into_par_iter()
		.filter_map(|path| {
			let data = std::fs::read(&path).ok()?;
			let hex = blake3::hash(&data).to_hex().to_string();
			let rel = path
				.strip_prefix(dir)
				.unwrap_or(&path)
				.to_string_lossy()
				.to_string();
			Some((rel, hex))
		})
		.collect();

	Ok(results)
}

/// Given a map of path -> previous hash, re-hash each file and return
/// the list of paths whose content has changed (or no longer exists).
#[napi(js_name = "didFilesChange")]
pub fn did_files_change(hashes: HashMap<String, String>) -> Vec<String> {
	hashes
		.into_par_iter()
		.filter(|(path, old_hash)| {
			match std::fs::read(path) {
				Ok(data) => {
					let current = blake3::hash(&data).to_hex().to_string();
					current != *old_hash
				}
				// File gone or unreadable = changed
				Err(_) => true,
			}
		})
		.map(|(path, _)| path)
		.collect()
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::fs;

	#[test]
	fn hash_string_deterministic() {
		let h1 = hash_string("hello world".into());
		let h2 = hash_string("hello world".into());
		assert_eq!(h1, h2);
		assert_eq!(h1.len(), 64);
	}

	#[test]
	fn hash_string_different_inputs() {
		let h1 = hash_string("hello".into());
		let h2 = hash_string("world".into());
		assert_ne!(h1, h2);
	}

	#[test]
	fn hash_string_empty() {
		let h = hash_string(String::new());
		assert_eq!(h.len(), 64);
		assert_eq!(
			h,
			"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
		);
	}

	#[test]
	fn hash_file_works() {
		let dir = tempfile::tempdir().unwrap();
		let file = dir.path().join("test.txt");
		fs::write(&file, "hello world").unwrap();

		let h = hash_file(file.to_string_lossy().to_string()).unwrap();
		let expected = hash_string("hello world".into());
		assert_eq!(h, expected);
	}

	#[test]
	fn hash_file_missing() {
		let result = hash_file("/nonexistent/path/file.txt".into());
		assert!(result.is_err());
	}

	#[test]
	fn hash_files_parallel() {
		let dir = tempfile::tempdir().unwrap();
		let f1 = dir.path().join("a.txt");
		let f2 = dir.path().join("b.txt");
		fs::write(&f1, "aaa").unwrap();
		fs::write(&f2, "bbb").unwrap();

		let result = hash_files(vec![
			f1.to_string_lossy().to_string(),
			f2.to_string_lossy().to_string(),
			"/nonexistent".into(),
		]);

		assert_eq!(result.len(), 2);
		assert!(result.contains_key(&f1.to_string_lossy().to_string()));
		assert!(result.contains_key(&f2.to_string_lossy().to_string()));
	}

	#[test]
	fn did_files_change_detects_changes() {
		let dir = tempfile::tempdir().unwrap();
		let f1 = dir.path().join("stable.txt");
		let f2 = dir.path().join("changed.txt");
		fs::write(&f1, "same").unwrap();
		fs::write(&f2, "original").unwrap();

		let h1 = hash_file(f1.to_string_lossy().to_string()).unwrap();
		let h2 = hash_file(f2.to_string_lossy().to_string()).unwrap();

		fs::write(&f2, "modified").unwrap();

		let mut prev = HashMap::new();
		prev.insert(f1.to_string_lossy().to_string(), h1);
		prev.insert(f2.to_string_lossy().to_string(), h2);
		prev.insert("/gone/file.txt".into(), "abc123".into());

		let changed = did_files_change(prev);
		assert!(changed.contains(&f2.to_string_lossy().to_string()));
		assert!(changed.contains(&"/gone/file.txt".to_string()));
		assert!(!changed.contains(&f1.to_string_lossy().to_string()));
	}

	#[test]
	fn hash_directory_works() {
		let dir = tempfile::tempdir().unwrap();
		fs::write(dir.path().join("a.txt"), "aaa").unwrap();
		fs::create_dir(dir.path().join("sub")).unwrap();
		fs::write(dir.path().join("sub/b.txt"), "bbb").unwrap();

		let result = hash_directory(dir.path().to_string_lossy().to_string(), None).unwrap();
		assert!(result.len() >= 2);
	}
}
