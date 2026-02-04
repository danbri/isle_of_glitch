# Review Agent: Security

Single task: Find security vulnerabilities.

## Prompt

```
Review this code for security issues:

1. Input validation gaps (SQL injection, XSS, command injection)
2. Authentication/authorization flaws
3. Secrets in code (API keys, passwords)
4. Insecure dependencies
5. Cryptographic misuse
6. Path traversal vulnerabilities
7. SSRF potential

For each finding:
- Severity (Critical/High/Medium/Low)
- Location
- Attack vector
- Fix recommendation
```

## CLI tools

```bash
# Secrets detection
trufflehog filesystem ./
gitleaks detect --source=./

# Dependency audit
npm audit
pip-audit
cargo audit
```

## Grep patterns

```bash
# Hardcoded secrets
grep -rn "password\s*=\|api_key\s*=\|secret\s*=" --include="*.js" --include="*.py" --include="*.rs"

# SQL injection risks
grep -rn "execute.*%s\|query.*\+.*\|SELECT.*\$" ./

# Command injection
grep -rn "exec(\|system(\|shell_exec(\|subprocess\|os.system" ./

# Eval usage
grep -rn "eval(\|Function(\|new Function" ./
```

## OWASP Top 10 checklist

- [ ] Injection
- [ ] Broken Authentication
- [ ] Sensitive Data Exposure
- [ ] XXE
- [ ] Broken Access Control
- [ ] Security Misconfiguration
- [ ] XSS
- [ ] Insecure Deserialization
- [ ] Known Vulnerabilities
- [ ] Insufficient Logging
