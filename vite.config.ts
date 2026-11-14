import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// In production the renderer is a local bundle with no network access of its own:
// every HTTP call is proxied through the main process over IPC. The CSP is only
// injected into the built HTML, because Vite's dev client needs inline scripts.

const contentSecurityPolicy: Plugin = {
  name: 'iceburg-csp',
  apply: 'build',
  transformIndexHtml(html: string) {
    const policy = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets the local Whisper model compile its WASM on-device.
      "script-src 'self' 'wasm-unsafe-eval'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // Voice Mode: the Whisper model (Hugging Face hub, consent-gated) and the
      // pinned ONNX WASM binaries. Nothing else is reachable from the window.
      "connect-src 'self' https://huggingface.co https://*.huggingface.co https://cas-bridge.xethub.hf.co https://*.xethub.hf.co https://cdn.jsdelivr.net",
      "media-src 'self' blob:",
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
  worker: {
    // Classic (iife) worker: the renderer ships from file:// in production,
    // where module workers are not a safe assumption.
    format: 'iife',
  },
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
