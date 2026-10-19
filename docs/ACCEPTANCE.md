# Acceptance checklist for MVP

## Mock mode

- [ ] `npm install && npm run build` completes after dependency installation.
- [ ] Default mock page opens without API keys.
- [ ] New chat and select chat work and persist through refresh.
- [ ] Image prompt returns result cards; result card opens image inspector.
- [ ] Image editor loads selected image, brush and rectangle annotations show up.
- [ ] Undo and clear operate on marks; submit an edit produces a new image with a parent ID.
- [ ] Upload PNG/JPEG <= 15MB, then edit it.
- [ ] Chat sends text messages and receives the mock assistant response.
- [ ] Download a generated/edited image from a stored or same-origin sample.
- [ ] Mobile viewport renders and stays navigable.

## Real relay mode

- [ ] Restrict test Token permissions and quota on New API.
- [ ] `POST /v1/images/generations` returns image data (`url` or `b64_json`).
- [ ] `POST /v1/images/edits` supports `multipart/form-data` and selected upstream model.
- [ ] `POST /v1/chat/completions` works with separately configured text model.
- [ ] Test model size/count support, errors, rate limits and quota charging.
- [ ] Verify b64 and URL responses are viewable, downloadable and editable.
- [ ] Image URLs that refuse CORS display a clear error on later edit; production ingestion plan in place.
- [ ] With marks enabled, edit request gets composited image, **not a Mask**; verify limitations.
- [ ] No master key or test token appears in network responses, bundled JS or browser localStorage.

## Not in this release

- Automatic prompt-to-tool routing, Mask generation, true inpainting, production session backend, stable object storage, streaming chat.
