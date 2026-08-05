# Review Agent: Error Handling

Single task: Find poor error handling patterns.

## Prompt

```
Review this code for error handling issues:

1. Swallowed exceptions (catch with no action)
2. Generic catches (catch Exception/Error)
3. Missing error handling on I/O, network, parse
4. Panics in library code (Rust)
5. Unclear error messages
6. No error context/chain
7. Inconsistent error types

For each finding:
- Location
- Risk level
- Suggested fix
```

## Grep patterns

```bash
# Swallowed errors (JS)
grep -rn "catch.*{\s*}" ./src
grep -rn "catch.*{$" -A1 ./src | grep -B1 "}"

# Empty catches (Python)
grep -rn "except:" ./src
grep -rn "except.*pass" ./src

# Unwrap/expect (Rust)
grep -rn "\.unwrap()\|\.expect(" ./src

# Ignored results
grep -rn "let _ =" ./src
```

## Anti-patterns

```javascript
// Bad: swallowed
try { risky() } catch (e) {}

// Bad: generic
try { risky() } catch (e) { console.log(e) }

// Good: specific handling
try { risky() } catch (e) {
  if (e instanceof NetworkError) retry()
  else throw new AppError('Context', { cause: e })
}
```

```rust
// Bad: panic in library
fn parse(s: &str) -> Value { serde_json::from_str(s).unwrap() }

// Good: propagate
fn parse(s: &str) -> Result<Value, ParseError> { ... }
```

## Checklist

- [ ] All I/O wrapped in error handling
- [ ] Network calls have timeout + retry logic
- [ ] Parse errors include input context
- [ ] Errors propagate with context chain
- [ ] User-facing errors are actionable
- [ ] Log errors include stack trace
