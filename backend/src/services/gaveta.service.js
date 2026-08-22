// src/services/gaveta.service.js
// Apertura de la gaveta de dinero mediante el comando ESC/POS "kick" (ESC p).
// La gaveta se conecta a la impresora térmica con un cable RJ11/RJ12: al recibir
// estos bytes, la impresora envía un pulso eléctrico por el pin y la gaveta abre.
// El transporte depende de la configuración (tabla configuraciones):
//   - simulacion : desarrollo sin hardware; no envía nada y responde { simulado }.
//   - red        : térmica con IP propia en la red local (cola raw, puerto 9100).
//   - compartida : impresora compartida de Windows (ruta \\equipo\impresora);
//                  el buffer binario se escribe directo en la cola.
const net = require('net');
const fs = require('fs');
const configModel = require('../models/config.model');

// Comando kick: ESC p m t1 t2 (m=0 → pin 2). t1/t2 van en unidades de 2 ms:
// encendido 25*2=50 ms y apagado 250*2=500 ms (valores estándar Epson compatibles,
// soportado por la mayoría de térmicas POS del mercado).
const construirKick = () => Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

// Abre la gaveta según gaveta_modo / gaveta_direccion configurados.
// Devuelve un resumen de lo ejecutado (para auditoría en la respuesta HTTP).
const abrir = async () => {
  const config = await configModel.listarMapa();
  const modo = String(config.gaveta_modo || 'simulacion').toLowerCase().trim();
  const direccion = String(config.gaveta_direccion || '').trim();

  // Modo simulación: no hay hardware, solo se confirma qué se enviaría.
  if (modo === 'simulacion') {
    return { simulado: true, modo, bytes: construirKick().length };
  }

  // Los modos reales exigen una dirección de impresora.
  if (!direccion) {
    const error = new Error('No hay dirección de impresora configurada (clave gaveta_direccion)');
    error.status = 409;
    throw error;
  }

  if (modo === 'red') {
    await enviarPorRed(direccion);
    return { simulado: false, modo, destino: direccion };
  }

  if (modo === 'compartida') {
    await new Promise((resolver, rechazar) => {
      fs.writeFile(direccion, construirKick(), (err) => (err ? rechazar(err) : resolver()));
    });
    return { simulado: false, modo, destino: direccion };
  }

  const error = new Error(`Modo de gaveta desconocido: "${modo}"`);
  error.status = 400;
  throw error;
};

// Envía el kick por TCP a la cola raw de la impresora (puerto 9100 por defecto).
const enviarPorRed = (direccion) =>
  new Promise((resolver, rechazar) => {
    const [host, puerto] = separarHostPuerto(direccion);
    const socket = net.createConnection({ host, port: puerto });

    const fallar = (err) => {
      socket.destroy();
      rechazar(new Error(`No se pudo conectar con ${host}:${puerto} (${err.message})`));
    };

    socket.setTimeout(4000, () => fallar(new Error('tiempo de espera agotado')));
    socket.on('error', fallar);
    socket.on('connect', () => {
      // end() escribe el buffer y cierra la conexión cuando termina.
      socket.end(construirKick(), () => resolver());
    });
  });

// Separa "192.168.1.50:9100" en host y puerto (9100 si no se indica).
const separarHostPuerto = (direccion) => {
  const partes = direccion.split(':');
  return [partes[0].trim(), Number(partes[1]) || 9100];
};

module.exports = { construirKick, abrir };
