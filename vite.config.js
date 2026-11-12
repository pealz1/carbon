/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { readdirSync, readFileSync } from "node:fs";
const host = process.env.TAURI_DEV_HOST;

const DICT = "node_modules/@sglkc/kuromoji/dict/";

/**
 * kuromoji's Japanese dictionary (lyrics romanisation) as files of the app itself, at /kuromoji/.
 * Served by hand in dev: Vite's static server marks .gz files `Content-Encoding: gzip`, so the
 * webview would unpack them before kuromoji does.
 * @returns {import("vite").Plugin}
 */
function kuromojiDictionary() {
  return {
    name: "carbon-kuromoji-dictionary",
    configureServer(server) {
      server.middlewares.use("/kuromoji/", (req, res, next) => {
        const url = /** @type {{ url?: string }} */ (req).url ?? ""; // no @types/node here
        const name = url.slice(1).split("?")[0];
        if (!/^[a-z_]+\.dat\.gz$/.test(name)) return next();
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(readFileSync(DICT + name));
      });
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const name of readdirSync(DICT)) {
        this.emitFile({ type: "asset", fileName: `kuromoji/${name}`, source: readFileSync(DICT + name) });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [kuromojiDictionary(), sveltekit()],

  // The SDK in packages/ and the private backend in cloud/ have their own test runs.
  test: {
    exclude: [...configDefaults.exclude, "packages/**", "cloud/**", ".claude/**"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
