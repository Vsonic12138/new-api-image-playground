import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_MODELS, isImageModel, validateImageSettings, resolveImageProtocol } from '../src/core/capabilities.ts'

test('image product policy admits only Flare and Sunburst', () => {
  assert.deepEqual([...IMAGE_MODELS], ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])
  assert.equal(isImageModel('gpt-image-2.5-flare'), true)
  assert.equal(isImageModel('gpt-image-2.5-sunburst'), true)
  assert.equal(isImageModel('gpt-image-2'), false)
  assert.equal(isImageModel('gpt-5'), false)
})

test('image protocol selection does not guess unverified Chat image support', () => {
  assert.equal(resolveImageProtocol('auto'), 'images')
  assert.equal(resolveImageProtocol('images'), 'images')
  assert.equal(resolveImageProtocol('responses'), 'responses')
  assert.throws(() => resolveImageProtocol('chat'))
})

test('runtime image settings are validated before billable requests', () => {
  const valid = { imageModel: 'gpt-image-2.5-flare', count: 1, size: '1024x1024' }
  assert.doesNotThrow(() => validateImageSettings(valid))
  assert.throws(() => validateImageSettings({ ...valid, imageModel: 'gpt-image-2' }))
  assert.throws(() => validateImageSettings({ ...valid, count: 0 }))
  assert.throws(() => validateImageSettings({ ...valid, count: 5 }))
  assert.throws(() => validateImageSettings({ ...valid, size: '100x100' }))
})
