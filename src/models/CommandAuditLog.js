import mongoose from "mongoose";

const commandAuditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TerminalSession",
      required: true,
    },
    command: {
      type: String,
      required: true,
      trim: true,
    },
    origin: {
      type: String,
      enum: ["rest", "websocket"],
      default: "rest",
    },
    status: {
      type: String,
      enum: ["allowed", "warning", "blocked"],
      default: "allowed",
    },
    reason: {
      type: String,
      default: "",
    },
    output: {
      type: String,
      default: "",
    },
    exitCode: {
      type: Number,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const CommandAuditLog = mongoose.model(
  "CommandAuditLog",
  commandAuditLogSchema,
);
export default CommandAuditLog;
