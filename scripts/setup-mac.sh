#!/usr/bin/env bash
# One-command setup for running Day locally on a Mac:
#
#   curl -fsSL https://raw.githubusercontent.com/Rockslide9959/day-app/main/scripts/setup-mac.sh | bash
#
# Installs what's missing (Xcode command line tools for git, Node.js), clones
# the repo into ~/day-app (override with DAY_DIR=...), pulls in .env and
# .env.local, installs packages and starts the dev server. Safe to re-run.
#
# .env / .env.local hold secrets and are not in git, so copy them over from
# the other machine first. The script looks for them in the project folder,
# then in ~/Downloads (where AirDrop puts them). Because macOS hides files
# starting with a dot, they may also be named "env" and "env.local".

set -euo pipefail

# Everything runs inside main so bash reads the whole file before executing
# any of it; under `curl | bash`, commands that read stdin would otherwise
# swallow the rest of the script.

REPO_URL="https://github.com/Rockslide9959/day-app.git"
DAY_DIR="${DAY_DIR:-$HOME/day-app}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }

main() {
  [ "$(uname -s)" = "Darwin" ] || fail "This script is for macOS."

  step "Checking for git (Xcode command line tools)"
  if ! xcode-select -p >/dev/null 2>&1; then
    xcode-select --install || true
    fail "A window has opened to install the command line tools. Once it finishes, run this script again."
  fi
  echo "OK"

  # Next.js 16 needs Node 20.9 or newer.
  node_ok() {
    command -v node >/dev/null 2>&1 &&
      node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)'
  }

  step "Checking for Node.js"
  if ! node_ok; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing Node.js with Homebrew..."
      brew install node
    else
      echo "Installing Node.js LTS from nodejs.org (you'll be asked for your Mac password)..."
      pkg_name="$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | awk '/\.pkg$/ {print $2; exit}')"
      [ -n "$pkg_name" ] || fail "Couldn't find the Node.js installer. Install it from https://nodejs.org and run this script again."
      tmp_pkg="$(mktemp -d)/$pkg_name"
      curl -fL --progress-bar "https://nodejs.org/dist/latest-v24.x/$pkg_name" -o "$tmp_pkg"
      sudo installer -pkg "$tmp_pkg" -target /
      rm -f "$tmp_pkg"
      export PATH="/usr/local/bin:$PATH"
    fi
    node_ok || fail "Node.js still isn't available. Open a new Terminal window and run this script again."
  fi
  echo "Node $(node -v)"

  step "Getting the code into $DAY_DIR"
  if [ -d "$DAY_DIR/.git" ]; then
    git -C "$DAY_DIR" pull --ff-only
  else
    git clone "$REPO_URL" "$DAY_DIR"
  fi
  cd "$DAY_DIR"

  # Copies the first existing candidate to $1 unless $1 is already there.
  find_env_file() {
    local target="$1"; shift
    [ -f "$target" ] && return 0
    for candidate in "$@"; do
      if [ -f "$candidate" ]; then
        cp "$candidate" "$target"
        echo "Copied $candidate -> $target"
        return 0
      fi
    done
    return 1
  }

  step "Looking for .env and .env.local"
  missing=()
  find_env_file .env "$HOME/Downloads/.env" "$HOME/Downloads/env" "$HOME/Downloads/env.txt" || missing+=(".env")
  find_env_file .env.local "$HOME/Downloads/.env.local" "$HOME/Downloads/env.local" "$HOME/Downloads/env.local.txt" || missing+=(".env.local")

  step "Installing packages"
  npm ci || npm install

  if [ "${#missing[@]}" -gt 0 ]; then
    warn ""
    warn "Setup is done except for: ${missing[*]}"
    warn "Copy them from the Windows PC (same folder as package.json there)"
    warn "into $DAY_DIR or ~/Downloads, then run this script again."
    exit 1
  fi

  step "Starting Day at http://localhost:3000 (press Ctrl+C to stop)"
  (sleep 6 && open "http://localhost:3000") >/dev/null 2>&1 &
  exec npm run dev
}

main "$@"
