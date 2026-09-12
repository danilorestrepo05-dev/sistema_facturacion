// src/components/BadgeEstadoDian.jsx
// Etiqueta visual del estado de un documento ante la DIAN. Reutilizado en la
// lista de Facturas y en el modal de emisión de Caja.
//
//   local     -> emitida pero aún no enviada/aprobada (se puede reintentar)
//   enviada   -> enviada a la DIAN, pendiente de validación
//   aprobada  -> aceptada por la DIAN
//   rechazada -> rechazada por la DIAN (se puede corregir y reintentar)
//   null/--   -> la instalación no emite electrónicamente (o aún no se procesó)
import { Badge } from 'react-bootstrap';

const MAPA = {
  local:     { texto: 'Local', bg: 'warning' },
  enviada:   { texto: 'Enviada', bg: 'primary' },
  aprobada:  { texto: 'Aprobada', bg: 'success' },
  rechazada: { texto: 'Rechazada', bg: 'danger' }
};

const BadgeEstadoDian = ({ estado }) => {
  const item = MAPA[estado];
  if (!item) return <Badge bg="secondary">Sin DIAN</Badge>;
  return <Badge bg={item.bg}>{item.texto}</Badge>;
};

export default BadgeEstadoDian;
