/* Adapter contracts shared by every provider and by the registry. Settings are
   passed in rather than read from a store, so adapters stay pure and testable. */
import type { StreamAuth } from '../../shared/ipc.ts'

/** What the registry hands to each provider's factory. */
export interface AdapterSettings {
  baseUrl?: string
  label?: string
  model?: string
  hasKey?: boolean
}

export interface ModelInfo {
  id: string
  name: string
  meta: string
}

export interface WireMessage {
  role: string
  content: string
}

export interface ProviderAdapter {
  id: string
  name: string
  type: string
  listModels(options?: { signal?: AbortSignal }): Promise<ModelInfo[]>
  streamChat(
    messages: WireMessage[],
    model: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown>
}

export type ProviderField = 'label' | 'baseUrl' | 'apiKey' | 'model'

export interface ProviderDefinition {
  id: string
  name: string
  type: string
  signup?: string
  blurb: string
  defaultBaseUrl?: string
  editableBaseUrl?: boolean
  optionalKey?: boolean
  fields: ProviderField[]
  create(settings: AdapterSettings): ProviderAdapter
}

export { type StreamAuth }
