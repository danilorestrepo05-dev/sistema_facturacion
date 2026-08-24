// src/../scripts/semilla-productos-prueba.js
// Crea 20 productos de prueba para verificar el POS con catálogos grandes.
// Es idempotente: si un producto con el mismo nombre ya existe, lo salta.
// Uso: node scripts/semilla-productos-prueba.js
const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const CANTIDAD = 20;

async function peticion(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: respuesta.status, datos: await respuesta.json().catch(() => null) };
}

async function main() {
  const login = await peticion('POST', '/auth/login', null, {
    nombre_usuario: 'admin', contrasena: 'admin123'
  });
  if (login.status !== 200) {
    console.error('No se pudo iniciar sesión como admin:', login.datos?.mensaje);
    process.exitCode = 1;
    return;
  }
  const token = login.datos.datos.token;

  // Reutiliza la primera categoría e impuesto activos; si no hay, se omiten.
  const [cats, imps] = await Promise.all([
    peticion('GET', '/categorias', token),
    peticion('GET', '/impuestos', token)
  ]);
  const categoria = (cats.datos.datos || []).find((c) => c.activo === 1);
  const impuesto = (imps.datos.datos || []).find((i) => i.activo === 1);

  let creados = 0, existentes = 0, errores = 0;
  for (let n = 1; n <= CANTIDAD; n++) {
    const nombre = `Producto Test ${String(n).padStart(2, '0')}`;
    const busqueda = await peticion('GET', `/productos?termino=${encodeURIComponent(nombre)}`, token);
    const yaEsta = (busqueda.datos.datos || []).some((p) => p.nombre === nombre);
    if (yaEsta) { existentes++; continue; }

    const venta = 1500 + n * 250;
    const cuerpo = {
      nombre,
      precio_compra: Math.round(venta * 0.6),
      precio_venta: venta,
      stock_actual: 40,
      stock_minimo: 5,
      unidad_medida: 'unidad',
      activo: 1
    };
    if (categoria) cuerpo.categoria_id = categoria.id;
    if (impuesto) cuerpo.impuesto_id = impuesto.id;

    const alta = await peticion('POST', '/productos', token, cuerpo);
    if (alta.status === 201) { creados++; } else { errores++; console.error(`Error con ${nombre}:`, alta.status, alta.datos?.mensaje); }
  }
  console.log(`Semilla lista: ${creados} creados, ${existentes} ya existían, ${errores} errores.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
