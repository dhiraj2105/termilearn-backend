import express from "express";
import {
  register,
  login,
  getProfile,
  updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
} from "../middleware/validation.js";

const router = express.Router();

// Public routes
router.post("/register", validateRegistration, register);
router.post("/login", validateLogin, login);

// Protected routes
router.get("/profile", protect, getProfile);
router.put("/profile", protect, validateProfileUpdate, updateProfile);

export default router;
