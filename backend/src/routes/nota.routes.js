// src/routes/nota.routes.js
// Endpoints de la API para las NOTAS CORRECTIVAS (débito y crédito).
const { Router } = require('express');
const notaController = require('../controllers/nota.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

// Todas las rutas de notas requieren autenticación.
router.use(verificarToken);

// GET /api/v1/notas          -> listar notas correctivas
// POST /api/v1/notas         -> crear una nota correctiva
router.route('/')
  .get(notaController.listar)
  .post(notaController.crear);

// GET    /api/v1/notas/:id          -> detalle de una nota
// POST   /api/v1/notas/:id/dian     -> emitir/reintentar documento DIAN
// POST   /api/v1/notas/:id/anular   -> anular una nota
// GET    /api/v1/notas/:id/pdf      -> descargar PDF (carta/media carta)
// GET    /api/v1/notas/:id/ticket   -> buffer para impresora térmica POS
router.get('/:id', notaController.obtener);
router.post('/:id/dian', notaController.procesarDian);
router.post('/:id/anular', notaController.anular);
router.get('/:id/pdf', notaController.descargarPdf);
router.get('/:id/ticket', notaController.descargarTicket);

module.exports = router;
