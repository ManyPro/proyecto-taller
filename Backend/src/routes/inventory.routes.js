// Backend/src/routes/inventory.routes.js
import { Router } from "express";
import { authCompany } from "../middlewares/authCompany.js";
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

// Entradas de vehículo
router.get("/inventory/vehicle-intakes", authCompany, listVehicleIntakes);
router.post("/inventory/vehicle-intakes", authCompany, createVehicleIntake);
router.put("/inventory/vehicle-intakes/:id", authCompany, updateVehicleIntake);
router.delete("/inventory/vehicle-intakes/:id", authCompany, deleteVehicleIntake);

// Ítems
router.get("/inventory/items", authCompany, listItems);
router.post("/inventory/items", authCompany, createItem);
router.put("/inventory/items/:id", authCompany, updateItem);
router.delete("/inventory/items/:id", authCompany, deleteItem);

// Recalcular prorrateo de una entrada (opcional)
router.post("/inventory/vehicle-intakes/:id/recalc", authCompany, recalcIntakePrices);

export default router;
