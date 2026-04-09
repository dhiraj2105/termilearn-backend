import { TerminalSession } from "../models/index.js";
import { CommandAuditLog } from "../models/index.js";
import {
  cleanupUserContainers,
  listAllContainers,
  deleteContainer,
} from "./docker.js";
import { info, error } from "./logger.js";

/**
 * Auto Cleanup Mechanism for TermiLearn Backend
 * Handles timeout cleanup, orphan cleanup, and session lifecycle enforcement
 */

const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Clean up expired terminal sessions
 * - Find sessions that have exceeded their timeout
 * - Terminate associated containers
 * - Update session status to 'expired'
 * - Log cleanup actions
 */
async function cleanupExpiredSessions() {
  try {
    info("Starting expired session cleanup");

    const expiredTime = new Date(Date.now() - SESSION_TIMEOUT);
    const expiredSessions = await TerminalSession.find({
      status: "active",
      startedAt: { $lt: expiredTime },
    }).populate("user", "username email");

    info(`Found ${expiredSessions.length} expired sessions to clean up`);

    for (const session of expiredSessions) {
      try {
        info(
          `Cleaning up expired session ${session._id} for user ${session.user.username}`,
        );

        // Terminate the container
        if (session.containerId) {
          await deleteContainer(session.containerId);
          info(
            `Terminated container ${session.containerId} for expired session ${session._id}`,
          );
        }

        // Update session status
        session.status = "expired";
        session.endedAt = new Date();
        await session.save();

        info(`Marked session ${session._id} as expired`);
      } catch (err) {
        error(`Error cleaning up expired session ${session._id}:`, err);
      }
    }

    return expiredSessions.length;
  } catch (err) {
    error("Error during expired session cleanup:", err);
    return 0;
  }
}

/**
 * Clean up orphaned containers
 * - Find containers that exist but don't have corresponding active sessions
 * - Remove orphaned containers
 * - Log cleanup actions
 */
async function cleanupOrphanedContainers() {
  try {
    info("Starting orphaned container cleanup");

    // Get all active containers from Docker
    const allContainers = await listAllContainers();
    const activeContainerIds = allContainers.map((c) => c.Id);

    // Get all active sessions with container IDs
    const activeSessions = await TerminalSession.find({
      status: "active",
      containerId: { $exists: true, $ne: null },
    }).select("containerId user");

    const sessionContainerIds = activeSessions.map((s) => s.containerId);

    // Find orphaned containers (containers without active sessions)
    const orphanedContainerIds = activeContainerIds.filter(
      (containerId) => !sessionContainerIds.includes(containerId),
    );

    info(
      `Found ${orphanedContainerIds.length} orphaned containers to clean up`,
    );

    for (const containerId of orphanedContainerIds) {
      try {
        info(`Cleaning up orphaned container ${containerId}`);
        await deleteContainer(containerId);
        info(`Removed orphaned container ${containerId}`);
      } catch (err) {
        error(`Error cleaning up orphaned container ${containerId}:`, err);
      }
    }

    return orphanedContainerIds.length;
  } catch (err) {
    error("Error during orphaned container cleanup:", err);
    return 0;
  }
}

/**
 * Clean up old audit logs (optional - keep last 30 days)
 * - Remove audit logs older than 30 days to prevent database bloat
 */
async function cleanupOldAuditLogs() {
  try {
    info("Starting old audit log cleanup");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await CommandAuditLog.deleteMany({
      createdAt: { $lt: thirtyDaysAgo },
    });

    info(`Cleaned up ${result.deletedCount} old audit log entries`);
    return result.deletedCount;
  } catch (err) {
    error("Error during old audit log cleanup:", err);
    return 0;
  }
}

/**
 * Run all cleanup operations
 * - Expired sessions
 * - Orphaned containers
 * - Old audit logs
 */
async function runCleanupCycle() {
  try {
    info("=== Starting TermiLearn Auto Cleanup Cycle ===");

    const startTime = Date.now();

    // Run all cleanup operations
    const expiredSessions = await cleanupExpiredSessions();
    const orphanedContainers = await cleanupOrphanedContainers();
    const oldAuditLogs = await cleanupOldAuditLogs();

    const duration = Date.now() - startTime;

    info("=== Cleanup Cycle Complete ===");
    info(
      `Summary: ${expiredSessions} expired sessions, ${orphanedContainers} orphaned containers, ${oldAuditLogs} old audit logs cleaned up in ${duration}ms`,
    );

    return {
      expiredSessions,
      orphanedContainers,
      oldAuditLogs,
      duration,
    };
  } catch (err) {
    error("Error during cleanup cycle:", err);
    throw err;
  }
}

/**
 * Start the auto cleanup system
 * - Run initial cleanup
 * - Set up periodic cleanup interval
 */
function startAutoCleanup() {
  info("Starting TermiLearn Auto Cleanup System");
  info(`Cleanup interval: ${CLEANUP_INTERVAL / 1000} seconds`);
  info(`Session timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);

  // Run initial cleanup
  runCleanupCycle().catch((err) => {
    error("Error during initial cleanup:", err);
  });

  // Set up periodic cleanup
  const cleanupInterval = setInterval(() => {
    runCleanupCycle().catch((err) => {
      error("Error during scheduled cleanup:", err);
    });
  }, CLEANUP_INTERVAL);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    info("Stopping auto cleanup system...");
    clearInterval(cleanupInterval);
  });

  process.on("SIGTERM", () => {
    info("Stopping auto cleanup system...");
    clearInterval(cleanupInterval);
  });

  return cleanupInterval;
}

/**
 * Manual cleanup trigger (for testing/admin purposes)
 */
async function triggerManualCleanup() {
  info("Manual cleanup triggered");
  return await runCleanupCycle();
}

export {
  cleanupExpiredSessions,
  cleanupOrphanedContainers,
  cleanupOldAuditLogs,
  runCleanupCycle,
  startAutoCleanup,
  triggerManualCleanup,
  CLEANUP_INTERVAL,
  SESSION_TIMEOUT,
};
