// Voice Mode needs the microphone; nothing else needs anything. The renderer
// may ask only for audio capture, and every other permission stays denied.
// This module is pure so the check suite can prove the truth table — the main
// process wires it onto the session in main.ts.
export type MediaType = 'audio' | 'video' | 'unknown'

export interface PermissionCheckDetails {
  mediaType?: MediaType
  securityOrigin?: string
}

export interface PermissionRequestDetails {
  mediaTypes?: MediaType[]
  securityOrigin?: string
}

/**
 * Allow audio capture requests (getUserMedia audio, and the permission check
 * that precedes them). Everything else — video, mixed audio+video, camera,
 * geolocation, notifications, clipboard, … — is refused.
 */
export function allowPermissionForVoice(permission: string, details?: unknown): boolean {
  if (permission !== 'media' || !details || typeof details !== 'object') return false
  const record = details as Record<string, unknown>

  // Request handler: the details carry a list of media types.
  if (Array.isArray(record.mediaTypes)) {
    const types = record.mediaTypes.filter((type): type is MediaType => typeof type === 'string')
    return types.length > 0 && types.length === record.mediaTypes.length && types.every((type) => type === 'audio')
  }

  // Check handler: the details carry a single media type.
  if (typeof record.mediaType === 'string') {
    return record.mediaType === 'audio'
  }

  return false
}
