import express from "express";
import { getAuthStatus } from "../controllers/authController.js";

const router = express.Router();

router.get("/", getAuthStatus);

export default router;
