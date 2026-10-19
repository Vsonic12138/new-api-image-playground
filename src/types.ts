export type WorkMode = 'generate' | 'edit' | 'chat'
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const
export type ImageModel = (typeof IMAGE_MODELS)[number]
export const isImageModel = (value: string): value is ImageModel => IMAGE_MODELS.some(model => model === value)
export type ImageProgressPhase = 'preparing' | 'requesting' | 'saving'
export type AssetRef = {
  id: string
  /** Staged in IndexedDB where possible; remote URL fallback if cache blocked. */
  src?: string
  name?: string
  parentId?: string
  createdAt: number
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
  chatModel: string
  size: string
  count: number
}
export const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
export const DEFAULT_SETTINGS: AppSettings = {
  imageModel: 'gpt-image-2.5-flare', chatModel: 'gpt-4.1-mini', size: '1024x1024', count: 1,
}
