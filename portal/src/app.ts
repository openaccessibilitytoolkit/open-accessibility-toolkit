// The portal as a desktop app. Owner pages link these app settings (a "web app
// manifest"), so Chrome and Edge offer to install the portal: it then gets its own icon
// on the desktop and in the Start menu, and opens in its own window. It's still the same
// website, so it's always up to date. Visitors' pages don't link it.

/** The app settings. The app opens the owner's pages and stays within them. */
export const APP_MANIFEST = {
  id: "/admin",
  name: "Accessibility portal",
  short_name: "A11y portal",
  description: "Accessibility reports for your websites, and what you did about them.",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  background_color: "#f4f6f8",
  theme_color: "#0d5c73",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
  ],
};

export function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
