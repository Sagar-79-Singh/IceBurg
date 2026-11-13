/// <reference types="vite/client" />
import type { IceburgBridge } from '../shared/ipc.ts'

declare global {
  interface Window {
    /** The preload bridge. Absent in a plain browser preview. */
    iceburg?: IceburgBridge
  }
}

export {}
