import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";

import {
  listVehicleIntakes,
  createVehicleIntake,
  updateVehicleIntake,
  deleteVehicleIntake,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  recalcIntakePrices,
} from "../controllers/inventory.controller.js";

// IMPORTANTE: primero crea el router
const router = Router();

/**
 * ¡NO repitas "/inventory" aquí!
 * Ya montas este router en /api/v1/inventory desde server.js,
 * así que los paths de aquí empiezan directo por "/vehicle-intakes" y "/items".
 */

// Entradas de vehículo
router.get("/vehicle-intakes", authCompany, listVehicleIntakes);
router.post("/vehicle-intakes", authCompany, createVehicleIntake);
router.put("/vehicle-intakes/:id", authCompany, updateVehicleIntake);
router.delete("/vehicle-intakes/:id", authCompany, deleteVehicleIntake);
router.post("/vehicle-intakes/:id/recalc", authCompany, recalcIntakePrices);

// Ítems
router.get("/items", authCompany, listItems);
router.post("/items", authCompany, createItem);
router.put("/items/:id", authCompany, updateItem);
router.delete("/items/:id", authCompany, deleteItem);

export default router;
