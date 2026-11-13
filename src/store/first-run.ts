// A URL flag for the browser preview: ?fresh=1 starts from a clean state, so
// screenshots and design review are not affected by whatever was typed before.
// Only read in a browser; inside Electron the real stores are always used.
export const freshStart = (() => {
  if (typeof window === 'undefined' || !window.location?.search) return false
  return new URLSearchParams(window.location.search).get('fresh') === '1'
})()
