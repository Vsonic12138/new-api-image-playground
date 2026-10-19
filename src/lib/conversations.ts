import i18n from 'i18next'
import type { AppSettings, Conversation } from '../types'
import { DEFAULT_SETTINGS, uuid } from '../types'
export const SESSION_KEY = 'new-api-image-playground:v1:sessions'
export const SETTINGS_KEY = 'new-api-image-playground:v1:settings'
export function makeConversation(): Conversation {
  return { id: uuid(), title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}
function example(): Conversation {
  const now = Date.now()
  return { id: 'welcome-demo', title: i18n.t('exampleTitle', {ns:'imagePlayground'}), createdAt: now, updatedAt: now, messages: [
    { id: 'demo-u', role: 'user', mode: 'generate', text: i18n.t('examplePrompt', {ns:'imagePlayground'}), images: [], createdAt: now - 60000 },
    { id: 'demo-a', role: 'assistant', mode: 'generate', text: i18n.t('exampleAnswer', {ns:'imagePlayground'}), images: [
      { id: 'demo-1', src: `${import.meta.env.BASE_URL}samples/robot-room.webp`, createdAt: now - 59000 },
      { id: 'demo-2', src: `${import.meta.env.BASE_URL}samples/robot-sky.webp`, createdAt: now - 58000 },
    ], createdAt: now - 57000 },
  ] }
}
export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return [example()]
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as Conversation[] : [example()]
  } catch { return [example()] }
}
export function loadSettings(): AppSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } }
  catch { return DEFAULT_SETTINGS }
}
