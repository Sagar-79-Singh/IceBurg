// Clean what a model hands back as a chat title. Tiny models especially love
// decorating: quotes, "Title:" prefixes, markdown, trailing periods, two lines.
export function cleanModelTitle(raw) {
  const firstLine = String(raw || '').split('\n')[0]
  let title = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^title\s*:\s*/i, '')
    .replace(/["'`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  title = title.replace(/[.!?,;:]+$/, '')
  if (title.length > 48) title = `${title.slice(0, 48).trimEnd()}…`
  return title.length >= 3 ? title : ''
}
