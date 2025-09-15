// Backend/src/routes/auth.routes.js
import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import {
  loginCompany,
  registerCompany,
  me,
} from "../controllers/auth.controller.js";

const router = Router();

// públicas (NO llevan Authorization)
router.post("/auth/company/login", loginCompany);
router.post("/auth/company/register", registerCompany);

// privada (SÍ lleva Authorization)
router.get("/auth/company/me", authCompany, me);

export default router;
