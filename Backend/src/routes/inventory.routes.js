import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import multer from "multer";
import { upload } from "../lib/upload.js";

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
  exportItemsXlsx,
  importItemsXlsx,
} from "../controllers/inventory.controller.js";

const router = Router();

// ===== Entradas de vehículo =====
router.get("/vehicle-intakes", authCompany, listVehicleIntakes);
router.post("/vehicle-intakes", authCompany, createVehicleIntake);
router.put("/vehicle-intakes/:id", authCompany, updateVehicleIntake);
router.delete("/vehicle-intakes/:id", authCompany, deleteVehicleIntake);
router.post("/vehicle-intakes/:id/recalc", authCompany, recalcIntakePrices);

// ===== Ítems =====
// Crear ítem con imagen (campo de archivo: 'image')
router.post("/items", authCompany, upload.single("image"), createItem);
router.get("/items", authCompany, listItems);
router.put("/items/:id", authCompany, updateItem);
router.delete("/items/:id", authCompany, deleteItem);

// Excel
router.get("/items/export.xlsx", authCompany, exportItemsXlsx);

// Para importar leemos el archivo en memoria (no a GridFS)
const mem = multer({ storage: multer.memoryStorage() });
router.post("/items/import", authCompany, mem.single("file"), importItemsXlsx);

export default router;
