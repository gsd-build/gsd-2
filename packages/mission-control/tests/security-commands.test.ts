import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const commandsRs = readFileSync(
  resolve(import.meta.dir, "../src-tauri/src/commands.rs"),
  "utf-8"
);

describe("B2: open_external URL scheme allowlist", () => {
  it("checks for https:// and http:// before opening URL", () => {
    expect(commandsRs).toContain('!url.starts_with("https://")');
    expect(commandsRs).toContain('!url.starts_with("http://")');
  });

  it("returns false for rejected URLs", () => {
    expect(commandsRs).toContain("return false");
  });
});

describe("B2: reveal_path absolute path validation", () => {
  it("uses std::path::Path::new to parse the path", () => {
    expect(commandsRs).toContain("std::path::Path::new(&path)");
  });

  it("checks is_absolute() before revealing", () => {
    expect(commandsRs).toContain("!p.is_absolute()");
  });
});

describe("B3: credential key allowlist", () => {
  it("defines ALLOWED_CREDENTIAL_KEYS constant", () => {
    expect(commandsRs).toContain("const ALLOWED_CREDENTIAL_KEYS: &[&str]");
  });

  it("includes anthropic_api_key in allowlist", () => {
    expect(commandsRs).toContain('"anthropic_api_key"');
  });

  it("includes github_token in allowlist", () => {
    expect(commandsRs).toContain('"github_token"');
  });

  it("includes openrouter_api_key in allowlist", () => {
    expect(commandsRs).toContain('"openrouter_api_key"');
  });

  it("includes claude_access_token in allowlist", () => {
    expect(commandsRs).toContain('"claude_access_token"');
  });

  it("includes claude_refresh_token in allowlist", () => {
    expect(commandsRs).toContain('"claude_refresh_token"');
  });

  it("validates key against allowlist in get_credential", () => {
    // The check must appear BEFORE keyring::Entry::new
    const getAllowlistIdx = commandsRs.indexOf("ALLOWED_CREDENTIAL_KEYS.contains");
    const getEntryIdx = commandsRs.indexOf('keyring::Entry::new(KEYCHAIN_SERVICE, &key)');
    expect(getAllowlistIdx).toBeGreaterThan(-1);
    expect(getAllowlistIdx).toBeLessThan(getEntryIdx);
  });
});
