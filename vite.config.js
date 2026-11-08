import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In production the renderer is a local bundle with no network access of its own:
// every HTTP call is proxied through the main process over IPC. The CSP is only
// injected into the built HTML, because Vite's dev client needs inline scripts.
const contentSecurityPolicy = {
  name: 'iceburg-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    )
  },
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [react(), contentSecurityPolicy],
  server: {
    host: '0.0.0.0',
    port: 5273,
    strictPort: true,
    // The app is loaded from disk inside Electron. During development the same
    // bundle is also served over the network for a browser preview, so hosts are
    // not restricted here.
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome128',
    sourcemap: false,
  },
})
