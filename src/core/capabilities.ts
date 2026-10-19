import type { ApiProtocol, AppSettings } from '../types'
import { isImageModel } from '../types'

/** Product policy: only the two configured GPT Image 2.5 models produce images. */
export function validateImageSettings(settings: AppSettings): void {
  if (!isImageModel(settings.imageModel)) {
    throw new Error('Unsupported image model')
  }
  if (!Number.isInteger(settings.count) || settings.count < 1 || settings.count > 4) {
    throw new Error('Image count must be between 1 and 4')
  }
  if (!['auto', '1024x1024', '1536x1024', '1024x1536'].includes(settings.size)) {
    throw new Error('Unsupported image dimensions')
  }
}

/**
 * Never silently retry an already-sent request using another protocol.
 * Chat image outputs require an explicitly tested vendor-specific adapter.
 */
export function resolveImageProtocol(preference: ApiProtocol): 'images' | 'responses' {
  if (preference === 'auto' || preference === 'images') return 'images'
  if (preference === 'responses') return 'responses'
  throw new Error('当前 Chat 协议没有已验证的图片输出适配器。请选择 Images 或 Responses。')
}
