import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import { authUser } from "../middlewares/auth.js";
import { createOrder, listOrders } from "../controllers/orders.controller.js";
const router = Router();
router.use(authCompany);
router.post("/", createOrder);
router.get("/", listOrders);
export default router;
