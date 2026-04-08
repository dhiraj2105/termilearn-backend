// import jwt from "jsonwebtoken";
// import { info, error } from "./logger.js";
// import { executeCommandStream } from "./docker.js";
// import TerminalSession from "../models/TerminalSession.js";
// import mongoose from "mongoose";

// /**
//  * WebSocket handler for real-time terminal interactions
//  * @param {Server} io - Socket.io server instance
//  */
// export const setupTerminalWebSocket = (io) => {
//   // Store active connections by session ID
//   const activeConnections = new Map();

//   io.on("connection", (socket) => {
//     info(`WebSocket client connected: ${socket.id}`);

//     // Authenticate socket connection
//     socket.on("authenticate", async (data) => {
//       try {
//         const { token } = data;

//         if (!token) {
//           socket.emit("auth-error", { message: "No token provided" });
//           return;
//         }

//         // Verify JWT token
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         socket.userId = decoded.userId;
//         socket.username = decoded.username;

//         info(
//           `Socket authenticated for user: ${socket.username} (${socket.userId})`,
//         );
//         socket.emit("authenticated", {
//           userId: socket.userId,
//           username: socket.username,
//         });
//       } catch (err) {
//         error("Socket authentication failed:", err);
//         socket.emit("auth-error", { message: "Invalid token" });
//       }
//     });

//     // Join terminal session
//     // socket.on("join-terminal", async (data) => {
//     //   try {
//     //     if (!socket.userId) {
//     //       socket.emit("error", { message: "Not authenticated" });
//     //       return;
//     //     }

//     //     const { sessionId } = data;

//     //     // Verify session ownership
//     //     const session = await TerminalSession.findOne({
//     //       _id: sessionId,
//     //       userId: socket.userId,
//     //       status: "active",
//     //     });

//     //     console.log("User ID from token:", socket.userId);
//     //     console.log("Requested session ID:", sessionId);
//     //     console.log("Session found:", session);

//     //     if (!session) {
//     //       socket.emit("error", {
//     //         message: "Terminal session not found or not owned by user",
//     //       });
//     //       return;
//     //     }

//     //     // Leave previous room if any
//     //     if (socket.currentRoom) {
//     //       socket.leave(socket.currentRoom);
//     //     }

//     //     // Join new room
//     //     socket.join(sessionId);
//     //     socket.currentRoom = sessionId;

//     //     // Track active connections
//     //     if (!activeConnections.has(sessionId)) {
//     //       activeConnections.set(sessionId, new Set());
//     //     }
//     //     activeConnections.get(sessionId).add(socket.id);

//     //     info(`User ${socket.username} joined terminal session: ${sessionId}`);
//     //     socket.emit("joined-terminal", {
//     //       sessionId,
//     //       containerId: session.containerId,
//     //       status: session.status,
//     //     });
//     //   } catch (err) {
//     //     error("Error joining terminal session:", err);
//     //     socket.emit("error", { message: "Failed to join terminal session" });
//     //   }
//     // });
//     socket.on("join-terminal", async (data) => {
//       try {
//         if (!socket.userId) {
//           socket.emit("error", { message: "Not authenticated" });
//           return;
//         }

//         const { sessionId } = data;

//         const session = await TerminalSession.findById(sessionId);

//         if (!session) {
//           socket.emit("error", { message: "Session not found" });
//           return;
//         }

//         if (session.user.toString() !== socket.userId.toString()) {
//           socket.emit("error", {
//             message: "Session not owned by this user",
//           });
//           return;
//         }

//         if (session.status !== "active") {
//           socket.emit("error", {
//             message: `Session not active (${session.status})`,
//           });
//           return;
//         }

//         socket.join(sessionId);
//         socket.currentRoom = sessionId;

//         socket.emit("joined-terminal", {
//           sessionId,
//           containerId: session.containerId,
//           status: session.status,
//         });
//       } catch (err) {
//         console.error("❌ JOIN ERROR:", err);

//         socket.emit("error", {
//           message: "Failed to join terminal session",
//           error: err.message,
//         });
//       }
//     });

//     // Execute terminal command with real-time streaming
//     socket.on("terminal-command", async (data) => {
//       try {
//         if (!socket.userId) {
//           socket.emit("error", { message: "Not authenticated" });
//           return;
//         }

//         const { sessionId, command } = data;

//         if (!command || typeof command !== "string" || command.trim() === "") {
//           socket.emit("command-error", { message: "Invalid command" });
//           return;
//         }

//         // Verify session ownership
//         const session = await TerminalSession.findOne({
//           _id: sessionId,
//           userId: socket.userId,
//           status: "active",
//         });

//         if (!session) {
//           socket.emit("command-error", {
//             message: "Terminal session not found or not active",
//           });
//           return;
//         }

//         info(`Streaming command execution in session ${sessionId}: ${command}`);

//         // Emit command start to all clients in room
//         io.to(sessionId).emit("command-start", {
//           command,
//           timestamp: new Date(),
//         });

//         let fullOutput = "";
//         let fullError = "";

//         // Execute command with streaming
//         await new Promise((resolve, reject) => {
//           executeCommandStream(
//             session.containerId,
//             command,
//             (data, isStdout) => {
//               // Stream output to all clients in real-time
//               io.to(sessionId).emit("command-output", {
//                 command,
//                 output: data,
//                 isStdout,
//                 timestamp: new Date(),
//               });

//               if (isStdout) {
//                 fullOutput += data;
//               } else {
//                 fullError += data;
//               }
//             },
//             (exitCode) => {
//               // Command completed
//               const result = {
//                 command,
//                 output: fullOutput,
//                 error: fullError,
//                 exitCode,
//                 timestamp: new Date(),
//               };

//               // Save to command history
//               session.commandHistory.push({
//                 command,
//                 output: fullOutput,
//                 exitCode,
//                 timestamp: new Date(),
//               });

//               session.save().catch((err) => {
//                 error("Failed to save command history:", err);
//               });

//               // Emit completion to all clients
//               io.to(sessionId).emit("command-complete", result);

//               info(
//                 `Command completed in session ${sessionId} with exit code ${exitCode}`,
//               );
//               resolve();
//             },
//             (err) => {
//               error("Command execution error:", err);
//               socket.emit("command-error", {
//                 message: "Command execution failed",
//                 error: err.message,
//               });
//               reject(err);
//             },
//           );
//         });
//       } catch (err) {
//         error("Error in terminal command execution:", err);
//         socket.emit("command-error", {
//           message: "Failed to execute command",
//           error: err.message,
//         });
//       }
//     });

//     // Handle terminal resize
//     socket.on("terminal-resize", (data) => {
//       const { sessionId, cols, rows } = data;
//       // Note: Docker containers don't directly support resize via API
//       // This is for future implementation if needed
//       info(
//         `Terminal resize requested for session ${sessionId}: ${cols}x${rows}`,
//       );
//     });

//     // Handle disconnection
//     socket.on("disconnect", () => {
//       info(`WebSocket client disconnected: ${socket.id}`);

//       // Remove from active connections
//       if (socket.currentRoom) {
//         const connections = activeConnections.get(socket.currentRoom);
//         if (connections) {
//           connections.delete(socket.id);
//           if (connections.size === 0) {
//             activeConnections.delete(socket.currentRoom);
//           }
//         }
//       }
//     });

//     // Heartbeat for connection monitoring
//     socket.on("heartbeat", () => {
//       socket.emit("heartbeat-response");
//     });
//   });

//   // Cleanup function for when server shuts down
//   const cleanup = () => {
//     info("Cleaning up WebSocket connections...");
//     activeConnections.clear();
//   };

//   return { cleanup };
// };

// ABOVE IS OLD, DO NOT TOUCH

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { info, warn, error } from "./logger.js";
import { executeCommandStream } from "./docker.js";
import { validateCommand } from "./commandSafety.js";
import { TerminalSession, CommandAuditLog } from "../models/index.js";

/**
 * Validate and return session
 */
const validateSession = async (sessionId, userId) => {
  // ✅ Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return { error: "Invalid session ID format" };
  }

  const session = await TerminalSession.findById(sessionId);

  if (!session) {
    return { error: "Session not found" };
  }

  if (session.user.toString() !== userId.toString()) {
    return { error: "Session not owned by user" };
  }

  if (session.status !== "active") {
    return { error: `Session not active (${session.status})` };
  }

  return { session };
};

const createWebSocketAudit = async ({
  user,
  session,
  command,
  origin,
  status,
  reason,
  output,
  exitCode,
}) => {
  try {
    await CommandAuditLog.create({
      user,
      session,
      command,
      origin,
      status,
      reason,
      output: output ? output.toString().slice(0, 2000) : "",
      exitCode,
    });
  } catch (err) {
    error("Failed to log websocket audit entry:", err);
  }
};

/**
 * WebSocket handler
 */
export const setupTerminalWebSocket = (io) => {
  const activeConnections = new Map();

  io.on("connection", (socket) => {
    info(`🟢 Client connected: ${socket.id}`);

    // ================= AUTH =================
    socket.on("authenticate", (data) => {
      try {
        const { token } = data;

        if (!token) {
          socket.emit("auth-error", { message: "No token provided" });
          return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.userId = decoded.userId;
        socket.username = decoded.username;

        info(`✅ Authenticated: ${socket.username} (${socket.userId})`);

        socket.emit("authenticated", {
          userId: socket.userId,
          username: socket.username,
        });
      } catch (err) {
        error("❌ Auth failed:", err);
        socket.emit("auth-error", { message: "Invalid token" });
      }
    });

    // ================= JOIN TERMINAL =================
    socket.on("join-terminal", async ({ sessionId }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        const { session, error: sessionError } = await validateSession(
          sessionId,
          socket.userId,
        );

        if (sessionError) {
          console.log("❌ JOIN FAILED:", sessionError);
          socket.emit("error", { message: sessionError });
          return;
        }

        // Leave old room
        if (socket.currentRoom) {
          socket.leave(socket.currentRoom);
        }

        // Join new room
        socket.join(sessionId);
        socket.currentRoom = sessionId;

        // Track connections
        if (!activeConnections.has(sessionId)) {
          activeConnections.set(sessionId, new Set());
        }
        activeConnections.get(sessionId).add(socket.id);

        socket.emit("joined-terminal", {
          sessionId,
          containerId: session.containerId,
          status: session.status,
        });
      } catch (err) {
        error("❌ JOIN ERROR:", err);
        socket.emit("error", {
          message: "Failed to join terminal session",
          error: err.message,
        });
      }
    });

    // ================= COMMAND =================
    socket.on("terminal-command", async ({ sessionId, command }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        if (!command || !command.trim()) {
          socket.emit("command-error", { message: "Invalid command" });
          return;
        }

        const { session, error: sessionError } = await validateSession(
          sessionId,
          socket.userId,
        );

        if (sessionError) {
          console.log("❌ COMMAND FAILED:", sessionError);
          socket.emit("command-error", { message: sessionError });
          return;
        }

        const safety = validateCommand(command);

        if (!safety.allowed) {
          await createWebSocketAudit({
            user: socket.userId,
            session: sessionId,
            command,
            origin: "websocket",
            status: "blocked",
            reason: safety.reason,
            output: "",
            exitCode: null,
          });

          socket.emit("command-error", {
            message: "Command blocked for safety reasons",
            reason: safety.reason,
          });
          return;
        }

        if (safety.severity === "warning") {
          warn(`Command warning: ${command} — ${safety.reason}`);
          io.to(sessionId).emit("command-warning", {
            command,
            reason: safety.reason,
            timestamp: new Date(),
          });
        }

        info(`⚡ Executing: ${command}`);

        io.to(sessionId).emit("command-start", {
          command,
          timestamp: new Date(),
        });

        let fullOutput = "";
        let fullError = "";

        await new Promise((resolve, reject) => {
          executeCommandStream(
            session.containerId,
            command,
            (data, isStdout) => {
              io.to(sessionId).emit("command-output", {
                command,
                output: data,
                isStdout,
                timestamp: new Date(),
              });

              isStdout ? (fullOutput += data) : (fullError += data);
            },
            async (exitCode) => {
              const result = {
                command,
                output: fullOutput,
                error: fullError,
                exitCode,
                timestamp: new Date(),
              };

              session.commandHistory.push({
                command,
                output: fullOutput,
                exitCode,
                timestamp: new Date(),
              });

              session.save().catch((err) => error("Save history failed:", err));
              await createWebSocketAudit({
                user: socket.userId,
                session: sessionId,
                command,
                origin: "websocket",
                status: safety.severity === "warning" ? "warning" : "allowed",
                reason: safety.reason,
                output: fullOutput || fullError,
                exitCode,
              });

              io.to(sessionId).emit("command-complete", result);

              info(`✅ Command done (exit ${exitCode})`);
              resolve();
            },
            (err) => {
              error("❌ Execution error:", err);
              socket.emit("command-error", {
                message: "Execution failed",
                error: err.message,
              });
              reject(err);
            },
          );
        });
      } catch (err) {
        error("❌ COMMAND ERROR:", err);
        socket.emit("command-error", {
          message: "Failed to execute command",
          error: err.message,
        });
      }
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", () => {
      info(`🔴 Disconnected: ${socket.id}`);

      if (socket.currentRoom) {
        const set = activeConnections.get(socket.currentRoom);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) {
            activeConnections.delete(socket.currentRoom);
          }
        }
      }
    });

    // ================= HEARTBEAT =================
    socket.on("heartbeat", () => {
      socket.emit("heartbeat-response");
    });
  });

  return {
    cleanup: () => {
      info("🧹 Cleaning WebSocket...");
      activeConnections.clear();
    },
  };
};
