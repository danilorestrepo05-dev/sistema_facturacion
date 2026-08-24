// src/utils/paginacion.js
// Utilidades de paginación para los listados de la API.
// La paginación es OPT-IN: solo se activa cuando la petición envía ?por_pagina=N.
// Así las vistas que necesitan el catálogo completo (selectores de Caja/Compras)
// siguen recibiendo todo, y las vistas de gestión piden página por página.
// El total se comunica en cabeceras para no romper el formato JSON actual:
//   X-Total-Registros, X-Pagina, X-Paginas

// Lee pagina/por_pagina de la petición. Devuelve null si no hay paginación.
const leerPaginacion = (req, porDefecto = 20, maximo = 200) => {
  if (req.query.por_pagina === undefined || req.query.por_pagina === '') return null;

  let porPagina = parseInt(req.query.por_pagina, 10);
  if (!Number.isFinite(porPagina) || porPagina < 1) porPagina = porDefecto;
  if (porPagina > maximo) porPagina = maximo;

  let pagina = parseInt(req.query.pagina, 10);
  if (!Number.isFinite(pagina) || pagina < 1) pagina = 1;

  return { pagina, porPagina, offset: (pagina - 1) * porPagina };
};

// Escribe las cabeceras de paginación en la respuesta.
const enviarCabeceras = (res, { pagina, porPagina, total }) => {
  res.set('X-Total-Registros', String(total));
  res.set('X-Pagina', String(pagina));
  res.set('X-Paginas', String(Math.max(1, Math.ceil(total / porPagina))));
};

module.exports = { leerPaginacion, enviarCabeceras };
