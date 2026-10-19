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

1. Run `npm run build:embedded` in this repo. It produces the **same React UI**
   with `/pg-image-workspace/` as its static base and NewAPI credentials as the
   host adapter. Serve this directory from the **same origin as NewAPI** using
   the sample Nginx location in `nginx-image-workspace.conf.example`.
   In the NewAPI fork, PR #2 adds the authenticated `/image-workspace` page
   with an iframe pointing at `/pg-image-workspace/` (a distinct static prefix).
   Once that static bundle is deployed on the same HTTPS origin, explicitly
   set `IMAGE_WORKSPACE_ENABLED=true` on the NewAPI backend. The navigation
   item and route default to disabled until this opt-in is present.
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

## Deployment requirement

The optional NewAPI UI route defaults to disabled; it must **not** be enabled without deploying the
same-origin embedded static assets. In particular, using a different hostname
breaks the same-origin cookie contract. Embedded mode currently disables
persistent local conversation metadata to avoid cross-account history leaks.
Keep the native NewAPI PR in Draft until the static bundle, permissions and
end-to-end image calls have been verified together.
