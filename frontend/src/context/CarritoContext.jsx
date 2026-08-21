// src/context/CarritoContext.jsx
// Contexto del carrito de Caja: mantiene la venta en curso viva mientras el
// usuario navega entre módulos (el proveedor vive por encima del router y no
// se desmonta) y la respalda en sessionStorage para sobrevivir a un F5.
// Al cerrar sesión se vacía para que la venta pendiente de un cajero no
// aparezca en la sesión del siguiente.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const CLAVE_STORAGE = 'caja_en_curso';

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

  const [carrito, setCarrito] = useState(inicial.carrito); // [{ producto_id, nombre, precio, impuesto_porcentaje, cantidad, stock }]
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
      return [...prev, {
        producto_id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio_venta),
        impuesto_porcentaje: Number(producto.impuesto_porcentaje || 0),
        cantidad: 1,
        stock: producto.stock_actual
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

  const quitar = (id) => setCarrito((prev) => prev.filter((i) => i.producto_id !== id));

  // Descarta toda la venta (tras emitir la factura o al cerrar sesión).
  const vaciar = () => {
    setCarrito([]);
    setClienteId('');
    setTipoPago('efectivo');
    setDescuento(0);
  };

  // Cálculo de totales de la venta en curso.
  const totales = useMemo(() => {
    const subtotal = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    const impuesto = carrito.reduce(
      (acc, i) => acc + i.precio * i.cantidad * (i.impuesto_porcentaje / 100), 0
    );
    const desc = Math.max(0, Number(descuento) || 0);
    return { subtotal, impuesto, descuento: desc, total: Math.max(0, subtotal + impuesto - desc) };
  }, [carrito, descuento]);

  return (
    <CarritoContext.Provider value={{
      carrito, clienteId, tipoPago, descuento, totales,
      setClienteId, setTipoPago, setDescuento,
      agregar, cambiarCantidad, quitar, vaciar
    }}>
      {children}
    </CarritoContext.Provider>
  );
};

// Hook para consumir la venta en curso desde Caja (y futuro visador).
export const useCarrito = () => useContext(CarritoContext);
