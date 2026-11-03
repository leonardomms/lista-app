import { defineConfig } from "vite";

/* base relativa: o mesmo dist serve no APK/OTA e numa subpasta da web (ex.: GitHub Pages) */
export default defineConfig({ base: "./" });
