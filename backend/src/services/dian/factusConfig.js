// src/services/dian/factusConfig.js
// Configuración y resolución de credenciales del proveedor Factus.
//
// Las VARIABLES DE ENTORNO (.env) son la fuente de verdad para los SECRETOS
// (client_id y client_secret): nunca se guardan en la base de datos ni se
// versionan, siguiendo el filtro de seguridad antimunition del proyecto.
//
// El resto (ambiente sandbox/producción) puede venir de .env o de la tabla de
// configuración. Si no hay credenciales configuradas, la emisión real no puede
// hacerse y el flujo cae al cola offline (la venta queda en estado "local").
const dotenv = require('dotenv');
dotenv.config();

// ambientes soportados por Factus
const AMBIENTES = {
  sandbox: 'https://api-sandbox.factus.com.co',
  produccion: 'https://api.factus.com.co'
};

// Lee una clave de las variables de entorno; recibe también el mapa de
// configuración de la BD para usarlo como respaldo.
const leer = (env, config, clave) => {
  const desdeEnv = process.env[env];
  if (desdeEnv !== undefined && desdeEnv !== '') return desdeEnv;
  return config ? config[clave] : undefined;
};

// Resuelve la configuración de Factus combinando .env y la tabla de config.
// Devuelve { ambiente, urlBase, clientId, clientSecret, habilitado }.
const resolverConfig = async (config = {}) => {
  // El ambiente decide la URL base del proveedor.
  const ambiente = String(
    leer('FACTUS_AMBIENTE', config, 'factus_ambiente') || 'sandbox'
  ).toLowerCase() === 'produccion' ? 'produccion' : 'sandbox';

  const clientId = leer('FACTUS_CLIENT_ID', config, 'factus_client_id');
  const clientSecret = leer('FACTUS_CLIENT_SECRET', config, 'factus_client_secret');

  return {
    ambiente,
    urlBase: AMBIENTES[ambiente],
    clientId,
    clientSecret,
    // Indica si hay credenciales suficientes para emitir contra el proveedor real.
    habilitado: Boolean(clientId && clientSecret)
  };
};

module.exports = { resolverConfig, AMBIENTES };
