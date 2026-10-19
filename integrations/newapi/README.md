# NewAPI native Image Workspace integration

This is a **host integration module**, not a NewAPI Task Plugin. As of October
2026 the NewAPI Task Plugin loader supports task protocols, not installation of
arbitrary React UI bundles and authenticated dashboard routes.

## Supported hosts

| Host | Credential model | API prefix | Frontend |
| --- | --- | --- | --- |
| Standalone | User BYOK, HttpOnly session | `/api/relay/v1` | Standalone Vite build |
| Embedded NewAPI | Current login and validated account group/token ID | `/pg/image-playground` | Existing NewAPI authenticated route |
| Local relay | Dev-only restricted token in Vite proxy | `/relay/v1` | Local Vite dev |
| Mock | No credential/API request | None | GitHub Pages |

The shared implementation is `src/core`, `src/application`, `src/api`,
`src/host` and `src/components`. All hosts use the same work modes and
request parsing. `src/host/adapter.ts` is the host boundary.

## Native integration steps (fork / patch)

1. Build with `VITE_API_MODE=embedded` and register the UI as an authenticated
   NewAPI frontend feature. Existing NewAPI already uses TanStack Router and
   i18next; add the new page/translation namespace to the existing instances.
2. Provide the optional four authenticated `/pg/image-playground/*` endpoints
   from NewAPI PR #2, with the route-normalization follow-up. Verify the PR,
   merge only after authorization tests, then deploy a compatible NewAPI fork.
3. Route all authenticated model usage through existing NewAPI Distribute and
   Relay code. Never inject an admin API key into the browser.
4. Only select user-owned token IDs (never plaintext keys) or an authorized
   account group. Enforce image model allowlisting on the server.
5. Scope persisted browser conversation and image data to the logged-in user,
   or disable shared-browser persistence until that isolation exists.

This **does not** claim drag-and-drop installation through the official NewAPI
Task Plugin marketplace. A future NewAPI UI-extension API can be implemented
as an additional host adapter without changing the workspace core.

The existing PR remains a draft until Go tests, multi-user authorization,
Responses tool billing, multipart edits and real-provider smoke tests pass.
