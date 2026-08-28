import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const PORT = Number(process.env.PORT) || 1000;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: PORT,
  },
});
