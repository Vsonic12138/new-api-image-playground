import type { AppSettings, AssetRef, ImageProgressPhase, Message, ResolvedProtocol, WorkMode } from '../types'
import { createImages, editImages, sendChat } from '../api/client'

export type ChatHistoryTurn = { role: 'user' | 'assistant'; content: string }
export type TaskCommand = {
  mode: WorkMode
  prompt: string
  settings: AppSettings
  reference?: AssetRef
  annotated?: Blob
  history: ChatHistoryTurn[]
  onProgress?: (phase: ImageProgressPhase) => void
}
export type ExecutedTask = {
  text?: string
  images: AssetRef[]
  protocol: ResolvedProtocol
  responseId?: string
  requestModel: string
}

/** One command boundary for all deployment targets and all three operations. */
export async function executeTask(command: TaskCommand): Promise<ExecutedTask> {
  const { mode, prompt, settings, reference, annotated, history, onProgress } = command
  if (mode === 'generate') {
    const result = await createImages(prompt, settings, onProgress)
    return { ...result, requestModel: result.protocol === 'responses' ? settings.responsesModel : settings.imageModel }
  }
  if (mode === 'edit') {
    if (!reference) throw new Error('Image edit requires a reference')
    const result = await editImages(prompt, reference, settings, annotated, onProgress)
    return { ...result, requestModel: result.protocol === 'responses' ? settings.responsesModel : settings.imageModel }
  }
  const result = await sendChat(prompt, history, settings, reference)
  return { ...result, images: [], requestModel: result.protocol === 'responses' ? settings.responsesModel : settings.chatModel }
}

/** Include only valid text chat turns; images remain explicit references. */
export function buildChatHistory(messages: Message[]): ChatHistoryTurn[] {
  return messages
    .filter(message => message.mode === 'chat' && message.text && message.status !== 'error')
    .map(message => ({ role: message.role, content: message.text }))
}
