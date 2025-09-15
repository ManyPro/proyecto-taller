import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import { createOrder, listOrders } from "../controllers/orders.controller.js";

const router = Router();

// ✅ del token → req.companyId
router.use(authCompany, (req, _res, next) => {
  req.companyId = req.company?.id;
  next();
});

router.post("/", createOrder);
router.get("/", listOrders);

export default router;
