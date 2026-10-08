import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const shopifyAppUrl =
  process.env.SHOPIFY_APP_URL || "";

let host = "localhost";

try {
  if (shopifyAppUrl) {
    host = new URL(
      shopifyAppUrl
    ).hostname;
  }
} catch {
  host = "localhost";
}

const isLocalhost =
  host === "localhost" ||
  host === "127.0.0.1";

const hmrConfig = isLocalhost
  ? {
      protocol: "ws",
      host: "localhost",
      port: 64999,
      clientPort: 64999,
    }
  : {
      protocol: "wss",
      host,
      port: Number(
        process.env.FRONTEND_PORT ||
          8002
      ),
      clientPort: 443,
    };

export default defineConfig({
  server: {
    /*
     * Shopify CLI uses changing Cloudflare
     * Quick Tunnel hostnames during `app dev`.
     *
     * The leading dot allows subdomains of
     * trycloudflare.com, such as:
     *
     * abc.trycloudflare.com
     * xyz.trycloudflare.com
     */
    allowedHosts: [
      ".trycloudflare.com",
      host,
    ],

    cors: {
      preflightContinue: true,
    },

    port: Number(
      process.env.PORT ||
        3000
    ),

    hmr: hmrConfig,

    fs: {
      allow: [
        "app",
        "node_modules",
      ],
    },
  },

  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],

  build: {
    assetsInlineLimit: 0,
  },

  optimizeDeps: {
    include: [
      "@shopify/app-bridge-react",
    ],
  },
});