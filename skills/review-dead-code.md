# Review Agent: Dead Code

Single task: Find unused code that can be deleted.

## Prompt

```
Review this codebase for dead code:

1. Unused functions/methods
2. Unused variables
3. Unreachable code paths
4. Unused imports/dependencies
5. Commented-out code
6. Unused files
7. Feature flags never enabled

For each finding:
- Location
- Last git commit touching it
- Confidence level
- Safe to delete? (Y/N/Maybe)
```

## CLI tools

```bash
# JavaScript - unused exports
npx ts-prune ./src
npx unimported

# Python
pip install vulture
vulture ./src

# Rust
cargo udeps  # unused dependencies
# +warn(dead_code) in rustc

# General - unused files
npx depcheck
```

## Grep patterns

```bash
# Commented code blocks
grep -rn "^[[:space:]]*//.*function\|^[[:space:]]*#.*def " ./src

# TODO/FIXME that are stale
grep -rn "TODO\|FIXME\|HACK\|XXX" ./src

# Find function, check if called
func_name="myFunction"
echo "Defined:"; grep -rn "function $func_name\|def $func_name\|fn $func_name" ./src
echo "Called:"; grep -rn "$func_name(" ./src | grep -v "function\|def \|fn "
```

## Git archaeology

```bash
# Files not touched in 1 year
find ./src -type f -mtime +365

# Functions added but never modified
git log --diff-filter=A --name-only --pretty=format: -- "*.js" | sort | uniq

# Dead branches
git branch -a --merged | grep -v main
```

## Confidence levels

| Signal | Confidence |
|--------|------------|
| No references in codebase | High |
| Only referenced in tests | Medium |
| Referenced in comments only | High |
| Behind disabled feature flag | Medium |
| No git commits in 2+ years | Medium |
