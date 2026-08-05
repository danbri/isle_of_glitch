# Review Agent: Performance

Single task: Find performance bottlenecks and inefficiencies.

## Prompt

```
Review this code for performance issues:

1. N+1 queries
2. Missing indexes (DB)
3. Unbounded loops/recursion
4. Memory leaks
5. Blocking I/O in async context
6. Repeated expensive computations
7. Large allocations in hot paths

For each finding:
- Location
- Impact estimate
- Suggested optimization
```

## Grep patterns

```bash
# N+1 queries
grep -rn "for.*{" -A5 ./src | grep -B5 "query\|SELECT\|find("

# Blocking in async
grep -rn "std::fs::\|std::thread::sleep" ./src  # Rust
grep -rn "readFileSync\|writeFileSync" ./src    # JS

# Unbounded
grep -rn "while true\|loop {" ./src

# String concat in loop
grep -rn "for.*+=" ./src

# Repeated regex compilation
grep -rn "new RegExp\|re.compile\|Regex::new" ./src
```

## Common fixes

| Issue | Fix |
|-------|-----|
| N+1 queries | Batch/join queries |
| Repeated computation | Memoize/cache |
| String concat in loop | Use StringBuilder/Vec |
| Blocking I/O | Use async variants |
| Large allocs | Pool/reuse buffers |
| Regex in loop | Compile once, reuse |
| JSON parse in loop | Parse once, index |

## Quick profiling

```bash
# Node.js
node --prof app.js
node --prof-process isolate-*.log

# Python
python -m cProfile -s cumtime app.py

# Rust
cargo flamegraph
```

## Red flags

```javascript
// Bad: N+1
for (const user of users) {
  const posts = await db.query('SELECT * FROM posts WHERE user_id = ?', user.id)
}

// Good: batch
const posts = await db.query('SELECT * FROM posts WHERE user_id IN (?)', userIds)
```

```rust
// Bad: alloc in hot path
fn process(items: &[Item]) {
    for item in items {
        let s = format!("Processing {}", item.name); // alloc per iteration
    }
}
```
