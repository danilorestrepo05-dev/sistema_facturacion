// src/components/Paginacion.jsx
// Barra de paginación reutilizable para los listados del sistema.
// Recibe la página actual, el total de páginas y la función de cambio.
// Se oculta sola cuando hay una sola página.
import { Pagination } from 'react-bootstrap';

const Paginacion = ({ pagina, paginas, onChange }) => {
  if (!paginas || paginas <= 1) return null;

  return (
    <div className="d-flex justify-content-center mt-3">
      <Pagination size="sm" className="mb-0">
        <Pagination.First disabled={pagina <= 1} onClick={() => onChange(1)} />
        <Pagination.Prev disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} />
        <Pagination.Item active>{pagina}</Pagination.Item>
        <span className="align-self-center px-2 small text-secondary">de {paginas}</span>
        <Pagination.Next disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)} />
        <Pagination.Last disabled={pagina >= paginas} onClick={() => onChange(paginas)} />
      </Pagination>
    </div>
  );
};

export default Paginacion;
