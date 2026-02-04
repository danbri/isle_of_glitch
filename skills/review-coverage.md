# Review Agent: Coverage

Single task: Identify untested code paths.

## Prompt

```
Review this codebase for test coverage gaps:

1. List all public functions/methods
2. Check which have corresponding tests
3. Find error handling paths without tests
4. Find edge cases not covered
5. Identify dead code (unreachable paths)

Output:
- Coverage percentage estimate
- Priority list of what to test next
- Suggested test cases for gaps
```

## CLI by language

### JavaScript/TypeScript
```bash
npx c8 --reporter=text npm test
npx c8 --reporter=html npm test  # visual report
```

### Python
```bash
pytest --cov=. --cov-report=term-missing
coverage html  # visual report
```

### Rust
```bash
cargo tarpaulin --out Html
```

### Go
```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Quick check (no tools)

```bash
# Find functions
grep -rn "^func \|^def \|^function \|export function" ./src

# Find test files
find . -name "*_test.*" -o -name "*.test.*" -o -name "test_*"

# Compare counts
echo "Functions: $(grep -rc "^func \|^def \|^function " ./src | awk -F: '{sum+=$2}END{print sum}')"
echo "Test files: $(find . -name "*test*" -type f | wc -l)"
```
