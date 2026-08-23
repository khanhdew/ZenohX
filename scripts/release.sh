#!/bin/bash

# ==============================================================================
# ZenohX Release Automation Script
#
# Usage:
#   npm run release:new -- patch    # e.g., 0.2.0 -> 0.2.1
#   npm run release:new -- minor    # e.g., 0.2.0 -> 0.3.0
#   npm run release:new -- major    # e.g., 0.2.0 -> 1.0.0
#   npm run release:new -- 1.0.0    # explicit version
#
# Automates:
#   1. Pre-flight checks (clean git state, main branch, duplicate tag detection)
#   2. Version bump in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
#   3. Lockfile regeneration (src-tauri/Cargo.lock)
#   4. Conventional commit changelog generation & insertion into CHANGELOG.md
#   5. Atomic git commit ("chore: release vX.Y.Z") and annotated git tag ("vX.Y.Z")
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

step() { printf '\n%b==>%b %s\n' "$BLUE" "$NC" "$1"; }
ok()   { printf '  %bok%b %s\n' "$GREEN" "$NC" "$1"; }
warn() { printf '  %bwarning%b %s\n' "$YELLOW" "$NC" "$1"; }
fail() { printf '  %berror%b %s\n' "$RED" "$NC" "$1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# ------------------------------------------------------------------------------
# 1. Verify required tools
# ------------------------------------------------------------------------------

for cmd in node cargo git; do
    command -v "$cmd" >/dev/null 2>&1 || fail "Required CLI tool not found: $cmd"
done

# ------------------------------------------------------------------------------
# 2. Parse arguments
# ------------------------------------------------------------------------------

if [ -z "${1:-}" ]; then
    printf '%bUsage:%b ./scripts/release.sh [major | minor | patch | x.y.z]\n\n' "$BOLD" "$NC"
    echo "Examples:"
    echo "  npm run release:new -- patch   # 0.2.0 -> 0.2.1"
    echo "  npm run release:new -- minor   # 0.2.0 -> 0.3.0"
    echo "  npm run release:new -- major   # 0.2.0 -> 1.0.0"
    echo "  npm run release:new -- 0.3.0   # explicit version"
    exit 1
fi

# ------------------------------------------------------------------------------
# 3. Compute new version
# ------------------------------------------------------------------------------

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$1" in
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    *)
        CLEAN_ARG="${1#v}"
        if [[ ! "$CLEAN_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
            fail "Invalid version format '$1'. Expected semver like '0.3.0' or '1.0.0-rc.1'."
        fi
        NEW_VERSION="$CLEAN_ARG"
        ;;
esac

printf '\n%b========================================%b\n' "$CYAN" "$NC"
printf '  %bZenohX Release Preparation%b\n' "$BOLD" "$NC"
printf '  Current Version : %b%s%b\n' "$DIM" "$CURRENT_VERSION" "$NC"
printf '  Target Version  : %b%s%b (v%s)\n' "$GREEN" "$NEW_VERSION" "$NC" "$NEW_VERSION"
printf '%b========================================%b\n' "$CYAN" "$NC"

# ------------------------------------------------------------------------------
# 4. Pre-flight checks
# ------------------------------------------------------------------------------

step "Running pre-flight checks"

if [[ -n $(git status --porcelain) ]]; then
    fail "Uncommitted changes detected in working tree. Commit or stash them first."
fi
ok "Working tree clean"

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
    warn "You are on branch '$CURRENT_BRANCH', not 'main'."
    read -p "  Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Release aborted."
        exit 0
    fi
else
    ok "On branch '$CURRENT_BRANCH'"
fi

TAG_NAME="v${NEW_VERSION}"
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    fail "Git tag '$TAG_NAME' already exists in repository."
fi
ok "Tag '$TAG_NAME' is available"

# ------------------------------------------------------------------------------
# 5. User Confirmation
# ------------------------------------------------------------------------------

read -p "Proceed with releasing v${NEW_VERSION}? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release aborted."
    exit 0
fi

# ------------------------------------------------------------------------------
# 6. Bump version across files
# ------------------------------------------------------------------------------

step "Updating project version numbers"

node -e "
const fs = require('fs');
const version = '${NEW_VERSION}';

// 1. package.json
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. src-tauri/tauri.conf.json
const tauriConfPath = 'src-tauri/tauri.conf.json';
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// 3. src-tauri/Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
let cargo = fs.readFileSync(cargoPath, 'utf-8');
cargo = cargo.replace(/^(version\s*=\s*)\"[^\"]*\"/m, \`\$1\"\${version}\"\`);
fs.writeFileSync(cargoPath, cargo);
"

ok "package.json -> ${NEW_VERSION}"
ok "src-tauri/tauri.conf.json -> ${NEW_VERSION}"
ok "src-tauri/Cargo.toml -> ${NEW_VERSION}"

# ------------------------------------------------------------------------------
# 7. Regenerate Cargo.lock
# ------------------------------------------------------------------------------

step "Regenerating Cargo.lock"
(cd src-tauri && cargo generate-lockfile --quiet)
ok "src-tauri/Cargo.lock updated"

# ------------------------------------------------------------------------------
# 8. Generate Changelog from Conventional Commits
# ------------------------------------------------------------------------------

step "Generating changelog entries"

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
    RANGE="${LAST_TAG}..HEAD"
    printf '  Parsing commits since %b%s%b\n' "$CYAN" "$LAST_TAG" "$NC"
else
    RANGE="HEAD"
    printf '  No previous tag found; parsing all commits in HEAD\n'
fi

TODAY=$(date +%Y-%m-%d)

CHANGELOG_ENTRY=$(node -e "
const { execSync } = require('child_process');
const fs = require('fs');

const range = '${RANGE}';
const version = 'v${NEW_VERSION}';
const today = '${TODAY}';

let log = '';
try {
    log = execSync('git log ' + range + ' --pretty=format:\"%s\" --reverse', { encoding: 'utf-8' });
} catch (e) {
    log = '';
}

const lines = log.split('\n').filter(Boolean);

const added = [];
const fixed = [];
const changed = [];
const maintenance = [];

const pattern = /^(feat|fix|refactor|perf|build|style|docs|test|chore)(\(.*?\))?\!?:\s*(.+)$/i;

for (const line of lines) {
    const m = line.match(pattern);
    if (!m) {
        // Fallback for non-conventional commit lines that aren't chore/release
        if (!line.toLowerCase().startsWith('release') && !line.toLowerCase().startsWith('merge')) {
            changed.push(line.trim());
        }
        continue;
    }
    const type = m[1].toLowerCase();
    const scope = m[2];
    const msg = m[3];
    const entry = scope ? '**' + scope.slice(1, -1) + ':** ' + msg : msg;

    switch (type) {
        case 'feat':
            added.push(entry);
            break;
        case 'fix':
            fixed.push(entry);
            break;
        case 'refactor':
        case 'perf':
        case 'style':
            changed.push(entry);
            break;
        case 'chore':
        case 'docs':
        case 'build':
        case 'test':
        case 'ci':
            maintenance.push(entry);
            break;
    }
}

let entry = '## [' + version + '] - ' + today;
let sections = [];

if (added.length) {
    sections.push('### 🚀 Added & Enhanced\n' + added.map(e => '- ' + e).join('\n'));
}
if (fixed.length) {
    sections.push('### 🐛 Fixed\n' + fixed.map(e => '- ' + e).join('\n'));
}
if (changed.length) {
    sections.push('### ⚡ Changed & Refactored\n' + changed.map(e => '- ' + e).join('\n'));
}
if (maintenance.length) {
    sections.push('### 🔧 Maintenance\n' + maintenance.map(e => '- ' + e).join('\n'));
}

if (sections.length) {
    entry += '\n\n' + sections.join('\n\n');
} else {
    entry += '\n\n- Maintenance and stability release.';
}

entry += '\n\n---';

// Insert into CHANGELOG.md
const changelogPath = 'CHANGELOG.md';
let changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '# 📜 Changelog\n\n';
const marker = '\n## [';
const idx = changelog.indexOf(marker);

if (idx !== -1) {
    const before = changelog.slice(0, idx);
    const after = changelog.slice(idx);
    fs.writeFileSync(changelogPath, before + '\n\n' + entry + after);
} else {
    fs.writeFileSync(changelogPath, changelog.trimEnd() + '\n\n' + entry + '\n');
}

process.stdout.write(entry);
")

ok "CHANGELOG.md updated"

echo ""
printf '%b--- Changelog Preview ---%b\n' "$DIM" "$NC"
echo "$CHANGELOG_ENTRY"
printf '%b--- End Preview ---%b\n\n' "$DIM" "$NC"

read -p "Does the changelog look good? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    warn "Release paused. You can edit CHANGELOG.md manually, then finish with:"
    echo "  git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md"
    echo "  git commit -m \"chore: release v${NEW_VERSION}\""
    echo "  git tag -a v${NEW_VERSION} -m \"Release v${NEW_VERSION}\""
    echo "  git push origin main --tags"
    exit 0
fi

# ------------------------------------------------------------------------------
# 9. Create Git Commit and Annotated Tag
# ------------------------------------------------------------------------------

step "Creating release commit and tag"

git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore: release v${NEW_VERSION}"
ok "Commit created: chore: release v${NEW_VERSION}"

git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
ok "Tag created: v${NEW_VERSION}"

# ------------------------------------------------------------------------------
# 10. Summary & Next Steps
# ------------------------------------------------------------------------------

printf '\n%b========================================%b\n' "$GREEN" "$NC"
printf '  %bSuccessfully prepared v%s%b\n' "$BOLD" "$NEW_VERSION" "$NC"
printf '%b========================================%b\n\n' "$GREEN" "$NC"

echo "Next steps:"
echo "  1. Inspect commit:  git show HEAD"
echo "  2. Trigger release: git push origin $CURRENT_BRANCH --tags"
echo ""
echo "Undo if needed:"
echo "  git tag -d v${NEW_VERSION} && git reset --soft HEAD~1"
echo ""
