// src/utils/format.js
// Utilidades de formato para la interfaz.

// Formatea un número como moneda, p. ej. $ 52.000
export const formatoMoneda = (valor) =>
  `$ ${Number(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Convierte 'YYYY-MM-DD HH:mm:ss' a 'DD/MM/YYYY HH:mm'
export const formatoFechaHora = (fechaSql) => {
  if (!fechaSql) return '';
  const [fecha, hora] = String(fechaSql).split(' ');
  const [a, m, d] = (fecha || '').split('-');
  return `${d}/${m}/${a}${hora ? ` ${hora}` : ''}`;
};

// Genera un arreglo con las últimas N fechas en formato YYYY-MM-DD.
export const ultimosDias = (dias) => {
  const fechas = [];
  const hoy = new Date();
  for (let i = dias - 1; i >= 0; i -= 1) {
    const f = new Date(hoy);
    f.setDate(f.getDate() - i);
    const mes = String(f.getMonth() + 1).padStart(2, '0');
    const dia = String(f.getDate()).padStart(2, '0');
    fechas.push(`${f.getFullYear()}-${mes}-${dia}`);
  }
  return fechas;
};

// Convierte YYYY-MM-DD a DD/MM
export const formatoCorto = (fechaSql) => {
  if (!fechaSql) return '';
  const [, m, d] = String(fechaSql).split('-');
  return `${d}/${m}`;
};

// Fecha de hoy en hora LOCAL (YYYY-MM-DD). NO usar toISOString(): devuelve
// la fecha en UTC y en zonas horarias negativas (ej. Colombia UTC-5) el día
// puede adelantarse por la noche.
export const fechaHoyLocal = () => {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
};
