import mongoose from "mongoose";
import { info } from "../utils/logger.js";

const commandEntrySchema = new mongoose.Schema(
  {
    command: {
      type: String,
      required: true,
      trim: true,
    },
    output: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const terminalSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    containerId: {
      type: String,
      required: [true, "Container ID is required"],
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "terminated", "expired", "error"],
      default: "active",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
    },
    commandHistory: {
      type: [commandEntrySchema],
      default: [],
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

terminalSessionSchema.pre("save", function (next) {
  if (!this.isModified("commandHistory")) {
    return next();
  }

  info(
    "Terminal session command history updated for container:",
    this.containerId,
  );
  return next();
});

const TerminalSession = mongoose.model(
  "TerminalSession",
  terminalSessionSchema,
);
export default TerminalSession;
