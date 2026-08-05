// src/context/AuthContext.jsx
// Contexto de autenticación: mantiene el usuario y el token, y expone
// las funciones de inicio de sesión y cierre de sesión.
import { createContext, useContext, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Lee el usuario guardado en el navegador (persistencia entre recargas).
const usuarioInicial = () => {
  try {
    const guardado = localStorage.getItem('usuario');
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(usuarioInicial);

  // Inicia sesión: envía credenciales y guarda token + usuario.
  const iniciarSesion = async (nombreUsuario, contrasena) => {
    const respuesta = await api.post('/auth/login', {
      nombre_usuario: nombreUsuario,
      contrasena
    });

    const { token, usuario: datosUsuario } = respuesta.data.datos;
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(datosUsuario));
    setUsuario(datosUsuario);
    return datosUsuario;
  };

  // Cierra sesión: limpia token y usuario.
  const cerrarSesion = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook para consumir el contexto desde cualquier componente.
export const useAuth = () => useContext(AuthContext);
