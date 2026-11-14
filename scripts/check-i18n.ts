// Audits the dictionaries: every key referenced from the UI exists in English,
// the Hinglish and Hindi dictionaries cover every English key, and the
// {placeholder} sets of matching keys agree across languages.
// Pure functions + a filesystem read — no DOM.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ENGLISH, HINGLISH, HINDI, missingKeys } from '../src/lib/i18n.ts'

const englishKeys = new Set(Object.keys(ENGLISH))

/* 1. dictionaries ship complete */
const missing = missingKeys()
for (const [lang, keys] of Object.entries(missing)) {
  assert.deepEqual(keys, [], `${lang} is missing keys: ${keys.join(', ')}`)
}
console.log('dictionaries complete: hinglish and hindi cover every english key')

/* 2. every key referenced from the source exists in English */
const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

// UI hook form: t('key') — excludes translate('key') because the lookbehind
// refuses the 'e' of "translate". Direct form: translate(<lang>, 'key').
const reT = /(?<![A-Za-z0-9_$.])t\(\s*'([a-z0-9_]+)'/g
const reTranslate = /translate\((?:[^)]|\([^)]*\))*?'([a-z0-9_]+)'\s*\)/g

let refs = 0
const unknown: string[] = []
for (const file of walk(path.join(import.meta.dirname, '..', 'src'))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const regex of [reT, reTranslate]) {
    for (const match of source.matchAll(regex)) {
      const key = match[1]
      if (!key) continue
      refs += 1
      if (!englishKeys.has(key)) {
        unknown.push(`${path.basename(file)} -> ${key}`)
      }
    }
  }
}
assert.deepEqual(unknown, [], `keys referenced but missing from ENGLISH:\n${unknown.join('\n')}`)
console.log(`source references ok: ${refs} t()/translate() calls all resolve to english keys`)

/* 3. placeholders agree across languages */
const placeholders = (value: string) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',')

for (const [lang, dict] of [['hinglish', HINGLISH], ['hindi', HINDI]] as const) {
  for (const [key, english] of Object.entries(ENGLISH)) {
    const translated = (dict as Record<string, string>)[key]
    if (translated == null) continue // already reported above
    assert.equal(
      placeholders(translated),
      placeholders(english),
      `${lang}: placeholder mismatch in "${key}" (english: {${placeholders(english)}}, ${lang}: {${placeholders(translated)}})`,
    )
  }
}
console.log('placeholders ok: every {var} in english appears in hinglish and hindi')
console.log('i18n ok: dictionaries complete, references resolve, placeholders match')
