// vite.config.js
import { defineConfig } from "vite"
import { fileURLToPath, URL } from "url"
import postcss from "./postcss.config.js"
import react from "@vitejs/plugin-react"
import image from "@rollup/plugin-image"

export default defineConfig({
  plugins: [react(), image()],
  define: {
    // In dev, we need to disable this, but in prod, we need to enable it
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  css: {
    postcss
  },
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
    lib: {
      entry: "src/main.jsx",
      name: "EmbeddedAlata",
      formats: ["umd"],
      fileName: (_format) => `alata-chat-widget.js`
    },
    rollupOptions: {
      external: [
        // Reduces transformation time by 50% and we don't even use this variant, so we can ignore.
        /@phosphor-icons\/react\/dist\/ssr/
      ],
      output: {
        // The widget is consumed as one script tag by host pages, so keep dynamic imports in the UMD file.
        inlineDynamicImports: true
      }
    },
    commonjsOptions: {
      transformMixedEsModules: true
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2
      },
      format: {
        comments: false
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "",
    sourcemap: false
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis"
      },
      plugins: []
    }
  }
})
