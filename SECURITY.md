# Security Policy

The ForMash 3D project takes the security and safety of developers and users seriously. As an early experimental, pre-alpha project that incorporates local AI model runners, file processors, and system execution scripts, security vigilance is essential.

---

## Supported Versions

Only the latest commit on the `main` branch is actively monitored for security vulnerabilities and bug fixes.

| Version | Supported |
|---|---|
| `main` (0.1.0-prealpha) | :white_check_mark: |
| Older commits / forks | :x: |

---

## Reporting a Vulnerability

If you discover a security vulnerability or sensitive security issue within ForMash 3D (such as remote code execution, arbitrary file writes/path traversals, unauthorized credential exposure, or injection vulnerabilities):

**Please do NOT open a public GitHub issue or disclose the vulnerability publicly.**

Instead, please report the vulnerability privately through one of the following methods:

1. **GitHub Private Vulnerability Reporting**: Use the "Report a vulnerability" button under the **Security** tab of the GitHub repository.
2. **Direct Maintainer Contact**: Send an email to the repository maintainer with:
   - A description of the vulnerability and its potential impact.
   - Step-by-step reproduction steps or a minimal proof-of-concept (PoC).
   - The affected files, routes, or scripts.
   - Any recommended remediation steps.

---

## What We Ask of Reporters

- Allow a reasonable amount of time for the maintainers to investigate and patch the issue before any public disclosure.
- Make a good faith effort to avoid privacy violations, data destruction, and service interruption during your research.
- Do not exploit the vulnerability beyond what is strictly necessary to demonstrate its presence.

---

## Security Best Practices for Users & Developers

1. **Environment Isolation**: Because generative 3D modeling relies on custom C++/CUDA kernels, deep system bindings, and third-party research code, **always run ForMash 3D in an isolated container, disposable VM, or dedicated workstation**.
2. **Review Setup Scripts**: Always inspect shell scripts (such as `scripts/setup.sh` and `backend/scripts/install.sh`) before execution. These scripts may modify CUDA toolkits, APT sources, and Python virtual environments.
3. **Protect API Keys and Tokens**: Keep your `.env` file private and never commit your Hugging Face API token (`HF_TOKEN`) or other credentials to version control.
4. **Network Exposure**: ForMash 3D's FastAPI backend and Next.js frontend are designed by default for local development (`localhost`). If exposing instances to public networks, place them behind a secure reverse proxy (e.g., NGINX/Caddy) with HTTPS and authentication enabled.
