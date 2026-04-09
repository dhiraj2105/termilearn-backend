import express from "express";
import {
  createTerminal,
  deleteTerminal,
  executeCommand,
  getTerminalStatus,
  listActiveSessions,
  getCommandHistory,
  getAuditLog,
  triggerCleanup,
} from "../controllers/terminalController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Terminal session management
router.post("/create", createTerminal);
router.get("/list", listActiveSessions);
router.get("/:sessionId", getTerminalStatus);
router.delete("/:sessionId", deleteTerminal);

// Command execution and history
router.post("/:sessionId/execute", executeCommand);
router.post("/:sessionId/command", executeCommand);
router.get("/:sessionId/status", getTerminalStatus);
router.get("/:sessionId/history", getCommandHistory);
router.get("/:sessionId/audit", getAuditLog);

// Admin cleanup operations
router.post("/cleanup", authorize("admin"), triggerCleanup);

export default router;
