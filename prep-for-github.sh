#!/bin/sh
# Pre-upload checklist: verify node_modules, .env, dist, editor junk are ignored
# Run this before pushing to GitHub (chmod +x prep-for-github.sh && ./prep-for-github.sh)

echo "Verifying .gitignore exclusions..."

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Not a git repository. Initialize with: git init"
  exit 0
fi

for p in node_modules .env .env.local dist; do
  if git check-ignore -v "$p" 2>/dev/null; then
    echo "  [OK] $p is ignored"
  else
    echo "  [!!] $p is NOT ignored - add to .gitignore"
  fi
done

echo ""
echo "Removing any accidentally tracked paths from index..."
git rm -r --cached node_modules 2>/dev/null || true
git rm --cached .env 2>/dev/null || true
git rm --cached .env.local 2>/dev/null || true
git rm -r --cached dist 2>/dev/null || true
echo "  Done. Run 'git status' to see changes."
