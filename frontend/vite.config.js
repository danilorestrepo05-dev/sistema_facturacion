// vite.config.js
// Configuración de Vite para el frontend.
// El proxy redirige las peticiones /api hacia el backend en el puerto 3000,
// evitando problemas de CORS durante el desarrollo.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
});
