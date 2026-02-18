# Pre-upload checklist: verify node_modules, .env, dist, editor junk are ignored
# Run this before pushing to GitHub (requires git in PATH)

Write-Host "Verifying .gitignore exclusions..." -ForegroundColor Cyan

# Check if we're in a git repo
$gitRoot = git rev-parse --show-toplevel 2>$null
if (-not $gitRoot) {
    Write-Host "Not a git repository. Initialize with: git init" -ForegroundColor Yellow
    exit 0
}

# Verify paths are ignored
$paths = @("node_modules", ".env", ".env.local", "dist")
foreach ($p in $paths) {
    $result = git check-ignore -v $p 2>$null
    if ($result) {
        Write-Host "  [OK] $p is ignored" -ForegroundColor Green
    } else {
        Write-Host "  [!!] $p is NOT ignored - add to .gitignore" -ForegroundColor Red
    }
}

# Remove accidentally tracked paths (safe: --cached only unstages, does not delete files)
Write-Host "`nRemoving any accidentally tracked paths from index..." -ForegroundColor Cyan
git rm -r --cached node_modules 2>$null
git rm --cached .env 2>$null
git rm --cached .env.local 2>$null
git rm -r --cached dist 2>$null
Write-Host "  Done. Run 'git status' to see changes." -ForegroundColor Green
