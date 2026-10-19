import type { ApiRuntime, ResolvedProtocol } from '../types'

/** A host selects the trusted same-origin API gateway, never a browser-supplied URL. */
export interface HostAdapter {
  mode: ApiRuntime
  apiPrefix: string | null
  credentialHeaders(): Record<string, string>
}

export type EmbeddedCredentialSelection =
  | { mode: 'account'; group?: string }
  | { mode: 'token'; tokenId: number }

export const runtimeMode: ApiRuntime = (() => {
  const mode = import.meta.env.VITE_API_MODE
  return mode === 'relay' || mode === 'standalone' || mode === 'embedded' ? mode : 'mock'
})()
export const isMockMode = runtimeMode === 'mock'

let embeddedCredential: EmbeddedCredentialSelection = { mode: 'account' }

/** Embedded mode selects only a token ID; the NewAPI server checks ownership. */
export function setEmbeddedCredential(selection: EmbeddedCredentialSelection): void {
  embeddedCredential = selection
}

const hosts: Record<ApiRuntime, HostAdapter> = {
  mock: { mode: 'mock', apiPrefix: null, credentialHeaders: () => ({}) },
  relay: { mode: 'relay', apiPrefix: '/relay/v1', credentialHeaders: () => ({}) },
  standalone: { mode: 'standalone', apiPrefix: '/api/relay/v1', credentialHeaders: () => ({}) },
  embedded: {
    mode: 'embedded',
    apiPrefix: '/pg/image-playground',
    credentialHeaders: () => embeddedCredential.mode === 'token'
      ? { 'X-Playground-Token-ID': String(embeddedCredential.tokenId) }
      : embeddedCredential.group ? { 'X-Playground-Group': embeddedCredential.group } : {},
  },
}

export const activeHost = hosts[runtimeMode]
export function currentCredentialHeaders(): Record<string, string> {
  return activeHost.credentialHeaders()
}

export function endpoint(protocol: ResolvedProtocol, operation?: 'generate' | 'edit'): string {
  const prefix = activeHost.apiPrefix
  if (!prefix) throw new Error('Mock mode must not call the API')
  if (protocol === 'chat') return `${prefix}/chat/completions`
  if (protocol === 'responses') return `${prefix}/responses`
  if (operation === 'generate') return `${prefix}/images/generations`
  if (operation === 'edit') return `${prefix}/images/edits`
  throw new Error('Images requires a generation or edit operation')
}
