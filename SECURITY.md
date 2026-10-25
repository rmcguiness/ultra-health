# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
GitHub's [private vulnerability reporting](https://github.com/rmcguiness/ultra-health/security/advisories/new)
(Security tab → "Report a vulnerability").

Include what you found, how to reproduce it, and the impact you expect. This is a
personal project maintained by one person, so there is no bug bounty and no guaranteed
response time, but reports are read and fixes are prioritised.

## Scope

In scope:

- `apps/mobile`: the Expo iOS app, in particular anything that could leak health data off
  the device, weaken the SQLCipher encryption or Keychain key handling, log health values,
  or grant HealthKit write access in production builds.
- `packages/core`: the domain and analytics library.
- Build and CI configuration in this repository.

Out of scope:

- Vulnerabilities in third-party dependencies with no demonstrated impact on this app
  (please report those upstream; Dependabot tracks updates here).

## Known dependency advisories

- `node-forge` (GHSA-86w9-cpqp-85rv): pulled in only by Expo's CLI (`@expo/cli` and
  `@expo/code-signing-certificates`) for EAS Update code signing. It is not part of the app
  bundle that ships to phones. No patched release exists yet (every published version is
  affected), so it stays open until node-forge or Expo ships a fix.

## Personal health data

This repository must never contain real health data. Apple Health exports, back-test
output and snapshots live in the git-ignored `data/` directory. If you ever find personal
data in this repository or its history, report it privately as above.
