export type WorkMode = 'generate' | 'edit' | 'chat'
export type ImageProgressPhase = 'preparing' | 'requesting' | 'saving'
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const
export type ImageModel = (typeof IMAGE_MODELS)[number]
export const isImageModel = (value: string): value is ImageModel =>
  IMAGE_MODELS.some(model => model === value)

/** Both Chat and Responses can serve text; Images is the direct image-only protocol. */
export type ApiProtocol = 'auto' | 'chat' | 'responses' | 'images'
export type ResolvedProtocol = Exclude<ApiProtocol, 'auto'>
export type ApiRuntime = 'mock' | 'relay' | 'standalone' | 'embedded'

export type AssetRef = {
  id: string
  /** Image binary lives in IndexedDB when possible; an upstream URL is a fallback. */
  src?: string
  name?: string
  parentId?: string
  createdAt: number
  protocol?: ResolvedProtocol
  responseId?: string
  model?: string
}
export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  mode: WorkMode
  images: AssetRef[]
  createdAt: number
  status?: 'pending' | 'error' | 'done'
  progressPhase?: ImageProgressPhase
  protocol?: ResolvedProtocol
  requestModel?: string
  responseId?: string
  previousResponseId?: string
}
export type Conversation = {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}
export type AppSettings = {
  imageModel: ImageModel
  /** Chat Completions text/VLM model. */
  chatModel: string
  /** Top-level Responses mainline model, independent of GPT Image tool model. */
  responsesModel: string
  /** Protocol chosen for text/chat requests. */
  chatProtocol: 'chat' | 'responses'
  /** Image requests: auto selects Images; Responses uses image_generation tool. */
  imageProtocol: ApiProtocol
  size: string
  count: number
}
export const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
export const DEFAULT_SETTINGS: AppSettings = {
  imageModel: 'gpt-image-2.5-flare',
  chatModel: 'gpt-4.1-mini',
  responsesModel: 'gpt-5',
  chatProtocol: 'chat',
  imageProtocol: 'auto',
  size: '1024x1024',
  count: 1,
}
