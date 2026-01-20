import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/AdmireLED/', // <--- ADD THIS LINE (Must match your Repo Name exactly)
  esbuild: {
    drop: ['console', 'debugger'],
  },
})