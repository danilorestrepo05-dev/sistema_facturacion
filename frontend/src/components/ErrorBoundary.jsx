// src/components/ErrorBoundary.jsx
// Atrapa errores de renderizado para evitar que la aplicación quede en
// pantalla blanca. Muestra un mensaje amigable y permite recargar.
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hayError: false, mensajeError: '' };
  }

  static getDerivedStateFromError(error) {
    return { hayError: true, mensajeError: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    // Se registra en consola para diagnóstico.
    console.error('Error de renderizado:', error, info);
  }

  render() {
    if (this.state.hayError) {
      return (
        <div className="app-main d-flex align-items-center justify-content-center">
          <div className="text-center p-4">
            <div className="display-4 mb-3 text-warning"><i className="bi bi-exclamation-triangle-fill"></i></div>
            <h4>Ocurrió un error inesperado</h4>
            <p className="text-secondary mb-4">
              Algo salió mal al mostrar esta sección. Puedes recargar la página para continuar.
            </p>
            <button
              type="button"
              className="btn btn-primary mb-3"
              onClick={() => window.location.reload()}
            >
              <i className="bi bi-arrow-clockwise me-1"></i>Recargar
            </button>
            <div className="text-start mx-auto" style={{ maxWidth: '520px' }}>
              <details className="text-secondary small">
                <summary className="text-primary">Detalle técnico (para soporte)</summary>
                <pre className="p-2 mt-2 mb-0 border rounded bg-light text-danger" style={{ whiteSpace: 'pre-wrap' }}>
                  {this.state.mensajeError}
                </pre>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
