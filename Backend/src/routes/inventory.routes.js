import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import { authUser } from "../middlewares/auth.js";

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

const router = Router();

/**
 * Importante: aquí NO repitas "/inventory".
 * Este router se monta en /api/v1/inventory desde server.js,
 * así que los paths empiezan por "/vehicle-intakes" y "/items".
 */

// Entradas de vehículo
router.get("/vehicle-intakes", listVehicleIntakes);
router.post("/vehicle-intakes", createVehicleIntake);
router.put("/vehicle-intakes/:id", updateVehicleIntake);
router.delete("/vehicle-intakes/:id", deleteVehicleIntake);
router.post("/vehicle-intakes/:id/recalc", recalcIntakePrices);

// Ítems
router.get("/items", listItems);
router.post("/items", createItem);
router.put("/items/:id", updateItem);
router.delete("/items/:id", deleteItem);

export default router;
