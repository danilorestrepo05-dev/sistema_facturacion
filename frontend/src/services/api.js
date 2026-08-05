// src/services/api.js
// Instancia de Axios conectada a la API.
// Usa rutas relativas (/api/v1) y el proxy de Vite hacia el backend.
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000
});

// Adjunta automáticamente el token JWT guardado a cada petición.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
