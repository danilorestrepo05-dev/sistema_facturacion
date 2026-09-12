// frontend/src/components/AlertaAuto.jsx
// Alerta flotante con auto-cierre (5 s por defecto) que se muestra por encima de
// los modales (Bootstrap usa z-index 1050; aquí 3000) y no desplaza el layout.
// Se usa para los avisos globales de error/éxito de cada vista.
import { useEffect } from 'react';
import { Alert } from 'react-bootstrap';

const TIEMPO_CIERRE_DEFECTO = 5000;

const AlertaAuto = ({ variante = 'danger', mensaje, onCerrar, duracion = TIEMPO_CIERRE_DEFECTO }) => {
  // El temporizador se renueva si cambia el mensaje y se limpia al desmontar.
  useEffect(() => {
    if (!mensaje) return undefined;
    const temporizador = setTimeout(onCerrar, duracion);
    return () => clearTimeout(temporizador);
  }, [mensaje, onCerrar, duracion]);

  if (!mensaje) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '70px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 3000,
      minWidth: 'min(90vw, 420px)',
      maxWidth: '90vw'
    }}>
      <Alert variant={variante} dismissible onClose={onCerrar} className="mb-0 shadow">
        {mensaje}
      </Alert>
    </div>
  );
};

export default AlertaAuto;