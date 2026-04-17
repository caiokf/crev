import { defineConfig } from "tsup"
import pkg from "./package.json"

export default defineConfig({
  entry: ["src/bin.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    CREV_VERSION: JSON.stringify(pkg.version),
  },
})
