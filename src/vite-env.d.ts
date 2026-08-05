/// <reference types="vite/client" />

/**
 * Ship meshes are imported for their bundled URL, so Vite hashes them into
 * `dist/` and the PWA never fetches a model at runtime.
 */
declare module '*.glb' {
  const src: string;
  export default src;
}
