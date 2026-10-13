import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "BETTER_AUTH_URL")
  const baseURL = process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL
  const allowedHosts = baseURL ? [new URL(baseURL).hostname] : []
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        includeAssets: [
          "favicon.ico",
          "favicon-16.png",
          "favicon-32.png",
          "apple-touch-icon.png",
          "icon-maskable.png",
          "icon-192.png",
          "icon-512.png",
          "offline.html",
        ],
        manifest: {
          name: "Track-It",
          short_name: "Track-It",
          lang: "es-AR",
          description: "Tus gastos, cuentas y próximos pagos, en un lugar.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          theme_color: "#096b62",
          background_color: "#14191c",
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,png,svg,woff2,html}"],
          // El HTML y sus chunks pertenecen a la misma versión. Al reabrir la
          // app se usa ese shell local; los datos privados siempre van a la API.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/assets\//, /\.[^/]+$/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname === "/api" || url.pathname.startsWith("/api/"),
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:3001" },
      allowedHosts,
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:3001" },
      allowedHosts,
    },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
      fileParallelism: false,
    },
  }
})
