import { Router } from "express";
import { streamFile } from "../controllers/files.controller.js";

const router = Router();
router.get("/files/:id", streamFile);
export default router;
