#Requires -Version 7.0
<#
.SYNOPSIS
    Verify that a deployment package under ../../deployments/ still matches the working
    tree, byte for byte, and carries no secret or development file.

.DESCRIPTION
    A package is a hand-copied snapshot of the repo. Nothing re-cuts it when the tree
    moves on, so a package silently goes stale the moment a shipped file is committed.
    This script answers one question: is the package on disk still exactly this tree?

    Four checks, all of which must pass:

      1. FORWARD   every file in the package is byte-identical to the tree (MD5)
      2. REVERSE   every file the allowlist says should ship IS in the package
      3. HYGIENE   no secret or dev file reached the package
      4. COMMIT    the tree is clean, and its HEAD matches the commit DEPLOY.md names

    The REVERSE check is the one that matters most and the one a plain diff misses: a
    file ADDED to the tree after the package was cut is invisible to a forward-only
    comparison, and ships as a 404.

    ⚠️ What ships is defined in package-allowlist.ps1, NOT here. build-package.ps1
    reads the same file, which is what stops a package being built to one definition
    and checked against another. Change what ships there and nowhere else.

    It is an allowlist and never a denylist: docs-and-tools/ holds kata-api-key.txt,
    so a denylist with one missing entry publishes a live API key.

    Runtime: PowerShell 7+. No network, no writes: this script only reads.

.PARAMETER PackageDir
    The package to verify. Default: the newest dated folder under ../../deployments/.

.PARAMETER RepoRoot
    The working tree to compare against. Default: the repo root, one level up from
    this script's docs-and-tools/ home.

.PARAMETER Quiet
    Print only the verdict lines, not the per-file detail on failure.

.EXAMPLE
    pwsh -File docs-and-tools/verify-package.ps1
    Verify the newest package against the current tree.

.EXAMPLE
    pwsh -File docs-and-tools/verify-package.ps1 -PackageDir ../../deployments/2026-09-07
    Verify one specific package.

.OUTPUTS
    Exit code 0 if every check passed, 1 if any failed.
#>
[CmdletBinding()]
param(
    [string] $PackageDir,
    [string] $RepoRoot,
    [switch] $Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================================
# The allowlist lives in ONE place, shared with build-package.ps1. That shared
# file is what stops a package being BUILT to one definition and CHECKED against
# another. Change what ships there, never here.
# ============================================================================
. (Join-Path $PSScriptRoot 'package-allowlist.ps1')

function Resolve-Dir([string] $p, [string] $what) {
    if (-not (Test-Path -LiteralPath $p)) { throw "$what not found: $p" }
    (Resolve-Path -LiteralPath $p).Path
}

if (-not $RepoRoot) { $RepoRoot = Join-Path $PSScriptRoot '..' }
$RepoRoot = Resolve-Dir $RepoRoot 'Repo root'

if (-not $PackageDir) {
    $deployments = Join-Path $RepoRoot '..' '..' 'deployments'
    if (-not (Test-Path -LiteralPath $deployments)) { throw "No deployments/ folder at $deployments" }
    $newest = Get-ChildItem -LiteralPath $deployments -Directory |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $newest) { throw "No package folders under $deployments" }
    $PackageDir = $newest.FullName
}
$PackageDir = Resolve-Dir $PackageDir 'Package'

function Get-RelPaths([string] $root) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force |
        ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/') }
}

function Get-Md5Map([string] $root, [string[]] $rels) {
    $m = @{}
    foreach ($r in $rels) {
        $f = Join-Path $root ($r -replace '/', [IO.Path]::DirectorySeparatorChar)
        $m[$r] = (Get-FileHash -LiteralPath $f -Algorithm MD5).Hash
    }
    $m
}

$sep = '-' * 72
Write-Host $sep
Write-Host "verify-package"
Write-Host "  tree    : $RepoRoot"
Write-Host "  package : $PackageDir"
Write-Host $sep

$problems = [System.Collections.Generic.List[string]]::new()

# ---- what the tree says should ship, and what the package actually holds ----
$treeAll  = Get-RelPaths $RepoRoot
$treeShip = @($treeAll | Where-Object { Test-Ships $_ } | Sort-Object)
$pkgAll   = @(Get-RelPaths $PackageDir | Sort-Object)
$pkgFiles = @($pkgAll | Where-Object { $_ -notin $PackageOnlyFiles })

# ---- 1 + 2. forward and reverse ----
$extra   = @($pkgFiles | Where-Object { $_ -notin $treeShip })
$missing = @($treeShip | Where-Object { $_ -notin $pkgFiles })
foreach ($e in $extra)   { $problems.Add("EXTRA in package, not shippable : $e") }
foreach ($m in $missing) { $problems.Add("MISSING from package            : $m") }

$common  = @($pkgFiles | Where-Object { $_ -in $treeShip })
$pkgMd5  = Get-Md5Map $PackageDir $common
$treeMd5 = Get-Md5Map $RepoRoot   $common
$drift   = @($common | Where-Object { $pkgMd5[$_] -ne $treeMd5[$_] })
foreach ($d in $drift) { $problems.Add("DRIFTED (package != tree)       : $d") }

$fwd = ($drift.Count -eq 0 -and $extra.Count -eq 0)
$rev = ($missing.Count -eq 0)
Write-Host ("  [{0}] FORWARD  {1} file(s) compared, {2} drifted, {3} extra" -f
    $(if ($fwd) { 'PASS' } else { 'FAIL' }), $common.Count, $drift.Count, $extra.Count)
Write-Host ("  [{0}] REVERSE  {1} shippable file(s) in tree, {2} missing from package" -f
    $(if ($rev) { 'PASS' } else { 'FAIL' }), $treeShip.Count, $missing.Count)

# ---- 3. hygiene ----
# @() matters: a function whose pipeline yields nothing unrolls to $null, and
# $null.Count throws under StrictMode. Wrap the CALL, not the variable.
$hits = @(Get-HygieneHits $pkgAll)
foreach ($h in $hits) { $problems.Add("SECRET/DEV file in package      : $h") }
Write-Host ("  [{0}] HYGIENE  {1} secret/dev file(s) in package" -f
    $(if ($hits.Count -eq 0) { 'PASS' } else { 'FAIL' }), $hits.Count)

# ---- 4. commit provenance ----
$commitOk = $true
Push-Location $RepoRoot
try {
    $head  = (git rev-parse --short HEAD 2>$null)
    $dirty = @(git status --porcelain 2>$null)
    $deploy = Join-Path $PackageDir 'DEPLOY.md'
    $claimed = $null
    if (Test-Path -LiteralPath $deploy) {
        $m = [regex]::Match((Get-Content -LiteralPath $deploy -Raw), 'commit\s+\*\*`([0-9a-f]{7,40})`\*\*')
        if ($m.Success) { $claimed = $m.Groups[1].Value }
    }
    if ($dirty.Count -gt 0) {
        $problems.Add("WORKING TREE DIRTY              : $($dirty.Count) file(s) — the package cannot be reproduced from a commit")
        $commitOk = $false
    }
    $note = ''
    if (-not $claimed) {
        $problems.Add("DEPLOY.md names no build commit — cannot check provenance")
        $commitOk = $false
    } elseif ($head -notlike "$claimed*" -and $claimed -notlike "$head*") {
        # HEAD having moved is NOT staleness on its own. Commits that touch only
        # docs-and-tools/, _test/ or a README change nothing the package contains.
        # What matters is whether any SHIPPABLE file changed since the build commit.
        $since = @(git diff --name-only "$claimed..HEAD" 2>$null)
        if ($LASTEXITCODE -ne 0) {
            $problems.Add("COMMIT UNKNOWN                  : DEPLOY.md names $claimed, which this repo does not have")
            $commitOk = $false
        } else {
            $shippedSince = @($since | Where-Object { Test-Ships $_ })
            if ($shippedSince.Count -gt 0) {
                foreach ($f in $shippedSince) {
                    $problems.Add("CHANGED SINCE BUILD (ships)     : $f")
                }
                $commitOk = $false
            } else {
                $note = " — HEAD moved $($since.Count) file(s) since, none shipped"
            }
        }
    }
    Write-Host ("  [{0}] COMMIT   HEAD {1}, DEPLOY.md says {2}, {3} uncommitted change(s){4}" -f
        $(if ($commitOk) { 'PASS' } else { 'FAIL' }), $head, ($claimed ?? '—'), $dirty.Count, $note)
} finally { Pop-Location }

# ---- informational: duplication, the thing the 2026-09-07 hoist removed ----
# @() matters: Group-Object yields nothing when no blob repeats, and under StrictMode
# $null.Count throws rather than returning 0.
$byHash = @($pkgMd5.GetEnumerator() | Group-Object Value | Where-Object { $_.Count -gt 1 })
$bytes  = ($pkgFiles | ForEach-Object {
    (Get-Item -LiteralPath (Join-Path $PackageDir ($_ -replace '/', [IO.Path]::DirectorySeparatorChar))).Length
} | Measure-Object -Sum).Sum
Write-Host $sep
Write-Host ("  package  : {0} content file(s), {1:N0} bytes" -f $pkgFiles.Count, $bytes)
Write-Host ("  duplicate: {0} blob(s) appearing more than once" -f $byHash.Count)
if ($byHash.Count -gt 0 -and -not $Quiet) {
    foreach ($g in $byHash) { Write-Host ("             {0}" -f ($g.Group.Name -join ', ')) }
}

Write-Host $sep
if ($problems.Count -eq 0) {
    Write-Host "VERDICT: PASS — the package is exactly this tree." -ForegroundColor Green
    exit 0
}
Write-Host ("VERDICT: FAIL — {0} problem(s)." -f $problems.Count) -ForegroundColor Red
if (-not $Quiet) { foreach ($p in $problems) { Write-Host "  $p" } }
exit 1
