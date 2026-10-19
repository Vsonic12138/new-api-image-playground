# ADR-003: Image Workspace dual-host implementation

**Decision**: One React feature + application service + protocol client,
with separate trusted host adapters for NewAPI Embedded, Standalone and Mock.

```
React UI -> application/execute-task -> api/client + core/capabilities
                                       |
                               host/adapter (same-origin)
                                       |
           +---------------------------+-----------------------+
           |                                                   |
  Standalone Node BFF                             NewAPI Go /pg gateway
  BYOK HttpOnly cookie                            Session + token-ID/group
           |                                                   |
  Fixed NewAPI /v1 URL                             Existing NewAPI Relay
           +---------------------------+-----------------------+
                                       |
                              LLM/VLM/Image models
```

## Guardrails

- Image generation/editing: Flare and Sunburst only. Text/VLM models unrestricted
  within the upstream user's existing permissions.
- Browser host selection is build-time, never a user-controlled proxy URL.
- Core defines capabilities and task commands; API adapters own wire formats;
  hosts own credential selection, endpoint prefix and authentication transport.
- An image returned by the provider must not be misreported as a failed model
  invocation only because IndexedDB persistence failed.
- Embedded NewAPI is an **integration package**, not an official Task Plugin.
- Never retry a possibly billable request by guessing a different protocol.
- Keep local browser data explicitly device-scoped. Production needs per-user
  asset isolation and authenticated server storage before multi-user rollout.

## Incremental migration

This commit extracts real `src/core`, `src/application` and `src/host`
modules without performing a disruptive Vite workspace migration. Later
package publication may move these folders under `packages/`, once independent
build/test entrypoints and stable public APIs exist. The runtime continues to
use a single UI implementation; no duplicate React application is created.

## Verification

`npm run check && npm run build && npm run build:standalone` should pass.
`node --test tests/standalone.test.mjs` uses a fake upstream and never
requests paid models. Real billing validation requires explicit approval.

## Native same-origin mounting

- Build once via `npm run build:embedded` for NewAPI's `/pg-image-workspace/`.
- Configure the example reverse-proxy static location on the same HTTPS origin.
- The NewAPI TanStack Router page at `/image-workspace` owns navigation and
  authentication; its iframe points at the separately built feature bundle.
- The iframe uses the same origin; it sends only Token IDs or authorized groups
  in request headers, and the NewAPI backend verifies each request.
- An embedded build never uses Standalone Node BYOK sessions.
