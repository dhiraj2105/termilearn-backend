import express from "express";
import { getTerminalStatus } from "../controllers/terminalController.js";

const router = express.Router();

router.get("/", getTerminalStatus);

export default router;
