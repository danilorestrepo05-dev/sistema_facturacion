// src/services/backup.js
// Descarga un backup de la base de datos como archivo .sql usando axios
// (que adjunta el token JWT automáticamente).
import api from './api';

// Solicita el backup y lo guarda como archivo .sql en la descarga del navegador.
export const descargarBackup = async () => {
  const respuesta = await api.get('/backup', { responseType: 'blob' });

  // Si el servidor responde JSON (error) se lanza un Error con su mensaje.
  if (respuesta.data.type.includes('json')) {
    const texto = await respuesta.data.text();
    let mensaje = 'Error al generar el backup';
    try {
      const cuerpo = JSON.parse(texto);
      if (cuerpo.mensaje) mensaje = cuerpo.mensaje;
    } catch {
      // Se conserva el mensaje genérico.
    }
    const error = new Error(mensaje);
    error.mensaje = mensaje;
    throw error;
  }

  // Extrae el nombre del archivo del encabezado Content-Disposition.
  const disposicion = respuesta.headers['content-disposition'] || '';
  const coincidencia = disposicion.match(/filename="?([^"]+)"?/i);
  const nombre = coincidencia ? coincidencia[1] : `backup-${Date.now()}.sql`;

  const url = window.URL.createObjectURL(
    new Blob([respuesta.data], { type: 'application/sql' })
  );
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
};
