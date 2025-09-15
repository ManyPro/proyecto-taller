import { Router } from "express";
import { registerCompany, loginCompany, me } from "../controllers/auth.controller.js";
import { authCompany } from "../middlewares/auth.js";
const router = Router();
router.post("/company/register", registerCompany);
router.post("/company/login", loginCompany);
router.get("/company/me", authCompany, me);
export default router;
