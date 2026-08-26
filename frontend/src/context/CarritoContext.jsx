// src/context/CarritoContext.jsx
// Contexto del carrito de Caja: mantiene la venta en curso viva mientras el
// usuario navega entre módulos (el proveedor vive por encima del router y no
// se desmonta) y la respalda en sessionStorage para sobrevivir a un F5.
// Al cerrar sesión se vacía para que la venta pendiente de un cajero no
// aparezca en la sesión del siguiente.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const CLAVE_STORAGE = 'caja_en_curso';
// Canal por donde la ventana de Caja publica la venta en curso hacia la
// pantalla del cliente (visador). Funciona entre pestañas del mismo navegador,
// ideal para un segundo monitor conectado al mismo PC de caja.
const CANAL_VISADOR = 'visador-caja';

const CarritoContext = createContext(null);

// Estado inicial de una venta limpia.
const ventaVacia = () => ({ carrito: [], clienteId: '', tipoPago: 'efectivo', descuento: 0 });

// Recupera la venta en curso guardada en sessionStorage (si existe y es válida).
const leerStorage = () => {
  try {
    const crudo = sessionStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return ventaVacia();
    const datos = JSON.parse(crudo);
    return {
      carrito: Array.isArray(datos.carrito) ? datos.carrito : [],
      clienteId: datos.clienteId ?? '',
      tipoPago: datos.tipoPago || 'efectivo',
      descuento: datos.descuento ?? 0
    };
  } catch {
    return ventaVacia();
  }
};

export const CarritoProvider = ({ children }) => {
  const { usuario } = useAuth();
  const inicial = useMemo(leerStorage, []);

  const [carrito, setCarrito] = useState(inicial.carrito); // [{ producto_id, nombre, precio, impuestos, cantidad, stock, descuento }]
  const [clienteId, setClienteId] = useState(inicial.clienteId);
  const [tipoPago, setTipoPago] = useState(inicial.tipoPago);
  const [descuento, setDescuento] = useState(inicial.descuento);

  // Respalda la venta en curso en cada cambio (sobrevive navegación y F5).
  useEffect(() => {
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify({ carrito, clienteId, tipoPago, descuento }));
  }, [carrito, clienteId, tipoPago, descuento]);

  // Al cerrar sesión se descarta la venta pendiente.
  useEffect(() => {
    if (!usuario) {
      setCarrito([]);
      setClienteId('');
      setTipoPago('efectivo');
      setDescuento(0);
      sessionStorage.removeItem(CLAVE_STORAGE);
    }
  }, [usuario]);

  // Agrega un producto al carrito respetando el stock disponible.
  // El catálogo de impuestos del producto se convierte en el array inicial.
  const agregar = (producto) => {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === producto.id);
      if (existente) {
        if (existente.cantidad >= producto.stock_actual) return prev;
        return prev.map((i) =>
          i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      if (producto.stock_actual <= 0) return prev;
      // Impuestos del producto como array de objetos {id, nombre, porcentaje}.
      const impuestosIniciales = [];
      if (producto.impuesto_id && producto.impuesto_porcentaje != null) {
        impuestosIniciales.push({
          id: Number(producto.impuesto_id),
          nombre: producto.impuesto_nombre || '',
          porcentaje: Number(producto.impuesto_porcentaje)
        });
      }
      return [...prev, {
        producto_id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio_venta),
        impuestos: impuestosIniciales,
        impuesto_porcentaje: Number(producto.impuesto_porcentaje || 0), // compat visor
        cantidad: 1,
        stock: producto.stock_actual,
        descuento: 0
      }];
    });
  };

  // Cambia la cantidad de un ítem (0 lo elimina); topa con el stock conocido.
  const cambiarCantidad = (id, cantidad) => {
    const n = Math.max(0, Math.min(Number(cantidad) || 0, carrito.find((i) => i.producto_id === id)?.stock || 9999));
    setCarrito((prev) =>
      n === 0
        ? prev.filter((i) => i.producto_id !== id)
        : prev.map((i) => (i.producto_id === id ? { ...i, cantidad: n } : i))
    );
  };

  // Descuento por línea en $: nunca negativo. El tope superior (valor de la
  // línea) NO se aplica aquí para no pisar el valor mientras el usuario teclea;
  // se normaliza al salir del campo (blur) y el backend lo valida al emitir.
  const cambiarDescuento = (id, valor) => {
    const n = Math.max(0, Number(valor) || 0);
    setCarrito((prev) =>
      prev.map((i) => (i.producto_id === id ? { ...i, descuento: n } : i))
    );
  };

  // Reemplaza los impuestos seleccionados de una línea por una lista nueva
  // (array de objetos {id, nombre, porcentaje} resueltos desde el catálogo).
  const cambiarImpuestos = (id, nuevaLista) => {
    setCarrito((prev) =>
      prev.map((i) => {
        if (i.producto_id !== id) return i;
        const nuevaPorcentaje = nuevaLista.reduce((s, t) => s + Number(t.porcentaje), 0);
        return { ...i, impuestos: nuevaLista, impuesto_porcentaje: nuevaPorcentaje };
      })
    );
  };

  const quitar = (id) => setCarrito((prev) => prev.filter((i) => i.producto_id !== id));

  // Descarta toda la venta (tras emitir la factura o al cerrar sesión).
  const vaciar = () => {
    setCarrito([]);
    setClienteId('');
    setTipoPago('efectivo');
    setDescuento(0);
  };

  // Cálculo de totales de la venta en curso.
  // El impuesto de cada línea se calcula sobre su base reducida
  // (precio * cantidad - descuento de línea). Con varios impuestos combinados
  // cada porcentaje aplica sobre la misma base.
  const totales = useMemo(() => {
    let subtotal = 0;
    let impuesto = 0;
    let descuentoLineas = 0;
    for (const i of carrito) {
      const bruto = i.precio * i.cantidad;
      const desc = Math.max(0, Math.min(Number(i.descuento) || 0, bruto));
      subtotal += bruto;
      descuentoLineas += desc;
      // Preferir el array de impuestos cuando existe; fallback al legacy impuesto_porcentaje.
      const lista = Array.isArray(i.impuestos) && i.impuestos.length > 0
        ? i.impuestos
        : (i.impuesto_porcentaje ? [{ porcentaje: i.impuesto_porcentaje }] : []);
      impuesto += lista.reduce((s, t) => s + (bruto - desc) * (Number(t.porcentaje) || 0) / 100, 0);
    }
    const descFactura = Math.max(0, Number(descuento) || 0);
    return {
      subtotal,
      impuesto,
      descuento: descuentoLineas + descFactura,
      total: Math.max(0, subtotal + impuesto - descuentoLineas - descFactura)
    };
  }, [carrito, descuento]);

  // --- Visador (pantalla del cliente, Fase 5) ---

  const canalVisador = useRef(null);

  useEffect(() => {
    if ('BroadcastChannel' in window) {
      canalVisador.current = new BroadcastChannel(CANAL_VISADOR);
      return () => canalVisador.current?.close();
    }
  }, []);

  // Publica el estado actual de la venta en el canal del visador.
  const publicarEstado = useCallback(() => {
    canalVisador.current?.postMessage({ tipo: 'estado', carrito, totales });
  }, [carrito, totales]);

  // Publica en cada cambio y responde a los visadores recién abiertos.
  useEffect(() => {
    const canal = canalVisador.current;
    if (!canal) return;
    canal.onmessage = (evento) => {
      if (evento.data?.tipo === 'solicitar-estado') publicarEstado();
    };
    publicarEstado();
  }, [publicarEstado]);

  // Avisa al visador que se emitió una factura (muestra la pantalla de gracias).
  const anunciarVentaEmitida = (numeroFactura, total) => {
    canalVisador.current?.postMessage({ tipo: 'factura-emitida', numeroFactura, total });
  };

  // Devuelve el visador al estado de espera: se usa cuando el cajero cierra el
  // modal de venta emitida para empezar otra de inmediato.
  const anunciarNuevaVenta = useCallback(() => {
    canalVisador.current?.postMessage({ tipo: 'nueva-venta' });
  }, []);

  return (
    <CarritoContext.Provider value={{
      carrito, clienteId, tipoPago, descuento, totales,
      setClienteId, setTipoPago, setDescuento,
      agregar, cambiarCantidad, cambiarDescuento, cambiarImpuestos, quitar, vaciar,
      anunciarVentaEmitida, anunciarNuevaVenta
    }}>
      {children}
    </CarritoContext.Provider>
  );
};

// Hook para consumir la venta en curso desde Caja (y futuro visador).
export const useCarrito = () => useContext(CarritoContext);
