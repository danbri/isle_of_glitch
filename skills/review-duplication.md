# Review Agent: Duplication

Single task: Find duplicated code patterns.

## Prompt

```
Review this codebase for code duplication:

1. Find copy-pasted code blocks (3+ lines identical)
2. Find near-duplicates (same logic, different variable names)
3. Find repeated patterns that could be abstracted
4. Flag functions that do the same thing in different files

For each finding:
- Show both locations
- Suggest extraction/abstraction
- Estimate lines saved

Focus on actionable deduplication, not trivial matches.
```

## CLI (with jscpd)

```bash
# Install
npm install -g jscpd

# Run
jscpd --min-lines 3 --min-tokens 50 --reporters console ./src

# JSON output
jscpd --min-lines 3 --reporters json --output ./report ./src
```

## CLI (with fdupes for files)

```bash
fdupes -r ./src
```

## Grep patterns

```bash
# Find identical function signatures
grep -rn "function.*(" ./src | sort -t: -k3 | uniq -d -f2

# Find repeated error messages
grep -roh "Error:.*" ./src | sort | uniq -c | sort -rn | head -20
```
