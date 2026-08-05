// scripts/test-tipo-item.js
// Prueba de integración del campo tipo_item en proveedores (v0.9.5).
// Inicia el servidor, hace login, crea/actualiza/busca/elimina un proveedor.
const { spawn } = require('child_process');
const path = require('path');

const PUERTO = 3456;
const BASE = `http://127.0.0.1:${PUERTO}/api/v1`;
const NOMBRE_TEST = `Proveedor Test ${Date.now()}`;
const TIPO_TEST = 'Café, pasilla, azúcar';

// Levanta el servidor en un puerto de prueba para no chocar con el de desarrollo.
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(PUERTO) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function peticion(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: respuesta.status, datos: await respuesta.json() };
}

async function main() {
  await espera(1500);

  // 1. Login admin.
  const login = await peticion('POST', '/auth/login', null, { nombre_usuario: 'admin', contrasena: 'admin123' });
  if (login.status !== 200) throw new Error(`Login falló: ${JSON.stringify(login.datos)}`);
  const token = login.datos.datos.token;

  // 2. Crear proveedor con tipo_item.
  const creado = await peticion('POST', '/proveedores', token, {
    nombre: NOMBRE_TEST, tipo_documento: 'NIT', documento: `900${Date.now() % 100000}`,
    telefono: '3000000000', email: 'test@test.co', direccion: 'Calle 1', tipo_item: TIPO_TEST
  });
  if (creado.status !== 201) throw new Error(`Crear falló: ${JSON.stringify(creado.datos)}`);
  const id = creado.datos.datos.id;
  console.log('Creado con tipo_item =', JSON.stringify(creado.datos.datos.tipo_item));

  // 3. Buscar por término que coincide con tipo_item.
  const buscado = await peticion('GET', `/proveedores?termino=${encodeURIComponent('pasilla')}`, token);
  const encontrado = buscado.datos.datos.find((p) => p.id === id);
  if (!encontrado) throw new Error('Búsqueda por tipo_item no encontró el proveedor');
  console.log('Búsqueda por "pasilla" OK:', encontrado.nombre);

  // 4. Actualizar tipo_item (vacío -> NULL).
  const actualizado = await peticion('PUT', `/proveedores/${id}`, token, {
    nombre: NOMBRE_TEST, tipo_documento: 'NIT', documento: null, telefono: null,
    email: null, direccion: null, tipo_item: '  ', activo: 1
  });
  if (actualizado.datos.datos.tipo_item !== null) {
    throw new Error(`Se esperaba NULL al vaciar tipo_item, se obtuvo ${JSON.stringify(actualizado.datos.datos.tipo_item)}`);
  }
  console.log('tipo_item vacío normalizado a NULL OK');

  // 5. Actualizar tipo_item de nuevo y limpiar.
  await peticion('PUT', `/proveedores/${id}`, token, {
    nombre: NOMBRE_TEST, tipo_documento: 'NIT', tipo_item: 'Granos'
  });
  const borrado = await peticion('DELETE', `/proveedores/${id}`, token);
  if (borrado.status !== 200) throw new Error(`Eliminar falló: ${JSON.stringify(borrado.datos)}`);
  console.log('Limpieza OK');

  console.log('TEST TIPO_ITEM: TODOS LOS PASOS OK');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('FALLO:', err.message); process.exit(1); })
  .finally(() => server.kill());
