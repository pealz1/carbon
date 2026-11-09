# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/pealz1/carbon/security/advisories/new).

Include what you found, how to reproduce it, and the version of Carbon you're on. You'll get a reply within a few days, and credit in the release notes once it's fixed (unless you'd rather not).

## Supported versions

Only the latest release gets security fixes. Carbon updates itself, so most people are already on it.

## How Carbon handles your data

- Spotify sign-in uses Authorization Code with PKCE. Carbon never sees your Spotify password.
- Your Spotify and Last.fm sign-ins are stored in Windows Credential Manager, never in plain files.
- Updates are signed, and Carbon refuses any update whose signature doesn't match.
- Carbon has no servers and sends no analytics. See the [privacy policy](https://getcarbon.cc/privacy).
