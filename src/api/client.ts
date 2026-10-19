import i18n from 'i18next'
import type { AppSettings, AssetRef, WorkMode } from '../types'
import { saveImageResponse, saveBlob, fileFromAsset } from '../lib/image-store'
const MOCK = import.meta.env.VITE_API_MODE !== 'relay'
export const isMockMode = MOCK
const SAMPLE_URLS = ['robot-room.webp', 'robot-sky.webp', 'robot-night.webp', 'robot-edit.webp'].map(file => `${import.meta.env.BASE_URL}samples/${file}`)
let samplePointer = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function parseResponse(res: Response): Promise<any> {
  const data: any = await res.json().catch(() => null)
  if (!res.ok || data?.error) throw new Error(data?.error?.message || data?.message || `HTTP ${res.status}`)
  return data
}
export async function createImages(prompt: string, settings: AppSettings): Promise<AssetRef[]> {
  if (MOCK) {
    await sleep(750)
    const result = []
    for (let i = 0; i < settings.count; i++) {
      const src = SAMPLE_URLS[(samplePointer++) % SAMPLE_URLS.length]
      result.push({ id: `sample-${Date.now()}-${i}`, src, createdAt: Date.now() })
    }
    return result
  }
  const res = await fetch('/relay/v1/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.imageModel, prompt, n: settings.count, size: settings.size }),
  })
  const data = await parseResponse(res)
  if (!Array.isArray(data?.data) || !data.data.length) throw new Error('上游未返回图片')
  return Promise.all(data.data.map((item: { url?: string; b64_json?: string }) => saveImageResponse(item)))
}
export async function editImages(prompt: string, image: AssetRef, settings: AppSettings, annotated?: Blob): Promise<AssetRef[]> {
  if (MOCK) {
    await sleep(900)
    return [{ id: `sample-edit-${Date.now()}`, src: SAMPLE_URLS[(samplePointer++) % SAMPLE_URLS.length], parentId: image.id, createdAt: Date.now() }]
  }
  const file = annotated
    ? new File([annotated], 'annotated.png', { type: 'image/png' })
    : await fileFromAsset(image)
  const form = new FormData()
  form.append('model', settings.imageModel)
  form.append('prompt', prompt)
  form.append('image', file)
  form.append('n', String(settings.count))
  form.append('size', settings.size)
  const res = await fetch('/relay/v1/images/edits', { method: 'POST', body: form })
  const data = await parseResponse(res)
  if (!Array.isArray(data?.data) || !data.data.length) throw new Error('上游未返回编辑后的图片')
  return Promise.all(data.data.map((item: { url?: string; b64_json?: string }) => saveImageResponse(item, image.id)))
}
export async function sendChat(prompt: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, settings: AppSettings): Promise<string> {
  if (MOCK) {
    await sleep(580)
    return i18n.t('mockChatReply', {ns:'imagePlayground', prompt})
  }
  const res = await fetch('/relay/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.chatModel, stream: false, messages: [...history.slice(-12), { role: 'user', content: prompt }] }),
  })
  const data = await parseResponse(res)
  return data?.choices?.[0]?.message?.content || '模型返回了空响应'
}
export async function importImage(file: File): Promise<AssetRef> {
  if (!file.type.startsWith('image/')) throw new Error('只支持上传图片文件')
  if (file.size > 15 * 1024 * 1024) throw new Error('图片不能超过 15MB')
  return saveBlob(file)
}
export function modeLabel(mode: WorkMode) { return mode === 'generate' ? '生图' : mode === 'edit' ? '修图' : '对话' }
