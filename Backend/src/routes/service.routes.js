import { Router } from 'express';
import { listServices, createService, updateService, deleteService } from '../controllers/services.controller.js';

const r = Router();
r.get('/', listServices);
r.post('/', createService);
r.put('/:id', updateService);
r.delete('/:id', deleteService);
export default r;
