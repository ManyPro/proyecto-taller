import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import { rebuildProfiles, listProfileHistory } from '../controllers/profiles.controller.js';
import {
  listUnassignedVehicles,
  getUnassignedVehicle,
  approveVehicleAssignment,
  rejectVehicleAssignment,
  deleteUnassignedVehicle,
  getUnassignedVehiclesStats
} from '../controllers/unassigned-vehicles.controller.js';

const router = Router();
router.use(authCompany);

// Rebuild: mode=append|replace, overwrite=true|false, limit=N
router.post('/rebuild', rebuildProfiles);
router.get('/history', listProfileHistory);

// Rutas para gestionar vehículos no asignados
router.get('/unassigned-vehicles', listUnassignedVehicles);
router.get('/unassigned-vehicles/stats', getUnassignedVehiclesStats);
router.get('/unassigned-vehicles/:id', getUnassignedVehicle);
router.post('/unassigned-vehicles/:id/approve', approveVehicleAssignment);
router.post('/unassigned-vehicles/:id/reject', rejectVehicleAssignment);
router.delete('/unassigned-vehicles/:id', deleteUnassignedVehicle);

export default router;
