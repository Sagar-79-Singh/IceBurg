// A short, human name for a model id, so the raw registry string never has to
// fill the window chrome. "R4C3R/qwen2.5-coder-0.5b-heretic:latest" becomes
// "Qwen 2.5 Coder". The raw id is unchanged everywhere it matters: requests,
// settings and the model list keep what the provider gave us.
const GENERIC_TAGS = new Set(['latest', 'default', 'stable', 'current'])
// Quant/size noise in a tag: q4_K_M, int4, fp16, gguf... none of it is a display name.
const NOISE_TAG = /^(q\d|iq\d|int\d+|fp\d+|bf\d+|f16|f32|gguf|gptq|awq|\d+(\.\d+)?b|a?\d+b|\d+x\d+b)/i
const SIZE_TOKEN = /^(\d+(\.\d+)?b|a?\d+b|\d+x\d+b|\d+k)$/i
// Trailing words that carry no name of their own.
const TRAILING_NOISE = new Set(['instruct', 'chat', 'it', 'base', 'latest', 'default'])

const BRAND_WORDS = new Map(Object.entries({
  gpt: 'GPT', glm: 'GLM', ai: 'AI', llm: 'LLM', qwq: 'QwQ',
  qwen: 'Qwen', llama: 'Llama', deepseek: 'DeepSeek', mistral: 'Mistral',
  mixtral: 'Mixtral', codestral: 'Codestral', gemma: 'Gemma', gemini: 'Gemini',
  phi: 'Phi', kimi: 'Kimi', minimax: 'MiniMax', nemotron: 'Nemotron',
  grok: 'Grok', claude: 'Claude', command: 'Command', sonar: 'Sonar',
  yi: 'Yi', ernie: 'Ernie', internlm: 'InternLM',
}))

const capWord = (word) => {
  const lower = word.toLowerCase()
  if (BRAND_WORDS.has(lower)) return BRAND_WORDS.get(lower)
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// "r1" -> "R1", "k2" -> "K2", "o1" -> "O1" (short letter+digit family markers)
const capToken = (token) => {
  if (/^[a-z]{1,2}\d+[\w.]*$/i.test(token) && token.length <= 4) return token.toUpperCase()
  const match = token.match(/^([a-zA-Z]+)(\d[\w.]*)$/)
  if (match) return `${capWord(match[1])} ${match[2]}`
  return capWord(token)
}

export function shortModelName(id) {
  if (!id) return ''
  let name = String(id).trim()
  // Drop the registry/namespace prefix: "org/" or "org/subgroup/".
  name = name.slice(name.lastIndexOf('/') + 1)
  // Split and clean the tag.
  const tagAt = name.indexOf(':')
  let tag = tagAt >= 0 ? name.slice(tagAt + 1) : ''
  if (tagAt >= 0) name = name.slice(0, tagAt)
  const tagLower = tag.toLowerCase()
  if (GENERIC_TAGS.has(tagLower) || NOISE_TAG.test(tagLower) || tag.length > 12) tag = ''

  // Dots stay inside version numbers; only hyphens and underscores separate tokens.
  const tokens = name.split(/[-_]+/).filter(Boolean)
  // Everything from the first size marker on is a variant/quant/finetune tail:
  // "qwen2.5-coder-0.5b-heretic" -> ["qwen2.5", "coder"].
  const sizeAt = tokens.findIndex((token) => SIZE_TOKEN.test(token))
  const kept = sizeAt >= 0 ? tokens.slice(0, sizeAt) : [...tokens]
  while (kept.length > 1 && TRAILING_NOISE.has(kept[kept.length - 1].toLowerCase())) kept.pop()
  if (!kept.length) return name

  const short = kept.map(capToken).join(' ')
  return tag ? `${short} (${tag})` : short
}
