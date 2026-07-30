import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/firebase/")
            || id.includes("\\firebase\\")
            || id.includes("@firebase")
          ) return "vendor-firebase";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("\\d3-")) return "vendor-charts";
          if (
            id.includes("@radix-ui")
            || id.includes("lucide-react")
            || id.includes("cmdk")
            || id.includes("vaul")
            || id.includes("class-variance-authority")
            || id.includes("clsx")
            || id.includes("tailwind-merge")
          ) return "vendor-ui";
          if (
            id.includes("react-dom")
            || id.includes("/react/")
            || id.includes("\\react\\")
            || id.includes("scheduler")
            || id.includes("@tanstack/react-query")
            || id.includes("wouter")
          ) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
