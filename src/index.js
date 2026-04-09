import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import terminalRoutes from "./routes/terminalRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { info, error } from "./utils/logger.js";
import { setupTerminalWebSocket } from "./utils/websocket.js";
import { startAutoCleanup } from "./utils/cleanup.js";
import { authLimiter, generalLimiter } from "./middleware/rateLimiter.js";

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use("/api/auth", authLimiter);
app.use("/api", generalLimiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "TermiLearn Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/terminal", terminalRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server and Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  },
});

// Socket.io connection handling
setupTerminalWebSocket(io);

let server;

const startServer = () => {
  server = httpServer.listen(PORT, () => {
    info(
      `Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`,
    );
    info(`WebSocket server ready for real-time terminal connections`);

    // Start auto cleanup system
    startAutoCleanup();
  });
};

process.on("unhandledRejection", (err) => {
  error("Unhandled Rejection:", err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", err);
  process.exit(1);
});

// Socket.io connection handling
setupTerminalWebSocket(io);

startServer();
