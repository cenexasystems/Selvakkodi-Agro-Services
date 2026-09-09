import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

function vercelApiDevPlugin(): Plugin {
  return {
    name: 'vercel-api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const [pathOnly, rawQuery] = (req.url || '').split('?')
        if (!pathOnly.startsWith('/api/')) {
          return next()
        }

        const queryParams = new URLSearchParams(rawQuery || '')
        req.query = Object.fromEntries(queryParams.entries())

        const endpointPath = pathOnly.replace(/^\/api\//, '')
        const segments = endpointPath.split('/').filter(Boolean)
        const candidates: Array<{ path: string; params: Record<string, string> }> = [
          { path: `./api/${endpointPath}.ts`, params: {} },
          { path: `./api/${endpointPath}/index.ts`, params: {} },
        ]

        if (segments.length === 2) {
          candidates.push({
            path: `./api/${segments[0]}/[id].ts`,
            params: { id: decodeURIComponent(segments[1]) },
          })
          candidates.push({
            path: `./api/${segments[0]}/[id]/index.ts`,
            params: { id: decodeURIComponent(segments[1]) },
          })
        }

        if (segments.length === 3) {
          candidates.push({
            path: `./api/${segments[0]}/[id]/${segments[2]}.ts`,
            params: { id: decodeURIComponent(segments[1]) },
          })
          candidates.push({
            path: `./api/${segments[0]}/${segments[1]}/${segments[2]}.ts`,
            params: {},
          })
        }

        try {
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
            const buffers: Buffer[] = []
            for await (const chunk of req) {
              buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }
            if (buffers.length > 0) {
              const rawBody = Buffer.concat(buffers).toString('utf-8')
              try {
                req.body = JSON.parse(rawBody)
              } catch {
                req.body = rawBody
              }
            }
          }

          res.status = (code: number) => {
            res.statusCode = code
            return res
          }
          res.json = (data: any) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
            return res
          }

          for (const c of candidates) {
            const absolutePath = path.resolve(process.cwd(), c.path)
            if (!fs.existsSync(absolutePath)) {
              continue
            }

            try {
              const mod = await server.ssrLoadModule(c.path)
              if (mod && typeof mod.default === 'function') {
                Object.assign(req.query, c.params)
                await mod.default(req, res)
                return
              }
            } catch (err: any) {
              if (
                err.message?.includes('Cannot find module') ||
                err.message?.includes('Failed to load url') ||
                err.message?.includes('Does the file exist') ||
                err.code === 'ENOENT'
              ) {
                continue
              }
              console.error(`Error executing API endpoint ${c.path}:`, err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
              return
            }
          }

          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: `API route not found: ${pathOnly}` }))
          return
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
      react(),
      vercelApiDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'logo.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
        'product-placeholder.svg',
        'robots.txt',
      ],
      manifest: {
        name: 'Selvakkodi Agro Service Billing',
        short_name: 'Selvakkodi Agro',
        description: "Selvakkodi Agro Service Billing – POS, advance orders, catalog, invoices, and analytics.",
        theme_color: '#2E7D32',
        background_color: '#FAFDF6',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/admin/, /supabase/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('react-smooth') || id.includes('victory-')) return 'charts'
          if (id.includes('react-router')) return 'router'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('workbox') || id.includes('vite-plugin-pwa')) return 'pwa'
          return 'vendor'
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
    server: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
  }
})
