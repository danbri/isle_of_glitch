# Review Agent: Rust Crates

Single task: Find existing crates instead of rolling your own.

## Prompt

```
Review this Rust code for reinvented wheels:

1. List all custom implementations of common functionality
2. Search crates.io for existing solutions
3. Compare: maintenance, downloads, API quality
4. Recommend crate or keep custom (with reason)

Check especially:
- Parsing (serde, nom, pest, logos)
- CLI (clap, argh)
- Async (tokio, async-std)
- HTTP (reqwest, hyper, ureq)
- Error handling (thiserror, anyhow, eyre)
- Logging (tracing, log, env_logger)
- Config (config, figment)
- Serialization (serde_json, toml, ron)
```

## CLI search

```bash
# Search crates.io
cargo search <keyword>

# Check crate info
cargo info <crate_name>

# Popular crates by category
open https://crates.io/categories
```

## Common replacements

| Rolling your own... | Use instead |
|---------------------|-------------|
| Argument parsing | `clap` |
| JSON handling | `serde_json` |
| HTTP client | `reqwest` or `ureq` |
| Regex | `regex` |
| Random | `rand` |
| Time/dates | `chrono` or `time` |
| UUIDs | `uuid` |
| Hashing | `sha2`, `blake3` |
| Base64 | `base64` |
| Path handling | `camino` |
| Temp files | `tempfile` |
| Retries | `backoff` |
| Rate limiting | `governor` |

## Red flags

```rust
// Don't write your own:
fn parse_json(s: &str) -> ... // use serde_json
fn http_get(url: &str) -> ... // use reqwest
fn hash_password(p: &str) -> ... // use argon2/bcrypt
fn generate_uuid() -> ... // use uuid
```
