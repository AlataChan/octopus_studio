import { defineConfig } from "vite"
import { fileURLToPath, URL } from "url"
import postcss from "./postcss.config.js"
import react from "@vitejs/plugin-react"
import dns from "dns"
import { visualizer } from "rollup-plugin-visualizer"

dns.setDefaultResultOrder("verbatim")

const dependencyChunkRules = [
  {
    name: "vendor-react",
    packages: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "scheduler"
    ]
  },
  {
    name: "vendor-icons",
    packages: ["@phosphor-icons/react"]
  },
  {
    name: "vendor-i18n",
    packages: ["i18next", "react-i18next", "i18next-browser-languagedetector"]
  },
  {
    name: "vendor-toast",
    packages: ["react-toastify"]
  },
  {
    name: "vendor-graph-core",
    packages: ["cytoscape"]
  },
  {
    name: "vendor-graph-layout",
    packages: ["cytoscape-fcose", "cose-base", "layout-base"]
  },
  {
    name: "vendor-recharts",
    packages: ["recharts", "recharts-to-png"]
  },
  {
    name: "vendor-tremor",
    packages: ["@tremor/react"]
  },
  {
    name: "vendor-d3",
    packages: ["victory-vendor"]
  },
  {
    name: "vendor-markdown",
    packages: ["markdown-it", "linkify-it", "mdurl", "uc.micro", "entities"]
  },
  {
    name: "vendor-purify",
    packages: ["dompurify"]
  },
  {
    name: "vendor-piper-tts",
    packages: [
      "@mintplex-labs/piper-tts-web",
      "onnxruntime-web",
      "onnxruntime-common",
      "flatbuffers"
    ]
  },
  {
    name: "vendor-katex",
    packages: ["katex"]
  },
  {
    name: "vendor-highlight-core",
    packages: ["highlight.js"]
  }
]

const sourceChunkRules = [
  {
    name: "route-llm-preferences",
    paths: [
      "/src/components/LLMSelection/",
      "/src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/",
      "/src/pages/GeneralSettings/LLMPreference/",
      "/src/hooks/useGetProvidersModels.js",
      "/src/hooks/useProviderEndpointAutoDiscovery.js"
    ]
  }
]

function packageNameFromModuleId(id) {
  const normalizedId = id.split("\\").join("/")
  const marker = "/node_modules/"
  const index = normalizedId.lastIndexOf(marker)
  if (index === -1) return null

  const segments = normalizedId.slice(index + marker.length).split("/")
  if (segments[0]?.startsWith("@")) return `${segments[0]}/${segments[1]}`
  return segments[0]
}

function manualChunks(id) {
  const normalizedId = id.split("\\").join("/")
  if (normalizedId.includes("commonjsHelpers")) {
    return "vendor-commonjs"
  }

  for (const rule of sourceChunkRules) {
    if (rule.paths.some((path) => normalizedId.includes(path))) {
      return rule.name
    }
  }

  if (normalizedId.includes("/node_modules/highlight.js/lib/languages/")) {
    return "vendor-highlight-languages"
  }

  const packageName = packageNameFromModuleId(id)
  if (!packageName) return undefined

  for (const rule of dependencyChunkRules) {
    if (rule.packages.includes(packageName)) return rule.name
  }

  if (packageName.startsWith("d3-")) return "vendor-d3"

  // Let Rollup place unclassified dependencies with their importers. A broad
  // catch-all vendor chunk can create circular vendor-react <-> vendor-misc
  // dependencies and leave React uninitialized during production startup.
  return undefined
}

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: [
    "./public/piper/ort-wasm-simd-threaded.wasm",
    "./public/piper/piper_phonemize.wasm",
    "./public/piper/piper_phonemize.data"
  ],
  worker: {
    format: "es"
  },
  server: {
    port: 3000,
    host: "localhost",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        // WebSocket 代理配置 - 用于 Agent 模式
        ws: true,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("[Vite Proxy] Error:", err)
          })
          proxy.on("proxyReqWs", (_proxyReq, req, _socket, _options, _head) => {
            console.log("[Vite Proxy] WebSocket request:", req.url)
          })
        }
      }
    }
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    )
  },
  css: {
    postcss
  },
  plugins: [
    react(),
    visualizer({
      template: "treemap", // or sunburst
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: "bundleinspector.html" // will be saved in project's root
    })
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url))
      },
      {
        process: "process/browser",
        stream: "stream-browserify",
        zlib: "browserify-zlib",
        util: "util",
        find: /^~.+/,
        replacement: (val) => {
          return val.replace(/^~/, "")
        }
      }
    ]
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // These settings ensure the primary JS and CSS file references are always index.{js,css}
        // so we can SSR the index.html as text response from server/index.js without breaking references each build.
        entryFileNames: "index.js",
        manualChunks,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "index.css") return `index.css`
          return assetInfo.name
        }
      },
      external: [
        // Reduces transformation time by 50% and we don't even use this variant, so we can ignore.
        /@phosphor-icons\/react\/dist\/ssr/
      ]
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "i18next",
      "react-i18next",
      "zustand"
    ],
    esbuildOptions: {
      define: {
        global: "globalThis"
      },
      plugins: []
    }
  }
})
