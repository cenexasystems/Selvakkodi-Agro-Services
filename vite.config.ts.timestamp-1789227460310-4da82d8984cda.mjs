// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/SELVAKKODI%20AGRO%20SERVICES/node_modules/vite/dist/node/index.js";
import react from "file:///C:/SELVAKKODI%20AGRO%20SERVICES/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///C:/SELVAKKODI%20AGRO%20SERVICES/node_modules/vite-plugin-pwa/dist/index.js";
function vercelApiDevPlugin() {
  return {
    name: "vercel-api-dev-server",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const [pathOnly, rawQuery] = (req.url || "").split("?");
        if (!pathOnly.startsWith("/api/") && pathOnly !== "/api") {
          return next();
        }
        const queryParams = new URLSearchParams(rawQuery || "");
        req.query = Object.fromEntries(queryParams.entries());
        try {
          if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
            const buffers = [];
            for await (const chunk of req) {
              buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            if (buffers.length > 0) {
              const rawBody = Buffer.concat(buffers).toString("utf-8");
              try {
                req.body = JSON.parse(rawBody);
              } catch {
                req.body = rawBody;
              }
            }
          }
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return res;
          };
          const mod = await server.ssrLoadModule("./api/index.ts");
          if (mod && typeof mod.default === "function") {
            await mod.default(req, res);
            return;
          }
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: false, error: `API route not found: ${pathOnly}` }));
          return;
        } catch (err) {
          console.error(`Error executing API router:`, err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
      });
    }
  };
}
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);
  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [
      react(),
      vercelApiDevPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: [
          "logo.png",
          "pwa-192x192.png",
          "pwa-512x512.png",
          "maskable-icon-512x512.png",
          "product-placeholder.svg",
          "robots.txt"
        ],
        manifest: {
          name: "Selvakkodi Agro Service Billing",
          short_name: "Selvakkodi Agro",
          description: "Selvakkodi Agro Service Billing \u2013 POS, advance orders, catalog, invoices, and analytics.",
          theme_color: "#2E7D32",
          background_color: "#FAFDF6",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "/maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpeg,jpg,woff,woff2}"],
          navigateFallbackDenylist: [/^\/api/, /^\/admin/, /supabase/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkOnly"
            },
            {
              urlPattern: /\/api\/.*/i,
              handler: "NetworkOnly"
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "google-fonts-stylesheets"
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            }
          ]
        }
      })
    ],
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("recharts") || id.includes("d3-") || id.includes("react-smooth") || id.includes("victory-")) return "charts";
            if (id.includes("react-router")) return "router";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("workbox") || id.includes("vite-plugin-pwa")) return "pwa";
            return "vendor";
          }
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext"
      }
    },
    server: {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxTRUxWQUtLT0RJIEFHUk8gU0VSVklDRVNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFNFTFZBS0tPREkgQUdSTyBTRVJWSUNFU1xcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovU0VMVkFLS09ESSUyMEFHUk8lMjBTRVJWSUNFUy92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiwgdHlwZSBQbHVnaW4gfSBmcm9tICd2aXRlJ1xyXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXHJcblxyXG5cclxuZnVuY3Rpb24gdmVyY2VsQXBpRGV2UGx1Z2luKCk6IFBsdWdpbiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6ICd2ZXJjZWwtYXBpLWRldi1zZXJ2ZXInLFxyXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xyXG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKGFzeW5jIChyZXE6IGFueSwgcmVzOiBhbnksIG5leHQ6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IFtwYXRoT25seSwgcmF3UXVlcnldID0gKHJlcS51cmwgfHwgJycpLnNwbGl0KCc/JylcclxuICAgICAgICBpZiAoIXBhdGhPbmx5LnN0YXJ0c1dpdGgoJy9hcGkvJykgJiYgcGF0aE9ubHkgIT09ICcvYXBpJykge1xyXG4gICAgICAgICAgcmV0dXJuIG5leHQoKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHJhd1F1ZXJ5IHx8ICcnKVxyXG4gICAgICAgIHJlcS5xdWVyeSA9IE9iamVjdC5mcm9tRW50cmllcyhxdWVyeVBhcmFtcy5lbnRyaWVzKCkpXHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBpZiAoWydQT1NUJywgJ1BVVCcsICdQQVRDSCcsICdERUxFVEUnXS5pbmNsdWRlcyhyZXEubWV0aG9kIHx8ICcnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBidWZmZXJzOiBCdWZmZXJbXSA9IFtdXHJcbiAgICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgcmVxKSB7XHJcbiAgICAgICAgICAgICAgYnVmZmVycy5wdXNoKEJ1ZmZlci5pc0J1ZmZlcihjaHVuaykgPyBjaHVuayA6IEJ1ZmZlci5mcm9tKGNodW5rKSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoYnVmZmVycy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgcmF3Qm9keSA9IEJ1ZmZlci5jb25jYXQoYnVmZmVycykudG9TdHJpbmcoJ3V0Zi04JylcclxuICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgcmVxLmJvZHkgPSBKU09OLnBhcnNlKHJhd0JvZHkpXHJcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICByZXEuYm9keSA9IHJhd0JvZHlcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICByZXMuc3RhdHVzID0gKGNvZGU6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXMuc3RhdHVzQ29kZSA9IGNvZGVcclxuICAgICAgICAgICAgcmV0dXJuIHJlc1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmVzLmpzb24gPSAoZGF0YTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJylcclxuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShkYXRhKSlcclxuICAgICAgICAgICAgcmV0dXJuIHJlc1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGNvbnN0IG1vZCA9IGF3YWl0IHNlcnZlci5zc3JMb2FkTW9kdWxlKCcuL2FwaS9pbmRleC50cycpXHJcbiAgICAgICAgICBpZiAobW9kICYmIHR5cGVvZiBtb2QuZGVmYXVsdCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBhd2FpdCBtb2QuZGVmYXVsdChyZXEsIHJlcylcclxuICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA0MDRcclxuICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJylcclxuICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBBUEkgcm91dGUgbm90IGZvdW5kOiAke3BhdGhPbmx5fWAgfSkpXHJcbiAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgZXhlY3V0aW5nIEFQSSByb3V0ZXI6YCwgZXJyKVxyXG4gICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA1MDBcclxuICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJylcclxuICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pKVxyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcclxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKVxyXG4gIE9iamVjdC5hc3NpZ24ocHJvY2Vzcy5lbnYsIGVudilcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGVudlByZWZpeDogWydWSVRFXycsICdORVhUX1BVQkxJQ18nXSxcclxuICAgIHBsdWdpbnM6IFtcclxuICAgICAgcmVhY3QoKSxcclxuICAgICAgdmVyY2VsQXBpRGV2UGx1Z2luKCksXHJcbiAgICBWaXRlUFdBKHtcclxuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXHJcbiAgICAgIGluamVjdFJlZ2lzdGVyOiAnYXV0bycsXHJcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcclxuICAgICAgICAnbG9nby5wbmcnLFxyXG4gICAgICAgICdwd2EtMTkyeDE5Mi5wbmcnLFxyXG4gICAgICAgICdwd2EtNTEyeDUxMi5wbmcnLFxyXG4gICAgICAgICdtYXNrYWJsZS1pY29uLTUxMng1MTIucG5nJyxcclxuICAgICAgICAncHJvZHVjdC1wbGFjZWhvbGRlci5zdmcnLFxyXG4gICAgICAgICdyb2JvdHMudHh0JyxcclxuICAgICAgXSxcclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBuYW1lOiAnU2VsdmFra29kaSBBZ3JvIFNlcnZpY2UgQmlsbGluZycsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogJ1NlbHZha2tvZGkgQWdybycsXHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2VsdmFra29kaSBBZ3JvIFNlcnZpY2UgQmlsbGluZyBcdTIwMTMgUE9TLCBhZHZhbmNlIG9yZGVycywgY2F0YWxvZywgaW52b2ljZXMsIGFuZCBhbmFseXRpY3MuXCIsXHJcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjMkU3RDMyJyxcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI0ZBRkRGNicsXHJcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxyXG4gICAgICAgIG9yaWVudGF0aW9uOiAnYW55JyxcclxuICAgICAgICBzdGFydF91cmw6ICcvJyxcclxuICAgICAgICBzY29wZTogJy8nLFxyXG4gICAgICAgIGljb25zOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHNyYzogJy9wd2EtMTkyeDE5Mi5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgcHVycG9zZTogJ2FueScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICcvcHdhLTUxMng1MTIucG5nJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiAnL21hc2thYmxlLWljb24tNTEyeDUxMi5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzUxMng1MTInLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgcHVycG9zZTogJ21hc2thYmxlJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgd29ya2JveDoge1xyXG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2ZyxqcGVnLGpwZyx3b2ZmLHdvZmYyfSddLFxyXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2tEZW55bGlzdDogWy9eXFwvYXBpLywgL15cXC9hZG1pbi8sIC9zdXBhYmFzZS9dLFxyXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvLipcXC5zdXBhYmFzZVxcLmNvXFwvLiovaSxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ05ldHdvcmtPbmx5JyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC9hcGlcXC8uKi9pLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC9mb250c1xcLmdvb2dsZWFwaXNcXC5jb21cXC8uKi9pLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZ29vZ2xlLWZvbnRzLXN0eWxlc2hlZXRzJyxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nc3RhdGljXFwuY29tXFwvLiovaSxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZ29vZ2xlLWZvbnRzLXdlYmZvbnRzJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAzMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgXSxcclxuICBidWlsZDoge1xyXG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgbWFudWFsQ2h1bmtzOiAoaWQ6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgaWYgKCFpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzJykpIHJldHVyblxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAc3VwYWJhc2UnKSkgcmV0dXJuICdzdXBhYmFzZSdcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnZnJhbWVyLW1vdGlvbicpKSByZXR1cm4gJ21vdGlvbidcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVjaGFydHMnKSB8fCBpZC5pbmNsdWRlcygnZDMtJykgfHwgaWQuaW5jbHVkZXMoJ3JlYWN0LXNtb290aCcpIHx8IGlkLmluY2x1ZGVzKCd2aWN0b3J5LScpKSByZXR1cm4gJ2NoYXJ0cydcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVhY3Qtcm91dGVyJykpIHJldHVybiAncm91dGVyJ1xyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdsdWNpZGUtcmVhY3QnKSkgcmV0dXJuICdpY29ucydcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnd29ya2JveCcpIHx8IGlkLmluY2x1ZGVzKCd2aXRlLXBsdWdpbi1wd2EnKSkgcmV0dXJuICdwd2EnXHJcbiAgICAgICAgICByZXR1cm4gJ3ZlbmRvcidcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG4gIG9wdGltaXplRGVwczoge1xyXG4gICAgZXNidWlsZE9wdGlvbnM6IHtcclxuICAgICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgIH0sXHJcbiAgfSxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ1gtQ29udGVudC1UeXBlLU9wdGlvbnMnOiAnbm9zbmlmZicsXHJcbiAgICAgICAgJ1gtRnJhbWUtT3B0aW9ucyc6ICdERU5ZJyxcclxuICAgICAgICAnUmVmZXJyZXItUG9saWN5JzogJ3N0cmljdC1vcmlnaW4td2hlbi1jcm9zcy1vcmlnaW4nLFxyXG4gICAgICAgICdQZXJtaXNzaW9ucy1Qb2xpY3knOiAnY2FtZXJhPSgpLCBtaWNyb3Bob25lPSgpLCBnZW9sb2NhdGlvbj0oKScsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH1cclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEyUSxTQUFTLGNBQWMsZUFBNEI7QUFDOVQsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUd4QixTQUFTLHFCQUE2QjtBQUNwQyxTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixnQkFBZ0IsUUFBUTtBQUN0QixhQUFPLFlBQVksSUFBSSxPQUFPLEtBQVUsS0FBVSxTQUFjO0FBQzlELGNBQU0sQ0FBQyxVQUFVLFFBQVEsS0FBSyxJQUFJLE9BQU8sSUFBSSxNQUFNLEdBQUc7QUFDdEQsWUFBSSxDQUFDLFNBQVMsV0FBVyxPQUFPLEtBQUssYUFBYSxRQUFRO0FBQ3hELGlCQUFPLEtBQUs7QUFBQSxRQUNkO0FBRUEsY0FBTSxjQUFjLElBQUksZ0JBQWdCLFlBQVksRUFBRTtBQUN0RCxZQUFJLFFBQVEsT0FBTyxZQUFZLFlBQVksUUFBUSxDQUFDO0FBRXBELFlBQUk7QUFDRixjQUFJLENBQUMsUUFBUSxPQUFPLFNBQVMsUUFBUSxFQUFFLFNBQVMsSUFBSSxVQUFVLEVBQUUsR0FBRztBQUNqRSxrQkFBTSxVQUFvQixDQUFDO0FBQzNCLDZCQUFpQixTQUFTLEtBQUs7QUFDN0Isc0JBQVEsS0FBSyxPQUFPLFNBQVMsS0FBSyxJQUFJLFFBQVEsT0FBTyxLQUFLLEtBQUssQ0FBQztBQUFBLFlBQ2xFO0FBQ0EsZ0JBQUksUUFBUSxTQUFTLEdBQUc7QUFDdEIsb0JBQU0sVUFBVSxPQUFPLE9BQU8sT0FBTyxFQUFFLFNBQVMsT0FBTztBQUN2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
