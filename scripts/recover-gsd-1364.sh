#!/usr/bin/env bash
# recover-gsd-1364.sh — Recovery script for issue #1364 (Linux / macOS)
#
# For Windows use the PowerShell equivalent:
#   powershell -ExecutionPolicy Bypass -File scripts\recover-gsd-1364.ps1 [-DryRun]
#
# CRITICAL DATA-LOSS BUG: GSD versions 2.30.0–2.35.x unconditionally added
# ".gsd" to .gitignore via ensureGitignore(), causing git to report all
# tracked .gsd/ files as deleted. Fixed in v2.36.0 (PR #1367).
# Three residual vectors remain on v2.36.0–v2.38.0 — see PR #1635 for details.
#
# This script:
#   1. Detects whether the repo was affected
#   2. Finds the last clean commit before the damage
#   3. Restores all deleted .gsd/ files from that commit
#   4. Removes the bad ".gsd" line from .gitignore (if .gsd/ is tracked)
#   5. Prints a ready-to-commit summary
#
# Usage:
#   bash scripts/recover-gsd-1364.sh [--dry-run]
#
# Options:
#   --dry-run   Show what would be done without making any changes
#
# Requirements: git >= 2.x, bash >= 4.x

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Args ─────────────────────────────────────────────────────────────────────

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
section() { echo -e "\n${BOLD}$*${RESET}"; }

die() {
  error "$*"
  exit 1
}

# Run or print-only depending on --dry-run
run() {
  if $DRY_RUN; then
    echo -e "  ${YELLOW}(dry-run)${RESET} $*"
  else
    eval "$*"
  fi
}

# ─── Preflight ────────────────────────────────────────────────────────────────

section "── Preflight ───────────────────────────────────────────────────────"

# Must be run from a git repo root
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  die "Not inside a git repository. Run this from your project root."
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
info "Repo root: $REPO_ROOT"

if $DRY_RUN; then
  warn "DRY-RUN mode — no changes will be made."
fi

# ─── Step 1: Check if .gsd/ exists ────────────────────────────────────────────

section "── Step 1: Detect .gsd/ directory ────────────────────────────────────"

GSD_DIR="$REPO_ROOT/.gsd"
GSD_IS_SYMLINK=false

if [[ ! -e "$GSD_DIR" ]]; then
  ok ".gsd/ does not exist in this repo — not affected."
  exit 0
fi

if [[ -L "$GSD_DIR" ]]; then
  # Scenario C: migration succeeded (symlink in place) but git index was never
  # cleaned — tracked .gsd/* files still appear as deleted through the symlink.
  GSD_IS_SYMLINK=true
  warn ".gsd/ is a symlink — checking for stale git index entries (Scenario C)..."
else
  info ".gsd/ is a real directory (Scenario A/B)."
fi

# ─── Step 2: Check if .gsd is in .gitignore ───────────────────────────────────

section "── Step 2: Check .gitignore for .gsd entry ────────────────────────────"

GITIGNORE="$REPO_ROOT/.gitignore"

if [[ ! -f "$GITIGNORE" ]] && ! $GSD_IS_SYMLINK; then
  ok ".gitignore does not exist — not affected."
  exit 0
fi

# Look for a bare ".gsd" line (not a comment, not a sub-path like .gsd/)
GSD_IGNORE_LINE=""
if [[ -f "$GITIGNORE" ]]; then
  while IFS= read -r line; do
    trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    if [[ "$trimmed" == ".gsd" ]] && [[ "${trimmed:0:1}" != "#" ]]; then
      GSD_IGNORE_LINE="$trimmed"
      break
    fi
  done < "$GITIGNORE"
fi

if $GSD_IS_SYMLINK; then
  # Symlink layout: .gsd SHOULD be ignored (it's external state).
  # Missing = needs adding. Present = correct.
  if [[ -z "$GSD_IGNORE_LINE" ]]; then
    warn '".gsd" missing from .gitignore — will add (migration complete, .gsd/ is external).'
  else
    ok '".gsd" already in .gitignore — correct for external-state layout.'
  fi
else
  # Real-directory layout: .gsd should NOT be ignored.
  if [[ -z "$GSD_IGNORE_LINE" ]]; then
    ok '".gsd" not found in .gitignore — .gitignore not affected.'
  else
    warn '".gsd" found in .gitignore — this is the bad pattern from #1364.'
  fi
fi

# ─── Step 3: Find deleted .gsd/ tracked files ─────────────────────────────────

section "── Step 3: Find deleted .gsd/ files ───────────────────────────────────"

# Files showing as deleted in the working tree (tracked in index but missing)
DELETED_FILES="$(git ls-files --deleted -- '.gsd/*' 2>/dev/null || true)"

# Files tracked in HEAD right now
TRACKED_IN_HEAD="$(git ls-tree -r --name-only HEAD -- '.gsd/' 2>/dev/null || true)"

if $GSD_IS_SYMLINK; then
  # Scenario C: migration succeeded. Files are safe via symlink.
  # Only index entries can be stale — no need to scan commit history.
  if [[ -z "$TRACKED_IN_HEAD" ]] && [[ -z "$DELETED_FILES" ]]; then
    ok "No stale index entries found — symlink layout is healthy."
    if [[ -z "$GSD_IGNORE_LINE" ]]; then
      info "Add .gsd to .gitignore manually to complete the migration."
    fi
    exit 0
  fi
  INDEX_COUNT="$(echo "${TRACKED_IN_HEAD:-$DELETED_FILES}" | wc -l | tr -d ' ')"
  warn "Scenario C: ${INDEX_COUNT} .gsd/ file(s) tracked in git index but inaccessible through symlink."
  info "Files are safe in external storage — only the git index needs cleaning."
else
  # Files deleted via a committed git rm --cached (Scenario B)
  DELETED_FROM_HISTORY="$(git log --all --diff-filter=D --name-only --format="" -- '.gsd/*' 2>/dev/null \
    | grep '^\.gsd' | sort -u || true)"

  if [[ -z "$TRACKED_IN_HEAD" ]] && [[ -z "$DELETED_FILES" ]] && [[ -z "$DELETED_FROM_HISTORY" ]]; then
    ok "No .gsd/ files tracked in this repo — not affected by #1364."
    if [[ -n "$GSD_IGNORE_LINE" ]]; then
      warn '".gsd" is still in .gitignore but there is nothing to restore.'
    fi
    exit 0
  fi

  if [[ -n "$TRACKED_IN_HEAD" ]]; then
    TRACKED_COUNT="$(echo "$TRACKED_IN_HEAD" | wc -l | tr -d ' ')"
    info "Scenario A: ${TRACKED_COUNT} .gsd/ files still tracked in HEAD."
  elif [[ -n "$DELETED_FROM_HISTORY" ]]; then
    DELETED_HIST_COUNT="$(echo "$DELETED_FROM_HISTORY" | wc -l | tr -d ' ')"
    warn "Scenario B: ${DELETED_HIST_COUNT} .gsd/ file(s) deleted in a committed change:"
    echo "$DELETED_FROM_HISTORY" | head -20 | while IFS= read -r f; do echo "    - $f"; done
    if (( DELETED_HIST_COUNT > 20 )); then echo "    ... and $((DELETED_HIST_COUNT - 20)) more"; fi
  fi

  if [[ -n "$DELETED_FILES" ]]; then
    DELETED_COUNT="$(echo "$DELETED_FILES" | wc -l | tr -d ' ')"
    warn "${DELETED_COUNT} .gsd/ file(s) missing from working tree:"
    echo "$DELETED_FILES" | head -20 | while IFS= read -r f; do echo "    - $f"; done
    if (( DELETED_COUNT > 20 )); then echo "    ... and $((DELETED_COUNT - 20)) more"; fi
  fi

  if [[ -n "$TRACKED_IN_HEAD" ]] && [[ -z "$DELETED_FILES" ]]; then
    if [[ -z "$GSD_IGNORE_LINE" ]]; then
      ok "No action needed — .gsd/ is tracked in HEAD and .gitignore is clean."
      exit 0
    fi
    info ".gsd/ is tracked in HEAD and working tree is clean — only .gitignore needs fixing."
  fi
fi

# ─── Step 4: Find the last clean commit (Scenario A/B only) ───────────────────

section "── Step 4: Find last clean commit ──────────────────────────────────────"

DAMAGE_COMMIT=""
CLEAN_COMMIT=""
RESTORABLE=""

if $GSD_IS_SYMLINK; then
  info "Scenario C: symlink layout — skipping commit history scan (no file restore needed)."
else
  # Find the commit where ".gsd" was first added to .gitignore
  # by walking the log and finding the first commit where .gitignore contained ".gsd"
  info "Scanning git log to find when .gsd was added to .gitignore..."

  # Strategy 1: find the first commit that added ".gsd" to .gitignore
  while IFS= read -r sha; do
    content="$(git show "${sha}:.gitignore" 2>/dev/null || true)"
    if echo "$content" | grep -qx '\.gsd' 2>/dev/null; then
      DAMAGE_COMMIT="$sha"
      break
    fi
  done < <(git log --format="%H" -- .gitignore)

  # Strategy 2: if .gsd files were committed as deleted, find that commit
  if [[ -z "$DAMAGE_COMMIT" ]] && [[ -n "${DELETED_FROM_HISTORY:-}" ]]; then
    info "Searching for the commit that deleted .gsd/ files from the index..."
    DAMAGE_COMMIT="$(git log --all --diff-filter=D --format="%H" -- '.gsd/*' 2>/dev/null | head -1 || true)"
  fi

  if [[ -z "$DAMAGE_COMMIT" ]]; then
    warn "Could not pinpoint the damage commit — falling back to HEAD."
    CLEAN_COMMIT="HEAD"
  else
    info "Damage commit: $DAMAGE_COMMIT ($(git log --format='%s' -1 "$DAMAGE_COMMIT"))"
    CLEAN_COMMIT="${DAMAGE_COMMIT}^"
    CLEAN_MSG="$(git log --format='%s' -1 "$CLEAN_COMMIT" 2>/dev/null || echo "unknown")"
    info "Restoring from: $CLEAN_COMMIT — $CLEAN_MSG"
  fi

  # Verify the clean commit actually has .gsd/ files
  RESTORABLE="$(git ls-tree -r --name-only "$CLEAN_COMMIT" -- '.gsd/' 2>/dev/null || true)"
  if [[ -z "$RESTORABLE" ]]; then
    die "No .gsd/ files found in restore point $CLEAN_COMMIT — cannot recover. Check git log manually."
  fi

  RESTORABLE_COUNT="$(echo "$RESTORABLE" | wc -l | tr -d ' ')"
  ok "Restore point has ${RESTORABLE_COUNT} .gsd/ files available."
fi

# ─── Step 5: Clean index (Scenario C) or restore deleted files (Scenario A/B) ─

if $GSD_IS_SYMLINK; then
  section "── Step 5: Clean stale git index entries ───────────────────────────────"

  info "Running: git rm -r --cached --ignore-unmatch .gsd/ ..."
  run "git rm -r --cached --ignore-unmatch .gsd"
  if ! $DRY_RUN; then
    STILL_STALE="$(git ls-files --deleted -- '.gsd/*' 2>/dev/null || true)"
    if [[ -z "$STILL_STALE" ]]; then
      ok "Git index cleaned — no stale .gsd/ entries remain."
    else
      warn "$(echo "$STILL_STALE" | wc -l | tr -d ' ') stale entr(ies) still present — may need manual cleanup."
    fi
  fi
else
  section "── Step 5: Restore deleted .gsd/ files ────────────────────────────────"

  NEEDS_RESTORE=false
  [[ -n "$DELETED_FILES" ]] && NEEDS_RESTORE=true
  [[ -n "${DELETED_FROM_HISTORY:-}" ]] && [[ -z "$TRACKED_IN_HEAD" ]] && NEEDS_RESTORE=true

  if ! $NEEDS_RESTORE; then
    ok "No deleted files to restore — skipping."
  else
    info "Restoring .gsd/ files from $CLEAN_COMMIT..."
    run "git checkout \"$CLEAN_COMMIT\" -- .gsd/"
    if ! $DRY_RUN; then
      STILL_MISSING="$(git ls-files --deleted -- '.gsd/*' 2>/dev/null || true)"
      if [[ -z "$STILL_MISSING" ]]; then
        ok "All .gsd/ files restored successfully."
      else
        MISS_COUNT="$(echo "$STILL_MISSING" | wc -l | tr -d ' ')"
        warn "${MISS_COUNT} file(s) still missing after restore — may need manual recovery:"
        echo "$STILL_MISSING" | head -10 | while IFS= read -r f; do echo "    - $f"; done
      fi
    fi
  fi
fi

# ─── Step 6: Fix .gitignore ───────────────────────────────────────────────────

section "── Step 6: Fix .gitignore ───────────────────────────────────────────────"

if $GSD_IS_SYMLINK; then
  # Scenario C: .gsd IS external — it should be in .gitignore.  Add if missing.
  if [[ -z "$GSD_IGNORE_LINE" ]]; then
    info 'Adding ".gsd" to .gitignore (migration complete — .gsd/ is external state)...'
    if $DRY_RUN; then
      echo -e "  ${YELLOW}(dry-run)${RESET} Would append: .gsd"
    else
      printf '\n# GSD external state (symlink — added by recover-gsd-1364)\n.gsd\n' >> "$GITIGNORE"
      ok '".gsd" added to .gitignore.'
    fi
  else
    ok '".gsd" already in .gitignore — correct for external-state layout.'
  fi
else
  # Scenario A/B: .gsd is a real tracked directory — remove the bad ignore line.
  if [[ -z "$GSD_IGNORE_LINE" ]]; then
    ok '".gsd" not in .gitignore — nothing to fix.'
  else
    info 'Removing bare ".gsd" line from .gitignore...'
    if $DRY_RUN; then
      echo -e "  ${YELLOW}(dry-run)${RESET} Would remove line: .gsd"
    else
      # Remove the exact line ".gsd" (not comments, not .gsd/ subdirs)
      # Use a temp file for portability (no sed -i on all platforms)
      TMP="$(mktemp)"
      grep -v '^\.gsd$' "$GITIGNORE" > "$TMP" || true
      mv "$TMP" "$GITIGNORE"
      ok '".gsd" line removed from .gitignore.'
    fi
  fi
fi

# ─── Step 7: Stage changes ────────────────────────────────────────────────────

section "── Step 7: Stage recovery changes ──────────────────────────────────────"

if ! $DRY_RUN; then
  CHANGED="$(git status --short -- '.gsd/' .gitignore 2>/dev/null || true)"
  if [[ -z "$CHANGED" ]]; then
    ok "No staged changes — working tree was already clean."
  else
    if $GSD_IS_SYMLINK; then
      # Scenario C: the git rm --cached already staged the index cleanup.
      # Only stage .gitignore — adding .gsd/ would fail (now gitignored).
      git add .gitignore 2>/dev/null || true
    else
      git add .gsd/ .gitignore 2>/dev/null || true
    fi
    STAGED_COUNT="$(git diff --cached --name-only -- '.gsd/' .gitignore | wc -l | tr -d ' ')"
    ok "${STAGED_COUNT} file(s) staged and ready to commit."
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

section "── Summary ──────────────────────────────────────────────────────────────"

if $DRY_RUN; then
  echo -e "${YELLOW}Dry-run complete. Re-run without --dry-run to apply changes.${RESET}"
else
  FINAL_STAGED="$(git diff --cached --name-only -- '.gsd/' .gitignore 2>/dev/null | wc -l | tr -d ' ')"
  if (( FINAL_STAGED > 0 )); then
    echo -e "${GREEN}Recovery complete. Commit with:${RESET}"
    echo ""
    if $GSD_IS_SYMLINK; then
      echo "  git commit -m \"fix: clean stale .gsd/ index entries after external-state migration\""
    else
      echo "  git commit -m \"fix: restore .gsd/ files deleted by #1364 regression\""
    fi
    echo ""
    echo "Staged files:"
    git diff --cached --name-only -- '.gsd/' .gitignore | head -20 | while IFS= read -r f; do
      echo "  + $f"
    done
    TOTAL_STAGED="$(git diff --cached --name-only -- '.gsd/' .gitignore | wc -l | tr -d ' ')"
    if (( TOTAL_STAGED > 20 )); then
      echo "  ... and $((TOTAL_STAGED - 20)) more"
    fi
  else
    ok "Repo is healthy — no recovery needed."
  fi
fi
