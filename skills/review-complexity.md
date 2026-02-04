# Review Agent: Complexity

Single task: Find overly complex code that needs simplification.

## Prompt

```
Review this code for complexity issues:

1. Functions over 50 lines
2. Cyclomatic complexity > 10
3. Deeply nested code (>3 levels)
4. Functions with >5 parameters
5. God objects/classes
6. Long parameter lists
7. Complex conditionals

For each finding:
- Location
- Complexity metric
- Suggested refactoring
```

## CLI tools

```bash
# JavaScript
npx eslint --rule 'complexity: [error, 10]' ./src

# Python
pip install radon
radon cc ./src -a -s  # cyclomatic complexity
radon mi ./src -s     # maintainability index

# Rust
cargo clippy -- -W clippy::cognitive_complexity
```

## Grep patterns

```bash
# Long functions (rough)
awk '/^func |^def |^function /{start=NR} /^}$|^end$/{if(NR-start>50)print FILENAME":"start}' ./src/*

# Deep nesting
grep -rn "        if\|        for\|        while" ./src  # 8+ spaces

# Many parameters
grep -rn "function.*,.*,.*,.*,.*," ./src
```

## Thresholds

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Lines per function | <30 | 30-50 | >50 |
| Cyclomatic complexity | <10 | 10-20 | >20 |
| Nesting depth | <3 | 3-4 | >4 |
| Parameters | <4 | 4-5 | >5 |
| Dependencies per file | <10 | 10-15 | >15 |
