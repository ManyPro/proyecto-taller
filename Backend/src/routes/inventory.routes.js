import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import {
  listVehicleIntakes,
  createVehicleIntake,
  updateVehicleIntake,
  deleteVehicleIntake,
  recalcIntakePrices,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  itemQrPng
} from "../controllers/inventory.controller.js";

const router = Router();

router.use(authCompany);

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

// QR del ítem (PNG)
router.get("/items/:id/qr.png", itemQrPng);

export default router;
