#!/usr/bin/env bash
# Backfill gradient.png and update main_colors in the DB for all existing scraped sites.
#
# Usage:
#   bash backfill-colors.sh [--dry-run]
#
# Requirements:
#   python3 with Pillow + scikit-learn installed
#   (pip3 install --break-system-packages Pillow scikit-learn)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITES_DIR="$SCRIPT_DIR/data/websites"
PYTHON_SCRIPT="$SCRIPT_DIR/src/scraper/extract-colors.py"
DRY_RUN=false

for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

if [[ ! -f "$PYTHON_SCRIPT" ]]; then
  echo "ERROR: Python script not found: $PYTHON_SCRIPT"
  exit 1
fi

if [[ ! -d "$WEBSITES_DIR" ]]; then
  echo "ERROR: Websites directory not found: $WEBSITES_DIR"
  exit 1
fi

echo "=== NewToad Color Backfill ==="
echo "Websites dir: $WEBSITES_DIR"
echo "Dry run: $DRY_RUN"
echo ""

total=0
success=0
skipped=0
failed=0

for site_dir in "$WEBSITES_DIR"/*/; do
  domain="$(basename "$site_dir")"
  screenshot="$site_dir/screenshot.png"
  gradient="$site_dir/gradient.png"

  total=$((total + 1))

  if [[ ! -f "$screenshot" ]]; then
    echo "[$domain] No screenshot.png — skipping"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ -f "$gradient" && "$DRY_RUN" == "false" ]]; then
    # Still re-run to keep colors fresh / update DB; only skip if gradient exists and we want speed
    : # fall through
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[$domain] Would extract colors from $screenshot"
    skipped=$((skipped + 1))
    continue
  fi

  echo -n "[$domain] Extracting... "
  if colors="$(python3 "$PYTHON_SCRIPT" "$screenshot" --n-colors 10 2>/dev/null)"; then
    echo "OK: $(echo "$colors" | python3 -c 'import sys,json; c=json.load(sys.stdin); print(", ".join(c[:5]))')"
    success=$((success + 1))

    # Update the DB using a small inline Node script so we reuse the existing DB module
    node --input-type=module <<EOF 2>/dev/null || echo "  [warn] DB update skipped (run from project root with dotenv loaded)"
import { getDb } from '$SCRIPT_DIR/src/db.js';
const db = getDb();
const colors = JSON.stringify($colors);
const result = db.prepare("UPDATE companies SET main_colors = ? WHERE domain = ?").run(colors, '$domain');
if (result.changes > 0) {
  process.stderr.write('  DB updated (' + result.changes + ' row)\n');
} else {
  process.stderr.write('  Domain not in DB, gradient saved anyway\n');
}
EOF
  else
    echo "FAILED"
    failed=$((failed + 1))
  fi
done

echo ""
echo "=== Done: $success succeeded, $failed failed, $skipped skipped (of $total total) ==="
