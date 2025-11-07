import { Router } from 'express';
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  searchVehicles,
  getMakes,
  getLinesByMake,
  validateYear
} from '../controllers/vehicles.controller.js';

const r = Router();

// CRUD básico
r.get('/', listVehicles);
r.get('/search', searchVehicles);
r.get('/makes', getMakes);
r.get('/makes/:make/lines', getLinesByMake);
r.get('/validate-year', validateYear);
r.get('/:id', getVehicle);
r.post('/', createVehicle);
r.put('/:id', updateVehicle);
r.delete('/:id', deleteVehicle);

export default r;

