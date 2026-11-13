// The provider table. To add a provider: drop a file in this folder that exports a
// definition like the ones below, then add it to this list. Nothing else changes.
//
// A definition is:
//   {
//     id, name, blurb,
//     type: 'local' | 'cloud' | 'router' | 'openai',
//     signup?: string,
//     defaultBaseUrl?: string,
//     fields: ('label' | 'baseUrl' | 'apiKey' | 'model')[],
//     optionalKey?: boolean,
//     editableBaseUrl?: boolean,
//     create(settings) -> { id, name, type, listModels(), streamChat(messages, model, signal) }
//   }
import type { AdapterSettings, ProviderDefinition } from './types.ts'
import type { CodedError } from './http.ts'
import ollama from './ollama.ts'
import openrouter from './openrouter.ts'
import omniroute from './omniroute.ts'
import gemini from './gemini.ts'
import custom from './custom.ts'

export const definitions: ProviderDefinition[] = [ollama, openrouter, omniroute, gemini, custom]

// The order above is the order on screen: local first, then the gateways.
export const definitionList = definitions

export function getDefinition(id: string): ProviderDefinition | null {
  return definitions.find((definition) => definition.id === id) || null
}

/**
 * Build the adapter for a provider. Settings are passed in rather than read from
 * a store so adapters stay pure and easy to test.
 */
export function createAdapter(providerId: string, settings: AdapterSettings = {}) {
  const definition = getDefinition(providerId)
  if (!definition) {
    const error = new Error(`Unknown provider "${providerId}". Add it in the registry.`) as CodedError
    error.code = 'unknown-provider'
    throw error
  }
  return definition.create(settings)
}

export function providerLabel(providerId: string, settings: { label?: string } = {}) {
  const definition = getDefinition(providerId)
  if (!definition) return providerId
  if (providerId === 'custom' && settings.label) return settings.label
  return definition.name
}
