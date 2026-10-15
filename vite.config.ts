import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import { execFileSync } from "node:child_process"

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "BETTER_AUTH_URL")
  const baseURL = process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL
  const allowedHosts = baseURL ? [new URL(baseURL).hostname] : []
  let revision = 'unknown'
  if (command === 'build' && !process.env.TRACK_IT_BUILD_ID) {
    try { revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* Source archives have no git metadata. */ }
  }
  const buildId = command === 'build' ? process.env.TRACK_IT_BUILD_ID || `${revision}-${new Date().toISOString().replace(/[-:.]/g, '')}` : 'development'
  return {
    define: { __TRACK_IT_BUILD_ID__: JSON.stringify(buildId) },
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
      proxy: { "/api": process.env.TRACK_IT_TEST_API_ORIGIN || "http://127.0.0.1:3001" },
      allowedHosts,
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": process.env.TRACK_IT_TEST_API_ORIGIN || "http://127.0.0.1:3001" },
      allowedHosts,
    },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
      fileParallelism: false,
    },
  }
})
