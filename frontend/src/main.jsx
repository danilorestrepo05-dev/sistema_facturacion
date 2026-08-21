// src/main.jsx
// Punto de entrada del frontend. Carga estilos de Bootstrap y monta la aplicación.
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { CarritoProvider } from './context/CarritoContext';
import { ConfigProvider } from './context/ConfigContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <CarritoProvider>
          <ConfigProvider>
            <App />
          </ConfigProvider>
        </CarritoProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
