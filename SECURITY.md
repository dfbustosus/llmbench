# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in LLMBench, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to **dfbustos@uninorte.edu.co** with the following information:

- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested fixes (optional)

### What to expect

- **Acknowledgement**: You will receive an acknowledgement within 48 hours.
- **Assessment**: We will assess the vulnerability and determine its severity within 5 business days.
- **Fix**: Critical vulnerabilities will be addressed as soon as possible. A fix will be released in a patch version.
- **Disclosure**: Once the fix is released, we will publicly disclose the vulnerability with credit to the reporter (unless anonymity is requested).

## Security Best Practices

When using LLMBench:

- **API keys**: Never commit API keys or tokens. Use environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).
- **Database**: The SQLite database (`llmbench.db`) may contain evaluation inputs/outputs. Add it to `.gitignore` if your data is sensitive.
- **Custom providers**: When implementing custom providers, validate and sanitize all inputs before passing them to external APIs.

## Scope

This security policy covers the following packages:

- `@llmbench/cli`
- `@llmbench/core`
- `@llmbench/db`
- `@llmbench/types`
- `@llmbench/ui`
- `@llmbench/web`
