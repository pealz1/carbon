# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/pealz1/carbon/security/advisories/new).

Include what you found, how to reproduce it, and the version of Carbon you're on. You'll get a reply within a few days, and credit in the release notes once it's fixed (unless you'd rather not).

## Supported versions

Only the latest release gets security fixes. Carbon updates itself, so most people are already on it.

## How Carbon handles your data

- Spotify sign-in uses Authorization Code with PKCE. Carbon never sees your Spotify password.
- The OS credential store holds your Spotify token and an encrypted Last.fm connection bound to your Carbon account.
- Each Carbon accounts server has its own credential entries. Users upgrading from a build with unscoped credentials sign in once and reconnect Last.fm.
- Updates are signed, and Carbon refuses any update whose signature doesn't match.
- Carbon’s account service signs opt-in Last.fm requests. It keeps the application signing secret on the server. See the [privacy policy](https://getcarbon.cc/privacy).
