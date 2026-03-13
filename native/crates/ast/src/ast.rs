//! AST-aware structural search and rewrite powered by ast-grep.

use std::{collections::{BTreeMap, BTreeSet, HashMap}, path::{Path, PathBuf}};

use ast_grep_core::{Language, MatchStrictness, matcher::Pattern, source::Edit, tree_sitter::LanguageExt};
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::{glob_util, language::SupportLang};

const DEFAULT_FIND_LIMIT: u32 = 50;

#[napi(object)]
pub struct AstFindOptions {
	pub patterns: Option<Vec<String>>,
	pub lang: Option<String>,
	pub path: Option<String>,
	pub glob: Option<String>,
	pub selector: Option<String>,
	pub strictness: Option<String>,
	pub limit: Option<u32>,
	pub offset: Option<u32>,
	#[napi(js_name = "includeMeta")]
	pub include_meta: Option<bool>,
	pub context: Option<u32>,
}

#[napi(object)]
pub struct AstFindMatch {
	pub path: String,
	pub text: String,
	#[napi(js_name = "byteStart")]
	pub byte_start: u32,
	#[napi(js_name = "byteEnd")]
	pub byte_end: u32,
	#[napi(js_name = "startLine")]
	pub start_line: u32,
	#[napi(js_name = "startColumn")]
	pub start_column: u32,
	#[napi(js_name = "endLine")]
	pub end_line: u32,
	#[napi(js_name = "endColumn")]
	pub end_column: u32,
	#[napi(js_name = "metaVariables")]
	pub meta_variables: Option<HashMap<String, String>>,
}

#[napi(object)]
pub struct AstFindResult {
	pub matches: Vec<AstFindMatch>,
	#[napi(js_name = "totalMatches")]
	pub total_matches: u32,
	#[napi(js_name = "filesWithMatches")]
	pub files_with_matches: u32,
	#[napi(js_name = "filesSearched")]
	pub files_searched: u32,
	#[napi(js_name = "limitReached")]
	pub limit_reached: bool,
	#[napi(js_name = "parseErrors")]
	pub parse_errors: Option<Vec<String>>,
}

#[napi(object)]
pub struct AstReplaceOptions {
	pub rewrites: Option<HashMap<String, String>>,
	pub lang: Option<String>,
	pub path: Option<String>,
	pub glob: Option<String>,
	pub selector: Option<String>,
	pub strictness: Option<String>,
	#[napi(js_name = "dryRun")]
	pub dry_run: Option<bool>,
	#[napi(js_name = "maxReplacements")]
	pub max_replacements: Option<u32>,
	#[napi(js_name = "maxFiles")]
	pub max_files: Option<u32>,
	#[napi(js_name = "failOnParseError")]
	pub fail_on_parse_error: Option<bool>,
}

#[napi(object)]
pub struct AstReplaceChange {
	pub path: String, pub before: String, pub after: String,
	#[napi(js_name = "byteStart")]
	pub byte_start: u32,
	#[napi(js_name = "byteEnd")]
	pub byte_end: u32,
	#[napi(js_name = "deletedLength")]
	pub deleted_length: u32,
	#[napi(js_name = "startLine")]
	pub start_line: u32,
	#[napi(js_name = "startColumn")]
	pub start_column: u32,
	#[napi(js_name = "endLine")]
	pub end_line: u32,
	#[napi(js_name = "endColumn")]
	pub end_column: u32,
}

#[napi(object)]
pub struct AstReplaceFileChange { pub path: String, pub count: u32 }

#[napi(object)]
pub struct AstReplaceResult {
	pub changes: Vec<AstReplaceChange>,
	#[napi(js_name = "fileChanges")]
	pub file_changes: Vec<AstReplaceFileChange>,
	#[napi(js_name = "totalReplacements")]
	pub total_replacements: u32,
	#[napi(js_name = "filesTouched")]
	pub files_touched: u32,
	#[napi(js_name = "filesSearched")]
	pub files_searched: u32,
	pub applied: bool,
	#[napi(js_name = "limitReached")]
	pub limit_reached: bool,
	#[napi(js_name = "parseErrors")]
	pub parse_errors: Option<Vec<String>>,
}

struct FileCandidate { absolute_path: PathBuf, display_path: String }
struct PendingFileChange { change: AstReplaceChange, edit: Edit<String> }
fn to_u32(value: usize) -> u32 { value.min(u32::MAX as usize) as u32 }

static LANG_ALIASES: phf::Map<&'static str, SupportLang> = phf::phf_map! {
	"bash" => SupportLang::Bash, "sh" => SupportLang::Bash,
	"c" => SupportLang::C, "cpp" => SupportLang::Cpp, "c++" => SupportLang::Cpp,
	"cc" => SupportLang::Cpp, "cxx" => SupportLang::Cpp,
	"csharp" => SupportLang::CSharp, "c#" => SupportLang::CSharp, "cs" => SupportLang::CSharp,
	"css" => SupportLang::Css, "diff" => SupportLang::Diff, "patch" => SupportLang::Diff,
	"elixir" => SupportLang::Elixir, "ex" => SupportLang::Elixir,
	"go" => SupportLang::Go, "golang" => SupportLang::Go,
	"haskell" => SupportLang::Haskell, "hs" => SupportLang::Haskell,
	"hcl" => SupportLang::Hcl, "tf" => SupportLang::Hcl, "tfvars" => SupportLang::Hcl, "terraform" => SupportLang::Hcl,
	"html" => SupportLang::Html, "htm" => SupportLang::Html,
	"java" => SupportLang::Java,
	"javascript" => SupportLang::JavaScript, "js" => SupportLang::JavaScript,
	"jsx" => SupportLang::JavaScript, "mjs" => SupportLang::JavaScript, "cjs" => SupportLang::JavaScript,
	"json" => SupportLang::Json, "julia" => SupportLang::Julia, "jl" => SupportLang::Julia,
	"kotlin" => SupportLang::Kotlin, "kt" => SupportLang::Kotlin,
	"lua" => SupportLang::Lua, "make" => SupportLang::Make, "makefile" => SupportLang::Make,
	"markdown" => SupportLang::Markdown, "md" => SupportLang::Markdown, "mdx" => SupportLang::Markdown,
	"nix" => SupportLang::Nix, "objc" => SupportLang::ObjC, "objective-c" => SupportLang::ObjC,
	"odin" => SupportLang::Odin, "php" => SupportLang::Php,
	"python" => SupportLang::Python, "py" => SupportLang::Python,
	"regex" => SupportLang::Regex, "ruby" => SupportLang::Ruby, "rb" => SupportLang::Ruby,
	"rust" => SupportLang::Rust, "rs" => SupportLang::Rust,
	"scala" => SupportLang::Scala, "solidity" => SupportLang::Solidity, "sol" => SupportLang::Solidity,
	"starlark" => SupportLang::Starlark, "star" => SupportLang::Starlark,
	"swift" => SupportLang::Swift, "toml" => SupportLang::Toml, "tsx" => SupportLang::Tsx,
	"typescript" => SupportLang::TypeScript, "ts" => SupportLang::TypeScript,
	"mts" => SupportLang::TypeScript, "cts" => SupportLang::TypeScript,
	"verilog" => SupportLang::Verilog, "systemverilog" => SupportLang::Verilog, "sv" => SupportLang::Verilog,
	"xml" => SupportLang::Xml, "xsl" => SupportLang::Xml, "svg" => SupportLang::Xml,
	"yaml" => SupportLang::Yaml, "yml" => SupportLang::Yaml, "zig" => SupportLang::Zig,
};

fn supported_lang_list() -> String { let mut keys: Vec<&str> = LANG_ALIASES.keys().copied().collect(); keys.sort_unstable(); keys.join(", ") }

fn resolve_supported_lang(value: &str) -> Result<SupportLang> {
	let lower = value.to_ascii_lowercase();
	LANG_ALIASES.get(lower.as_str()).copied().ok_or_else(|| Error::from_reason(format!("Unsupported language '{value}'. Supported: {}", supported_lang_list())))
}

fn resolve_language(lang: Option<&str>, file_path: &Path) -> Result<SupportLang> {
	if let Some(lang) = lang.map(str::trim).filter(|l| !l.is_empty()) { return resolve_supported_lang(lang); }
	SupportLang::from_path(file_path).ok_or_else(|| Error::from_reason(format!("Unable to infer language from file extension: {}. Specify `lang` explicitly.", file_path.display())))
}

fn is_supported_file(file_path: &Path, explicit_lang: Option<&str>) -> bool {
	if explicit_lang.is_some() { return true; }
	resolve_language(None, file_path).is_ok()
}

fn infer_single_replace_lang(candidates: &[FileCandidate]) -> Result<String> {
	let mut inferred = BTreeSet::new();
	let mut unresolved = Vec::new();
	for c in candidates {
		match resolve_language(None, &c.absolute_path) {
			Ok(l) => { inferred.insert(l.canonical_name().to_string()); },
			Err(e) => unresolved.push(format!("{}: {}", c.display_path, e)),
		}
	}
	if !unresolved.is_empty() { return Err(Error::from_reason(format!("`lang` is required for ast_edit when language cannot be inferred from all files:\n{}", unresolved.into_iter().map(|e| format!("- {e}")).collect::<Vec<_>>().join("\n")))); }
	if inferred.is_empty() { return Err(Error::from_reason("`lang` is required for ast_edit when no files match path/glob".to_string())); }
	if inferred.len() > 1 { return Err(Error::from_reason(format!("`lang` is required for ast_edit when path/glob resolves to multiple languages: {}", inferred.into_iter().collect::<Vec<_>>().join(", ")))); }
	Ok(inferred.into_iter().next().unwrap())
}

fn parse_strictness(value: Option<&str>) -> Result<MatchStrictness> {
	let Some(raw) = value.map(str::trim).filter(|v| !v.is_empty()) else { return Ok(MatchStrictness::Smart) };
	raw.parse::<MatchStrictness>().map_err(|e| Error::from_reason(format!("Invalid strictness '{raw}': {e}")))
}

fn normalize_search_path(path: Option<String>) -> Result<PathBuf> {
	let raw = path.unwrap_or_else(|| ".".into());
	let candidate = PathBuf::from(raw.trim());
	let absolute = if candidate.is_absolute() { candidate } else { std::env::current_dir().map_err(|e| Error::from_reason(format!("Failed to resolve cwd: {e}")))?.join(candidate) };
	Ok(std::fs::canonicalize(&absolute).unwrap_or(absolute))
}

fn collect_candidates(path: Option<String>, glob: Option<&str>) -> Result<Vec<FileCandidate>> {
	let search_path = normalize_search_path(path)?;
	let metadata = std::fs::metadata(&search_path).map_err(|e| Error::from_reason(format!("Path not found: {e}")))?;
	if metadata.is_file() {
		let display_path = search_path.file_name().and_then(|n| n.to_str()).map_or_else(|| search_path.to_string_lossy().into_owned(), |s| s.to_string());
		return Ok(vec![FileCandidate { absolute_path: search_path, display_path }]);
	}
	if !metadata.is_dir() { return Err(Error::from_reason(format!("Search path must be a file or directory: {}", search_path.display()))); }
	let glob_set = glob_util::try_compile_glob(glob, false)?;
	let mentions_node_modules = glob.is_some_and(|v| v.contains("node_modules"));
	let walker = WalkBuilder::new(&search_path).hidden(true).git_ignore(true).git_global(true).git_exclude(true).build();
	let mut files = Vec::new();
	for entry in walker {
		let entry = match entry { Ok(e) => e, Err(_) => continue };
		if !entry.file_type().is_some_and(|ft| ft.is_file()) { continue; }
		let abs = entry.path().to_path_buf();
		let relative = abs.strip_prefix(&search_path).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| abs.to_string_lossy().into_owned());
		if !mentions_node_modules && relative.contains("node_modules") { continue; }
		if let Some(ref gs) = glob_set { if !gs.is_match(&relative) { continue; } }
		files.push(FileCandidate { absolute_path: abs, display_path: relative });
	}
	files.sort_by(|a, b| a.display_path.cmp(&b.display_path));
	Ok(files)
}

fn compile_pattern(pattern: &str, selector: Option<&str>, strictness: &MatchStrictness, lang: SupportLang) -> Result<Pattern> {
	let mut compiled = if let Some(sel) = selector.map(str::trim).filter(|s| !s.is_empty()) { Pattern::contextual(pattern, sel, lang) } else { Pattern::try_new(pattern, lang) }
		.map_err(|e| Error::from_reason(format!("Invalid pattern: {e}")))?;
	compiled.strictness = strictness.clone();
	Ok(compiled)
}

fn apply_edits(content: &str, edits: &[Edit<String>]) -> Result<String> {
	let mut sorted: Vec<&Edit<String>> = edits.iter().collect();
	sorted.sort_by_key(|e| e.position);
	let mut prev_end = 0usize;
	for edit in &sorted { if edit.position < prev_end { return Err(Error::from_reason("Overlapping replacements detected".to_string())); } prev_end = edit.position.saturating_add(edit.deleted_length); }
	let mut output = content.to_string();
	for edit in sorted.into_iter().rev() {
		let start = edit.position; let end = edit.position.saturating_add(edit.deleted_length);
		if end > output.len() || start > end { return Err(Error::from_reason("Computed edit range is out of bounds".to_string())); }
		let replacement = String::from_utf8(edit.inserted_text.clone()).map_err(|e| Error::from_reason(format!("Replacement text is not valid UTF-8: {e}")))?;
		output.replace_range(start..end, &replacement);
	}
	Ok(output)
}

fn normalize_pattern_list(patterns: Option<Vec<String>>) -> Result<Vec<String>> {
	let mut normalized = Vec::new(); let mut seen = BTreeSet::new();
	for raw in patterns.unwrap_or_default() { let p = raw.trim(); if !p.is_empty() && seen.insert(p.to_string()) { normalized.push(p.to_string()); } }
	if normalized.is_empty() { return Err(Error::from_reason("`patterns` is required and must include at least one non-empty pattern".to_string())); }
	Ok(normalized)
}

fn normalize_rewrite_map(rewrites: Option<HashMap<String, String>>) -> Result<Vec<(String, String)>> {
	let mut normalized = Vec::new();
	for (p, r) in rewrites.unwrap_or_default() { if p.is_empty() { return Err(Error::from_reason("`rewrites` keys must be non-empty".to_string())); } normalized.push((p, r)); }
	if normalized.is_empty() { return Err(Error::from_reason("`rewrites` is required".to_string())); }
	normalized.sort_by(|l, r| l.0.cmp(&r.0)); Ok(normalized)
}

struct CompiledFindPattern { pattern: String, compiled_by_lang: HashMap<String, Pattern>, compile_errors_by_lang: HashMap<String, String> }
struct ResolvedCandidate { candidate: FileCandidate, language: Option<SupportLang>, language_error: Option<String> }

fn resolve_candidates_for_find(candidates: Vec<FileCandidate>, lang: Option<&str>) -> Result<(Vec<ResolvedCandidate>, HashMap<String, SupportLang>)> {
	let mut resolved = Vec::with_capacity(candidates.len()); let mut languages = HashMap::new();
	for candidate in candidates {
		match resolve_language(lang, &candidate.absolute_path) {
			Ok(language) => { languages.entry(language.canonical_name().to_string()).or_insert(language); resolved.push(ResolvedCandidate { candidate, language: Some(language), language_error: None }); },
			Err(err) => resolved.push(ResolvedCandidate { candidate, language: None, language_error: Some(err.to_string()) }),
		}
	}
	Ok((resolved, languages))
}

fn compile_find_patterns(patterns: &[String], languages: &HashMap<String, SupportLang>, selector: Option<&str>, strictness: &MatchStrictness) -> Result<Vec<CompiledFindPattern>> {
	let mut compiled = Vec::with_capacity(patterns.len());
	for pattern in patterns {
		let mut by_lang = HashMap::with_capacity(languages.len()); let mut errors = HashMap::new();
		for (key, &lang) in languages { match compile_pattern(pattern, selector, strictness, lang) { Ok(p) => { by_lang.insert(key.clone(), p); }, Err(e) => { errors.insert(key.clone(), e.to_string()); } } }
		compiled.push(CompiledFindPattern { pattern: pattern.clone(), compiled_by_lang: by_lang, compile_errors_by_lang: errors });
	}
	Ok(compiled)
}

#[napi(js_name = "astGrep")]
pub fn ast_grep(options: AstFindOptions) -> Result<AstFindResult> {
	let AstFindOptions { patterns, lang, path, glob, selector, strictness, limit, offset, include_meta, context: _ } = options;
	let normalized_limit = limit.unwrap_or(DEFAULT_FIND_LIMIT).max(1);
	let normalized_offset = offset.unwrap_or(0);
	let patterns = normalize_pattern_list(patterns)?;
	let strictness = parse_strictness(strictness.as_deref())?;
	let include_meta = include_meta.unwrap_or(false);
	let lang_str = lang.as_deref().map(str::trim).filter(|v| !v.is_empty());
	let candidates: Vec<_> = collect_candidates(path, glob.as_deref())?.into_iter().filter(|c| is_supported_file(&c.absolute_path, lang_str)).collect();
	let (resolved_candidates, languages) = resolve_candidates_for_find(candidates, lang_str)?;
	let compiled_patterns = compile_find_patterns(&patterns, &languages, selector.as_deref(), &strictness)?;
	let files_searched = to_u32(resolved_candidates.len());
	let mut all_matches = Vec::new(); let mut parse_errors = Vec::new(); let mut total_matches = 0u32; let mut files_with_matches = BTreeSet::new();
	for resolved in resolved_candidates {
		let ResolvedCandidate { candidate, language, language_error } = resolved;
		if let Some(error) = language_error.as_deref() { for c in &compiled_patterns { parse_errors.push(format!("{}: {}: {error}", c.pattern, candidate.display_path)); } continue; }
		let Some(language) = language else { continue };
		let lang_key = language.canonical_name();
		let source = match std::fs::read_to_string(&candidate.absolute_path) { Ok(s) => s, Err(e) => { for c in &compiled_patterns { parse_errors.push(format!("{}: {}: {e}", c.pattern, candidate.display_path)); } continue; } };
		let mut runnable: Vec<(&str, &Pattern)> = Vec::new();
		for c in &compiled_patterns {
			if let Some(e) = c.compile_errors_by_lang.get(lang_key) { parse_errors.push(format!("{}: {}: {e}", c.pattern, candidate.display_path)); continue; }
			if let Some(p) = c.compiled_by_lang.get(lang_key) { runnable.push((c.pattern.as_str(), p)); }
		}
		if runnable.is_empty() { continue; }
		let ast = language.ast_grep(source);
		if ast.root().dfs().any(|node| node.is_error()) { parse_errors.push(format!("{}: parse error (syntax tree contains error nodes)", candidate.display_path)); }
		for (_, pattern) in runnable {
			for matched in ast.root().find_all(pattern.clone()) {
				total_matches = total_matches.saturating_add(1);
				let range = matched.range(); let start = matched.start_pos(); let end = matched.end_pos();
				let meta_variables = if include_meta { Some(HashMap::<String, String>::from(matched.get_env().clone())) } else { None };
				all_matches.push(AstFindMatch { path: candidate.display_path.clone(), text: matched.text().into_owned(), byte_start: to_u32(range.start), byte_end: to_u32(range.end), start_line: to_u32(start.line().saturating_add(1)), start_column: to_u32(start.column(matched.get_node()).saturating_add(1)), end_line: to_u32(end.line().saturating_add(1)), end_column: to_u32(end.column(matched.get_node()).saturating_add(1)), meta_variables });
				files_with_matches.insert(candidate.display_path.clone());
			}
		}
	}
	all_matches.sort_by(|l, r| l.path.cmp(&r.path).then(l.start_line.cmp(&r.start_line)).then(l.start_column.cmp(&r.start_column)));
	let visible: Vec<_> = all_matches.into_iter().skip(normalized_offset as usize).collect();
	let limit_reached = visible.len() > normalized_limit as usize;
	let matches: Vec<_> = visible.into_iter().take(normalized_limit as usize).collect();
	Ok(AstFindResult { matches, total_matches, files_with_matches: to_u32(files_with_matches.len()), files_searched, limit_reached, parse_errors: (!parse_errors.is_empty()).then_some(parse_errors) })
}

#[napi(js_name = "astEdit")]
pub fn ast_edit(options: AstReplaceOptions) -> Result<AstReplaceResult> {
	let AstReplaceOptions { rewrites, lang, path, glob, selector, strictness, dry_run, max_replacements, max_files, fail_on_parse_error } = options;
	let rewrite_rules = normalize_rewrite_map(rewrites)?;
	let strictness = parse_strictness(strictness.as_deref())?;
	let dry_run = dry_run.unwrap_or(true); let max_replacements = max_replacements.unwrap_or(u32::MAX).max(1); let max_files = max_files.unwrap_or(u32::MAX).max(1); let fail_on_parse_error = fail_on_parse_error.unwrap_or(false);
	let lang_str = lang.as_deref().map(str::trim).filter(|v| !v.is_empty());
	let candidates: Vec<_> = collect_candidates(path, glob.as_deref())?.into_iter().filter(|c| is_supported_file(&c.absolute_path, lang_str)).collect();
	let effective_lang = if let Some(l) = lang_str { l.to_string() } else { infer_single_replace_lang(&candidates)? };
	let language = resolve_supported_lang(&effective_lang)?;
	let mut parse_errors = Vec::new(); let mut compiled_rules = Vec::new();
	for (pattern, rewrite) in rewrite_rules {
		match compile_pattern(&pattern, selector.as_deref(), &strictness, language) { Ok(c) => compiled_rules.push((pattern, rewrite, c)), Err(e) => { if fail_on_parse_error { return Err(e); } parse_errors.push(format!("{pattern}: {e}")); } }
	}
	if compiled_rules.is_empty() { return Ok(AstReplaceResult { file_changes: vec![], total_replacements: 0, files_touched: 0, files_searched: to_u32(candidates.len()), applied: !dry_run, limit_reached: false, parse_errors: (!parse_errors.is_empty()).then_some(parse_errors), changes: vec![] }); }
	let mut changes = Vec::new(); let mut file_counts: BTreeMap<String, u32> = BTreeMap::new(); let mut files_touched = 0u32; let mut limit_reached = false;
	for candidate in &candidates {
		let source = match std::fs::read_to_string(&candidate.absolute_path) { Ok(s) => s, Err(e) => { if fail_on_parse_error { return Err(Error::from_reason(format!("{}: {e}", candidate.display_path))); } parse_errors.push(format!("{}: {e}", candidate.display_path)); continue; } };
		let ast = language.ast_grep(&source);
		if ast.root().dfs().any(|n| n.is_error()) { let msg = format!("{}: parse error (syntax tree contains error nodes)", candidate.display_path); if fail_on_parse_error { return Err(Error::from_reason(msg)); } parse_errors.push(msg); continue; }
		let mut file_changes = Vec::new(); let mut reached_max = false;
		'patterns: for (_pat, rewrite, compiled) in &compiled_rules {
			for matched in ast.root().find_all(compiled.clone()) {
				if changes.len() + file_changes.len() >= max_replacements as usize { limit_reached = true; reached_max = true; break 'patterns; }
				let edit = matched.replace_by(rewrite.as_str()); let range = matched.range(); let start = matched.start_pos(); let end = matched.end_pos();
				let after = String::from_utf8(edit.inserted_text.clone()).map_err(|e| Error::from_reason(format!("{}: replacement not valid UTF-8: {e}", candidate.display_path)))?;
				file_changes.push(PendingFileChange { change: AstReplaceChange { path: candidate.display_path.clone(), before: matched.text().into_owned(), after, byte_start: to_u32(range.start), byte_end: to_u32(range.end), deleted_length: to_u32(edit.deleted_length), start_line: to_u32(start.line().saturating_add(1)), start_column: to_u32(start.column(matched.get_node()).saturating_add(1)), end_line: to_u32(end.line().saturating_add(1)), end_column: to_u32(end.column(matched.get_node()).saturating_add(1)) }, edit });
			}
		}
		if file_changes.is_empty() { if reached_max { break; } continue; }
		if files_touched >= max_files { limit_reached = true; break; }
		files_touched = files_touched.saturating_add(1);
		file_counts.insert(candidate.display_path.clone(), to_u32(file_changes.len()));
		if !dry_run {
			let edits: Vec<Edit<String>> = file_changes.iter().map(|e| Edit { position: e.edit.position, deleted_length: e.edit.deleted_length, inserted_text: e.edit.inserted_text.clone() }).collect();
			let output = apply_edits(&source, &edits)?;
			if output != source { std::fs::write(&candidate.absolute_path, output).map_err(|e| Error::from_reason(format!("Failed to write {}: {e}", candidate.display_path)))?; }
		}
		changes.extend(file_changes.into_iter().map(|e| e.change));
		if reached_max { break; }
	}
	let file_changes: Vec<_> = file_counts.into_iter().map(|(p, c)| AstReplaceFileChange { path: p, count: c }).collect();
	Ok(AstReplaceResult { file_changes, total_replacements: to_u32(changes.len()), files_touched, files_searched: to_u32(candidates.len()), applied: !dry_run, limit_reached, parse_errors: (!parse_errors.is_empty()).then_some(parse_errors), changes })
}

#[cfg(test)]
mod tests {
	use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
	use super::*;
	struct TempTree { root: PathBuf }
	impl Drop for TempTree { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }
	fn make_temp_tree() -> TempTree {
		let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
		let root = std::env::temp_dir().join(format!("gsd-ast-test-{unique}"));
		fs::create_dir_all(root.join("nested")).unwrap();
		fs::write(root.join("a.ts"), "const a = 1;\n").unwrap();
		fs::write(root.join("nested").join("b.ts"), "const b = 2;\n").unwrap();
		TempTree { root }
	}
	#[test]
	fn resolves_supported_language_aliases() {
		assert_eq!(resolve_supported_lang("ts").ok(), Some(SupportLang::TypeScript));
		assert_eq!(resolve_supported_lang("rs").ok(), Some(SupportLang::Rust));
		assert!(resolve_supported_lang("brainfuck").is_err());
	}
	#[test]
	fn applies_non_overlapping_edits() {
		let edits = vec![Edit::<String> { position: 6, deleted_length: 6, inserted_text: b"value".to_vec() }, Edit::<String> { position: 15, deleted_length: 2, inserted_text: b"42".to_vec() }];
		assert_eq!(apply_edits("const answer = 41;", &edits).unwrap(), "const value = 42;");
	}
	#[test]
	fn rejects_overlapping_edits() {
		let edits = vec![Edit::<String> { position: 1, deleted_length: 3, inserted_text: b"x".to_vec() }, Edit::<String> { position: 2, deleted_length: 1, inserted_text: b"y".to_vec() }];
		assert!(apply_edits("abcdef", &edits).is_err());
	}
	#[test]
	fn collect_candidates_finds_files() {
		let tree = make_temp_tree();
		let candidates = collect_candidates(Some(tree.root.to_string_lossy().into_owned()), None).unwrap();
		let paths: Vec<_> = candidates.iter().map(|f| f.display_path.as_str()).collect();
		assert!(paths.contains(&"a.ts") && paths.contains(&"nested/b.ts"));
	}
	#[test]
	fn infers_single_replace_lang() {
		let tree = make_temp_tree();
		let candidates = collect_candidates(Some(tree.root.to_string_lossy().into_owned()), Some("**/*.ts")).unwrap();
		assert_eq!(infer_single_replace_lang(&candidates).unwrap(), "typescript");
	}
	#[test]
	fn rejects_mixed_replace_lang() {
		let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
		let root = std::env::temp_dir().join(format!("gsd-ast-mixed-{unique}"));
		fs::create_dir_all(&root).unwrap();
		fs::write(root.join("a.ts"), "const a = 1;\n").unwrap();
		fs::write(root.join("b.rs"), "fn main() {}\n").unwrap();
		let candidates = collect_candidates(Some(root.to_string_lossy().into_owned()), None).unwrap();
		assert!(infer_single_replace_lang(&candidates).unwrap_err().to_string().contains("multiple languages"));
		let _ = fs::remove_dir_all(&root);
	}
}
