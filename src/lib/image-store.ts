import type { AssetRef } from '../types'
import { uuid } from '../types'
const DB_NAME = 'new-api-image-playground-assets'
const STORE = 'images'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function saveBlob(blob: Blob, parentId?: string): Promise<AssetRef> {
  const id = uuid()
  const database = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  database.close()
  return { id, parentId, createdAt: Date.now() }
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  const database = await db()
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const req = database.transaction(STORE).objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
  database.close()
  return result
}
export function base64ToBlob(base64: string): Blob {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}
export async function saveImageResponse(data: { b64_json?: string; url?: string }, parentId?: string): Promise<AssetRef> {
  if (data.b64_json) return saveBlob(base64ToBlob(data.b64_json), parentId)
  if (!data.url) throw new Error('上游图片响应中没有 url 或 b64_json')
  // Attempt an immediate durable cache. URLs from third-party relays can expire.
  try {
    const res = await fetch(data.url)
    if (!res.ok) throw new Error(`image fetch ${res.status}`)
    return await saveBlob(await res.blob(), parentId)
  } catch {
    return { id: uuid(), src: data.url, parentId, createdAt: Date.now() }
  }
}
export async function fileFromAsset(asset: AssetRef): Promise<File> {
  let blob = await getBlob(asset.id)
  if (!blob && asset.src) {
    const res = await fetch(asset.src)
    if (!res.ok) throw new Error(`图片下载失败 (${res.status})`)
    blob = await res.blob()
  }
  if (!blob) throw new Error('历史图片不存在或已从浏览器缓存中清除')
  return new File([blob], 'reference.png', { type: blob.type || 'image/png' })
}
export function useUrlFromAsset(asset: AssetRef | undefined, onUrl: (url: string | undefined) => void) {
  if (!asset) { onUrl(undefined); return () => {} }
  let alive = true
  let objectUrl: string | undefined
  getBlob(asset.id).then((blob) => {
    if (!alive) return
    if (blob) { objectUrl = URL.createObjectURL(blob); onUrl(objectUrl) }
    else onUrl(asset.src)
  }).catch(() => { if (alive) onUrl(asset.src) })
  return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
}
