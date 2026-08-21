// src/context/ConfigContext.jsx
// Contexto de configuración: carga los flags del sistema (tabla configuraciones)
// cuando hay sesión activa y expone el hook useConfig() para consultarlos.
// Las vistas usan estaHabilitado('clave') para mostrar u ocultar funciones opcionales.
import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const ConfigContext = createContext(null);

export const ConfigProvider = ({ children }) => {
  const { usuario } = useAuth();
  const [configuracion, setConfiguracion] = useState({});

  // Carga los flags al iniciar sesión; los limpia al cerrarla.
  useEffect(() => {
    let cancelado = false;

    if (usuario) {
      api.get('/configuracion')
        .then((respuesta) => {
          if (cancelado) return;
          // La API devuelve una lista [{ clave, valor }]; se reduce a un mapa.
          const mapa = {};
          for (const item of respuesta.data.datos) {
            mapa[item.clave] = item.valor;
          }
          setConfiguracion(mapa);
        })
        .catch(() => {
          // Sin configuración las funciones opcionales quedan desactivadas.
          if (!cancelado) setConfiguracion({});
        });
    } else {
      setConfiguracion({});
    }

    return () => { cancelado = true; };
  }, [usuario]);

  // Refresca el mapa local tras un cambio hecho por el administrador.
  const actualizarLocal = (clave, valor) => {
    setConfiguracion((prev) => ({ ...prev, [clave]: valor }));
  };

  // Indica si una función opcional está habilitada (los flags guardan '1'/'0').
  const estaHabilitado = (clave) => configuracion[clave] === '1';

  return (
    <ConfigContext.Provider value={{ configuracion, estaHabilitado, actualizarLocal }}>
      {children}
    </ConfigContext.Provider>
  );
};

// Hook para consumir la configuración desde cualquier componente.
export const useConfig = () => useContext(ConfigContext);
