import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock.tsx'
import { openExternal } from '../store/bridge.ts'

// Long answers are read, so the typography lives in CSS (.md) and this file only
// decides which element each node becomes.
const components: Components = {
  a({ href, children }) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          if (href && /^https:\/\//i.test(href)) openExternal(href)
        }}
      >
        {children}
      </a>
    )
  },
  pre({ children }) {
    // react-markdown wraps our code component in <pre>; the code component owns
    // the whole frame, so drop the extra wrapper.
    return <>{children}</>
  },
  code({ className, children, ...props }) {
    const match = /language-([\w+-]+)/.exec(className || '')
    const value = String(children ?? '')
    const multiline = value.includes('\n') || Boolean(match)
    if (!multiline) return <code {...props}>{children}</code>
    return <CodeBlock language={match ? match[1] : ''}>{value}</CodeBlock>
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table>{children}</table>
      </div>
    )
  },
  input({ type, checked, ...props }) {
    if (type === 'checkbox') {
      return <input type="checkbox" checked={Boolean(checked)} readOnly {...props} />
    }
    return <input type={type} {...props} />
  },
  img({ src, alt }) {
    return (
      <span className="font-mono text-micro text-muted" title={src}>
        [image: {alt || 'untitled'}]
      </span>
    )
  },
}

function Markdown({ children }: { children?: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
