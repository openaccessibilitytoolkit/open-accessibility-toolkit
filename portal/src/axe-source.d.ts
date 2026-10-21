// axe-core's own code, loaded as text (see "rules" in wrangler.jsonc) and run inside
// Cloudflare's browser, never in the portal itself.
declare module "axe-core/axe.min.js" {
  const source: string;
  export default source;
}
