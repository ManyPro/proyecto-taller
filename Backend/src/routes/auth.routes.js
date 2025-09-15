import { Router } from "express";
import { loginCompany, registerCompany, me } from "../controllers/auth.controller.js";
import authCompany from "../middlewares/auth.js";

const router = Router();

router.post("/company/login", loginCompany);      // pública
router.post("/company/register", registerCompany);// pública
router.get("/company/me", authCompany, me);       // protegida

export default router;
