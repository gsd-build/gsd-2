//! Vendored and extended language definitions for ast-grep integration.
//!
//! Originally derived from `ast-grep-language` v0.39.9, stripped of
//! serde/ignore machinery, and extended with additional languages.

mod parsers;

use std::{borrow::Cow, collections::HashMap, fmt, path::Path};

use ast_grep_core::{
	Doc, Language, Node,
	matcher::{KindMatcher, Pattern, PatternBuilder, PatternError},
	meta_var::MetaVariable,
	tree_sitter::{LanguageExt, StrDoc, TSLanguage, TSRange},
};

/// Implements a stub language (no expando / `pre_process_pattern` needed).
/// Use when the language grammar accepts `$VAR` as valid identifiers.
macro_rules! impl_lang {
	($lang:ident, $func:ident) => {
		#[derive(Clone, Copy, Debug)]
		pub struct $lang;
		impl Language for $lang {
			fn kind_to_id(&self, kind: &str) -> u16 {
				self.get_ts_language().id_for_node_kind(kind, true)
			}

			fn field_to_id(&self, field: &str) -> Option<u16> {
				self
					.get_ts_language()
					.field_id_for_name(field)
					.map(|f| f.get())
			}

			fn build_pattern(&self, builder: &PatternBuilder) -> Result<Pattern, PatternError> {
				builder.build(|src| StrDoc::try_new(src, *self))
			}
		}
		impl LanguageExt for $lang {
			fn get_ts_language(&self) -> TSLanguage {
				parsers::$func().into()
			}
		}
	};
}

fn pre_process_pattern(expando: char, query: &str) -> Cow<'_, str> {
	let mut ret = Vec::with_capacity(query.len());
	let mut dollar_count = 0;
	for c in query.chars() {
		if c == '$' {
			dollar_count += 1;
			continue;
		}
		let need_replace = matches!(c, 'A'..='Z' | '_') || dollar_count == 3;
		let sigil = if need_replace { expando } else { '$' };
		ret.extend(std::iter::repeat_n(sigil, dollar_count));
		dollar_count = 0;
		ret.push(c);
	}
	let sigil = if dollar_count == 3 { expando } else { '$' };
	ret.extend(std::iter::repeat_n(sigil, dollar_count));
	Cow::Owned(ret.into_iter().collect())
}

/// Implements a language with `expando_char` / `pre_process_pattern`.
/// Use when the language does NOT accept `$` as a valid identifier character.
macro_rules! impl_lang_expando {
	($lang:ident, $func:ident, $char:expr) => {
		#[derive(Clone, Copy, Debug)]
		pub struct $lang;
		impl Language for $lang {
			fn kind_to_id(&self, kind: &str) -> u16 {
				self.get_ts_language().id_for_node_kind(kind, true)
			}

			fn field_to_id(&self, field: &str) -> Option<u16> {
				self
					.get_ts_language()
					.field_id_for_name(field)
					.map(|f| f.get())
			}

			fn expando_char(&self) -> char {
				$char
			}

			fn pre_process_pattern<'q>(&self, query: &'q str) -> Cow<'q, str> {
				pre_process_pattern(self.expando_char(), query)
			}

			fn build_pattern(&self, builder: &PatternBuilder) -> Result<Pattern, PatternError> {
				builder.build(|src| StrDoc::try_new(src, *self))
			}
		}
		impl LanguageExt for $lang {
			fn get_ts_language(&self) -> TSLanguage {
				parsers::$func().into()
			}
		}
	};
}

// ── Customized languages with expando_char ──────────────────────────────

impl_lang_expando!(C, language_c, '𐀀');
impl_lang_expando!(Cpp, language_cpp, '𐀀');
impl_lang_expando!(CSharp, language_c_sharp, 'µ');
impl_lang_expando!(Css, language_css, '_');
impl_lang_expando!(Elixir, language_elixir, 'µ');
impl_lang_expando!(Go, language_go, 'µ');
impl_lang_expando!(Haskell, language_haskell, 'µ');
impl_lang_expando!(Hcl, language_hcl, 'µ');
impl_lang_expando!(Kotlin, language_kotlin, 'µ');
impl_lang_expando!(Nix, language_nix, '_');
impl_lang_expando!(Php, language_php, 'µ');
impl_lang_expando!(Python, language_python, 'µ');
impl_lang_expando!(Ruby, language_ruby, 'µ');
impl_lang_expando!(Rust, language_rust, 'µ');
impl_lang_expando!(Swift, language_swift, 'µ');

// New expando languages
impl_lang_expando!(Make, language_make, 'µ');
impl_lang_expando!(ObjC, language_objc, '𐀀');
impl_lang_expando!(Starlark, language_starlark, 'µ');
impl_lang_expando!(Odin, language_odin, 'µ');
impl_lang_expando!(Julia, language_julia, 'µ');
impl_lang_expando!(Verilog, language_verilog, 'µ');
impl_lang_expando!(Zig, language_zig, 'µ');

// ── Stub languages ($ accepted in grammar) ──────────────────────────────

impl_lang!(Bash, language_bash);
impl_lang!(Java, language_java);
impl_lang!(JavaScript, language_javascript);
impl_lang!(Json, language_json);
impl_lang!(Lua, language_lua);
impl_lang!(Scala, language_scala);
impl_lang!(Solidity, language_solidity);
impl_lang!(Tsx, language_tsx);
impl_lang!(TypeScript, language_typescript);
impl_lang!(Yaml, language_yaml);

// New stub languages
impl_lang!(Markdown, language_markdown);
impl_lang!(Toml, language_toml);
impl_lang!(Diff, language_diff);
impl_lang!(Xml, language_xml);
impl_lang!(Regex, language_regex);

// ── Html (custom implementation with injection support) ──────────────────

#[derive(Clone, Copy, Debug)]
pub struct Html;

impl Language for Html {
	fn expando_char(&self) -> char {
		'z'
	}

	fn pre_process_pattern<'q>(&self, query: &'q str) -> Cow<'q, str> {
		pre_process_pattern(self.expando_char(), query)
	}

	fn kind_to_id(&self, kind: &str) -> u16 {
		self.get_ts_language().id_for_node_kind(kind, true)
	}

	fn field_to_id(&self, field: &str) -> Option<u16> {
		self
			.get_ts_language()
			.field_id_for_name(field)
			.map(|f| f.get())
	}

	fn build_pattern(&self, builder: &PatternBuilder) -> Result<Pattern, PatternError> {
		builder.build(|src| StrDoc::try_new(src, *self))
	}
}

impl LanguageExt for Html {
	fn get_ts_language(&self) -> TSLanguage {
		parsers::language_html()
	}

	fn injectable_languages(&self) -> Option<&'static [&'static str]> {
		Some(&["css", "js", "ts", "tsx", "scss", "less", "stylus", "coffee"])
	}

	fn extract_injections<L: LanguageExt>(
		&self,
		root: Node<StrDoc<L>>,
	) -> HashMap<String, Vec<TSRange>> {
		let lang = root.lang();
		let mut map = HashMap::new();
		let matcher = KindMatcher::new("script_element", lang.clone());
		for script in root.find_all(matcher) {
			let injected = find_html_lang(&script).unwrap_or_else(|| "js".into());
			let content = script.children().find(|c| c.kind() == "raw_text");
			if let Some(content) = content {
				map.entry(injected)
					.or_insert_with(Vec::new)
					.push(node_to_range(&content));
			}
		}
		let matcher = KindMatcher::new("style_element", lang.clone());
		for style in root.find_all(matcher) {
			let injected = find_html_lang(&style).unwrap_or_else(|| "css".into());
			let content = style.children().find(|c| c.kind() == "raw_text");
			if let Some(content) = content {
				map.entry(injected)
					.or_insert_with(Vec::new)
					.push(node_to_range(&content));
			}
		}
		map
	}
}

fn find_html_lang<D: Doc>(node: &Node<D>) -> Option<String> {
	let html = node.lang();
	let attr_matcher = KindMatcher::new("attribute", html.clone());
	let name_matcher = KindMatcher::new("attribute_name", html.clone());
	let val_matcher = KindMatcher::new("attribute_value", html.clone());
	node.find_all(attr_matcher).find_map(|attr| {
		let name = attr.find(&name_matcher)?;
		if name.text() != "lang" {
			return None;
		}
		let val = attr.find(&val_matcher)?;
		Some(val.text().to_string())
	})
}

fn node_to_range<D: Doc>(node: &Node<D>) -> TSRange {
	let r = node.range();
	let start = node.start_pos();
	let sp = start.byte_point();
	let sp = tree_sitter::Point::new(sp.0, sp.1);
	let end = node.end_pos();
	let ep = end.byte_point();
	let ep = tree_sitter::Point::new(ep.0, ep.1);
	TSRange { start_byte: r.start, end_byte: r.end, start_point: sp, end_point: ep }
}

// ── SupportLang enum ────────────────────────────────────────────────────

/// All supported languages for ast-grep structural search/replace.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SupportLang {
	Bash,
	C,
	Cpp,
	CSharp,
	Css,
	Diff,
	Elixir,
	Go,
	Haskell,
	Hcl,
	Html,
	Java,
	JavaScript,
	Json,
	Julia,
	Kotlin,
	Lua,
	Make,
	Markdown,
	Nix,
	ObjC,
	Odin,
	Php,
	Python,
	Regex,
	Ruby,
	Rust,
	Scala,
	Solidity,
	Starlark,
	Swift,
	Toml,
	Tsx,
	TypeScript,
	Verilog,
	Xml,
	Yaml,
	Zig,
}

impl SupportLang {
	pub const fn all_langs() -> &'static [Self] {
		use SupportLang::*;
		&[
			Bash, C, Cpp, CSharp, Css, Diff, Elixir, Go, Haskell, Hcl, Html, Java, JavaScript, Json,
			Julia, Kotlin, Lua, Make, Markdown, Nix, ObjC, Odin, Php, Python, Regex, Ruby, Rust,
			Scala, Solidity, Starlark, Swift, Toml, Tsx, TypeScript, Verilog, Xml, Yaml, Zig,
		]
	}

	/// The canonical lowercase name used as a stable key in alias maps,
	/// file-type inference results, and error messages.
	pub const fn canonical_name(self) -> &'static str {
		match self {
			Self::Bash => "bash",
			Self::C => "c",
			Self::Cpp => "cpp",
			Self::CSharp => "csharp",
			Self::Css => "css",
			Self::Diff => "diff",
			Self::Elixir => "elixir",
			Self::Go => "go",
			Self::Haskell => "haskell",
			Self::Hcl => "hcl",
			Self::Html => "html",
			Self::Java => "java",
			Self::JavaScript => "javascript",
			Self::Json => "json",
			Self::Julia => "julia",
			Self::Kotlin => "kotlin",
			Self::Lua => "lua",
			Self::Make => "make",
			Self::Markdown => "markdown",
			Self::Nix => "nix",
			Self::ObjC => "objc",
			Self::Odin => "odin",
			Self::Php => "php",
			Self::Python => "python",
			Self::Regex => "regex",
			Self::Ruby => "ruby",
			Self::Rust => "rust",
			Self::Scala => "scala",
			Self::Solidity => "solidity",
			Self::Starlark => "starlark",
			Self::Swift => "swift",
			Self::Toml => "toml",
			Self::Tsx => "tsx",
			Self::TypeScript => "typescript",
			Self::Verilog => "verilog",
			Self::Xml => "xml",
			Self::Yaml => "yaml",
			Self::Zig => "zig",
		}
	}
}

impl fmt::Display for SupportLang {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(f, "{self:?}")
	}
}

// ── Dispatch macro ──────────────────────────────────────────────────────

macro_rules! execute_lang_method {
	($me:path, $method:ident, $($pname:tt),*) => {
		use SupportLang as S;
		match $me {
			S::Bash => Bash.$method($($pname,)*),
			S::C => C.$method($($pname,)*),
			S::Cpp => Cpp.$method($($pname,)*),
			S::CSharp => CSharp.$method($($pname,)*),
			S::Css => Css.$method($($pname,)*),
			S::Diff => Diff.$method($($pname,)*),
			S::Elixir => Elixir.$method($($pname,)*),
			S::Go => Go.$method($($pname,)*),
			S::Haskell => Haskell.$method($($pname,)*),
			S::Hcl => Hcl.$method($($pname,)*),
			S::Html => Html.$method($($pname,)*),
			S::Java => Java.$method($($pname,)*),
			S::JavaScript => JavaScript.$method($($pname,)*),
			S::Json => Json.$method($($pname,)*),
			S::Julia => Julia.$method($($pname,)*),
			S::Kotlin => Kotlin.$method($($pname,)*),
			S::Lua => Lua.$method($($pname,)*),
			S::Make => Make.$method($($pname,)*),
			S::Markdown => Markdown.$method($($pname,)*),
			S::Nix => Nix.$method($($pname,)*),
			S::ObjC => ObjC.$method($($pname,)*),
			S::Odin => Odin.$method($($pname,)*),
			S::Php => Php.$method($($pname,)*),
			S::Python => Python.$method($($pname,)*),
			S::Regex => Regex.$method($($pname,)*),
			S::Ruby => Ruby.$method($($pname,)*),
			S::Rust => Rust.$method($($pname,)*),
			S::Scala => Scala.$method($($pname,)*),
			S::Solidity => Solidity.$method($($pname,)*),
			S::Starlark => Starlark.$method($($pname,)*),
			S::Swift => Swift.$method($($pname,)*),
			S::Toml => Toml.$method($($pname,)*),
			S::Tsx => Tsx.$method($($pname,)*),
			S::TypeScript => TypeScript.$method($($pname,)*),
			S::Verilog => Verilog.$method($($pname,)*),
			S::Xml => Xml.$method($($pname,)*),
			S::Yaml => Yaml.$method($($pname,)*),
			S::Zig => Zig.$method($($pname,)*),
		}
	};
}

macro_rules! impl_lang_method {
	($method:ident, ($($pname:tt: $ptype:ty),*) => $return_type:ty) => {
		#[inline]
		fn $method(&self, $($pname: $ptype),*) -> $return_type {
			execute_lang_method! { self, $method, $($pname),* }
		}
	};
}

impl Language for SupportLang {
	impl_lang_method!(kind_to_id, (kind: &str) => u16);

	impl_lang_method!(field_to_id, (field: &str) => Option<u16>);

	impl_lang_method!(meta_var_char, () => char);

	impl_lang_method!(expando_char, () => char);

	impl_lang_method!(extract_meta_var, (source: &str) => Option<MetaVariable>);

	impl_lang_method!(build_pattern, (builder: &PatternBuilder) => Result<Pattern, PatternError>);

	fn pre_process_pattern<'q>(&self, query: &'q str) -> Cow<'q, str> {
		execute_lang_method! { self, pre_process_pattern, query }
	}

	fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
		from_extension(path.as_ref())
	}
}

impl LanguageExt for SupportLang {
	impl_lang_method!(get_ts_language, () => TSLanguage);

	impl_lang_method!(injectable_languages, () => Option<&'static [&'static str]>);

	fn extract_injections<L: LanguageExt>(
		&self,
		root: Node<StrDoc<L>>,
	) -> HashMap<String, Vec<TSRange>> {
		match self {
			Self::Html => Html.extract_injections(root),
			_ => HashMap::new(),
		}
	}
}

// ── File extension mapping ──────────────────────────────────────────────

const fn extensions(lang: SupportLang) -> &'static [&'static str] {
	use SupportLang::*;
	match lang {
		Bash => {
			&["bash", "bats", "cgi", "command", "env", "fcgi", "ksh", "sh", "tmux", "tool", "zsh"]
		},
		C => &["c", "h"],
		Cpp => &["cc", "hpp", "cpp", "c++", "hh", "cxx", "cu", "ino"],
		CSharp => &["cs"],
		Css => &["css", "scss"],
		Diff => &["diff", "patch"],
		Elixir => &["ex", "exs"],
		Go => &["go"],
		Haskell => &["hs"],
		Hcl => &["hcl", "tf", "tfvars"],
		Html => &["html", "htm", "xhtml"],
		Java => &["java"],
		JavaScript => &["cjs", "js", "mjs", "jsx"],
		Json => &["json"],
		Julia => &["jl"],
		Kotlin => &["kt", "ktm", "kts"],
		Lua => &["lua"],
		Make => &["mk", "mak"],
		Markdown => &["md", "markdown", "mdx"],
		Nix => &["nix"],
		ObjC => &["m"],
		Odin => &["odin"],
		Php => &["php"],
		Python => &["py", "py3", "pyi", "bzl"],
		Regex => &[], // regex has no file extension
		Ruby => &["rb", "rbw", "gemspec"],
		Rust => &["rs"],
		Scala => &["scala", "sc", "sbt"],
		Solidity => &["sol"],
		Starlark => &["star", "bzl"],
		Swift => &["swift"],
		Toml => &["toml"],
		Tsx => &["tsx"],
		TypeScript => &["ts", "cts", "mts"],
		Verilog => &["v", "sv", "svh", "vh"],
		Xml => &["xml", "xsl", "xslt", "svg", "plist"],
		Yaml => &["yaml", "yml"],
		Zig => &["zig"],
	}
}

/// Guess language from file extension.
fn from_extension(path: &Path) -> Option<SupportLang> {
	let ext = path.extension()?.to_str()?;
	// Special cases: Makefile has no extension
	if ext.is_empty() {
		let name = path.file_name()?.to_str()?;
		return match name {
			"Makefile" | "makefile" | "GNUmakefile" => Some(SupportLang::Make),
			_ => None,
		};
	}
	SupportLang::all_langs()
		.iter()
		.copied()
		.find(|&l| extensions(l).contains(&ext))
}
