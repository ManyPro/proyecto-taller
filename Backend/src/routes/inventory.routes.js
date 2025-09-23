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
  itemQrPng // 👈 nuevo
} from "../controllers/inventory.controller.js";

const router = Router();

// Shield por empresa
router.use(authCompany, (req, _res, next) => {
  req.companyId = req.company?.id;
  req.userId = req.user?.id;
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    req.body ||= {};
    if (!req.body.companyId) req.body.companyId = req.companyId;
    if (!req.body.userId && req.userId) req.body.userId = req.userId;
  }
  next();
});

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
