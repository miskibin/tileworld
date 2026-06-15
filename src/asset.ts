// Resolve a public-dir asset path against Vite's deploy base so runtime fetches
// work under ANY sub-path: GitHub Pages (/tileworld/), an itch.io hashed folder,
// or the Tauri webview (file://). Bundled imports are base-rewritten by Vite at
// build time, but these are raw string paths the bundler never sees — an absolute
// "/audio/x" resolves to the domain root and 404s under a sub-path. vite.config
// has base:'./', so BASE_URL is './' and asset('/audio/x') → './audio/x'.
export const asset = (p: string): string =>
  import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + p.replace(/^\//, '')
