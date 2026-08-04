# Security notes

## Dependency audit exception

`npm audit` currently reports GHSA-qwww-vcr4-c8h2 for React Router's React
Server Components (RSC) mode. Mend uses `BrowserRouter` as a client-only SPA and
does not enable React Router framework mode, RSC, server actions, or action
routes. The vulnerable execution path is therefore not reachable in Mend.

The package remains pinned to `react-router-dom@7.18.2`. The version suggested
by `npm audit` (`7.11.0`) is older and reintroduces other published
vulnerabilities. Reassess this exception when React Router publishes a release
outside the affected range, or before enabling any React Router server feature.

## Secrets

Runtime secrets belong only in the deployment environment. Never commit `.env`,
OpenAI keys, Supabase service-role keys, WhatsMiau keys, or webhook secrets.
Only the Supabase URL and publishable key are browser build arguments.
