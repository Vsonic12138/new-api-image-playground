import type { ApiRuntime, ResolvedProtocol } from '../types'

/**
 * Three delivery targets, one client interface:
 * relay: Vite loopback proxy (dev only); standalone: same-origin BFF;
 * embedded: NewAPI's authenticated Playground route. Never send an admin key from React.
 */
export const runtimeMode: ApiRuntime = (() => {
  const mode = import.meta.env.VITE_API_MODE
  return mode === 'relay' || mode === 'standalone' || mode === 'embedded' ? mode : 'mock'
})()
export const isMockMode = runtimeMode === 'mock'

const PREFIX: Record<Exclude<ApiRuntime, 'mock'>, string> = {
  relay: '/relay/v1',
  standalone: '/api/relay/v1',
  embedded: '/pg/image-playground',
}

export function endpoint(protocol: ResolvedProtocol, operation?: 'generate' | 'edit'): string {
  if (runtimeMode === 'mock') throw new Error('Mock mode must not call the API')
  const prefix = PREFIX[runtimeMode]
  if (protocol === 'chat') return `${prefix}/chat/completions`
  if (protocol === 'responses') return `${prefix}/responses`
  if (operation === 'generate') return `${prefix}/images/generations`
  if (operation === 'edit') return `${prefix}/images/edits`
  throw new Error('Images requires a generation or edit operation')
}

export type EmbeddedCredentialSelection =
  | {mode:'account';group?:string}
  | {mode:'token';tokenId:number}

/** Ephemeral UI choice only. No API keys or tokens are stored here. */
let embeddedCredential: EmbeddedCredentialSelection = {mode:'account'}
export function setEmbeddedCredential(selection: EmbeddedCredentialSelection) {
  embeddedCredential = selection
}
function currentCredentialHeaders():Record<string,string> {
  if (runtimeMode !== 'embedded') return {}
  return embeddedCredential.mode === 'token'
    ? {'X-Playground-Token-ID':String(embeddedCredential.tokenId)}
    : embeddedCredential.group ? {'X-Playground-Group':embeddedCredential.group} : {}
}

export class PlaygroundApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'PlaygroundApiError' }
}

export async function parseJSON(res: Response): Promise<any> {
  const data: any = await res.json().catch(() => null)
  if (!res.ok || data?.error || data?.success === false) {
    throw new PlaygroundApiError(
      data?.error?.message || data?.message || `HTTP ${res.status}`,
      res.status,
      data?.error?.code || data?.error?.type,
    )
  }
  return data
}

export async function postJSON(endpointURL: string, payload: unknown): Promise<any> {
  const response = await fetch(endpointURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...currentCredentialHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  })
  return parseJSON(response)
}

export async function postMultipart(endpointURL: string, data: FormData): Promise<any> {
  const response = await fetch(endpointURL, { method: 'POST', body: data, headers:currentCredentialHeaders(), credentials: 'same-origin' })
  return parseJSON(response)
}

export async function toDataURL(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'))
    reader.onerror = () => reject(reader.error || new Error('Image could not be read'))
    reader.readAsDataURL(file)
  })
}

export type ParsedImage = { b64_json?: string; url?: string }
export type ImageResponse = { images: ParsedImage[]; responseId?: string; text?: string }

export function parseImagesResponse(data: any): ImageResponse {
  const items = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
  const images = items.filter((item: any) => typeof item?.b64_json === 'string' || typeof item?.url === 'string')
  if (!images.length) throw new Error('图片接口未返回可用图片')
  return { images }
}

/** Responses may contain multiple text parts and multiple image_generation calls. */
export function parseResponsesResult(data: any): ImageResponse {
  if (data?.status === 'failed' || data?.error) throw new Error(data?.error?.message || 'Responses 请求失败')
  const text: string[] = []
  const images: ParsedImage[] = []
  const output = Array.isArray(data?.output) ? data.output : []
  for (const item of output) {
    if (item?.type === 'image_generation_call' && typeof item.result === 'string' && item.result) {
      if (item.result.startsWith('data:')) images.push({url:item.result})
      else images.push({b64_json:item.result})
    }
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') text.push(part.text)
        if (part?.type === 'output_image') {
          const url = part.image_url?.url || part.image_url
          if (typeof url === 'string') images.push({url})
        }
      }
    }
  }
  if (!text.length && typeof data?.output_text === 'string') text.push(data.output_text)
  return { images, responseId: typeof data?.id === 'string' ? data.id : undefined, text: text.join('\n') }
}

export function parseChatResult(data: any): ImageResponse {
  const message = data?.choices?.[0]?.message
  if (!message) throw new Error('Chat 接口没有返回消息')
  const content = message.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.filter((part:any) => part?.type === 'text').map((part:any) => part.text).filter(Boolean).join('\n') : ''
  // This is a vendor extension, NOT part of the standard OpenAI Chat protocol.
  const images: ParsedImage[] = []
  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      const url = image?.image_url?.url || image?.image_url || image?.url
      if (typeof url === 'string' && url) images.push({url})
    }
  }
  return {images, text}
}
