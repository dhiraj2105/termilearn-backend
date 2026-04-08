import { TerminalSession } from "../models/index.js";
import {
  createContainer,
  deleteContainer,
  executeCommand as runCommand,
  getContainerStatus,
  listUserContainers,
  cleanupUserContainers,
} from "../utils/docker.js";
import { info, error } from "../utils/logger.js";

/**
 * @desc    Create a new terminal session
 * @route   POST /api/terminal/create
 * @access  Private
 */
export const createTerminal = async (req, res) => {
  try {
    const userId = req.user._id;

    info(`Creating new terminal session for user: ${userId}`);

    // Create Docker container
    const containerInfo = await createContainer(userId.toString());

    // Create terminal session in database
    const terminalSession = await TerminalSession.create({
      user: userId,
      containerId: containerInfo.containerId,
      status: "active",
      startedAt: containerInfo.createdAt,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      lastHeartbeat: new Date(),
    });

    info(
      `Terminal session created: ${terminalSession._id} for user: ${userId}`,
    );

    res.status(201).json({
      success: true,
      message: "Terminal session created successfully",
      data: {
        sessionId: terminalSession._id,
        containerId: containerInfo.containerId,
        containerName: containerInfo.containerName,
        status: containerInfo.status,
        createdAt: containerInfo.createdAt,
        expiresAt: terminalSession.expiresAt,
        durationMinutes: 30,
      },
    });
  } catch (err) {
    error(`Failed to create terminal session:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to create terminal session",
      error: err.message,
    });
  }
};

/**
 * @desc    Get terminal session status
 * @route   GET /api/terminal/:sessionId
 * @access  Private
 */
export const getTerminalStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Find terminal session
    const terminalSession = await TerminalSession.findById(sessionId);

    if (!terminalSession) {
      return res.status(404).json({
        success: false,
        message: "Terminal session not found",
      });
    }

    // Verify ownership
    if (terminalSession.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this terminal",
      });
    }

    // Check if session expired
    if (new Date() > terminalSession.expiresAt) {
      await TerminalSession.findByIdAndUpdate(sessionId, {
        status: "expired",
      });
      return res.status(410).json({
        success: false,
        message: "Terminal session has expired",
        data: {
          sessionId,
          status: "expired",
          expiresAt: terminalSession.expiresAt,
        },
      });
    }

    // Get container status
    const containerStatus = await getContainerStatus(
      terminalSession.containerId,
    );

    // Update last heartbeat
    await TerminalSession.findByIdAndUpdate(sessionId, {
      lastHeartbeat: new Date(),
    });

    const timeRemaining = Math.max(
      0,
      Math.floor((terminalSession.expiresAt - new Date()) / 1000),
    );

    res.status(200).json({
      success: true,
      message: "Terminal session status retrieved",
      data: {
        sessionId,
        containerId: terminalSession.containerId,
        status: containerStatus.isRunning ? "active" : "inactive",
        createdAt: terminalSession.startedAt,
        expiresAt: terminalSession.expiresAt,
        timeRemainingSeconds: timeRemaining,
        commandCount: terminalSession.commandHistory.length,
        containerStatus: containerStatus.status,
      },
    });
  } catch (err) {
    error(`Failed to get terminal status:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to get terminal status",
      error: err.message,
    });
  }
};

/**
 * @desc    Execute command in terminal
 * @route   POST /api/terminal/:sessionId/execute
 * @access  Private
 */
export const executeCommand = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        message: "Command is required",
      });
    }

    // Find terminal session
    const terminalSession = await TerminalSession.findById(sessionId);

    if (!terminalSession) {
      return res.status(404).json({
        success: false,
        message: "Terminal session not found",
      });
    }

    // Verify ownership
    if (terminalSession.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to execute commands in this terminal",
      });
    }

    // Check if session expired
    if (new Date() > terminalSession.expiresAt) {
      await TerminalSession.findByIdAndUpdate(sessionId, {
        status: "expired",
      });
      return res.status(410).json({
        success: false,
        message: "Terminal session has expired",
      });
    }

    info(
      `Executing command in session ${sessionId}: ${command.substring(0, 100)}...`,
    );

    // Execute command
    const result = await runCommand(terminalSession.containerId, command, 5000);

    // Update command history
    terminalSession.commandHistory.push({
      command,
      output: result.stdout || result.stderr,
      createdAt: new Date(),
    });

    await terminalSession.save();

    info(
      `Command executed in session ${sessionId} with exit code ${result.exitCode}`,
    );

    res.status(200).json({
      success: true,
      message: "Command executed successfully",
      data: {
        sessionId,
        command,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executedAt: new Date(),
      },
    });
  } catch (err) {
    error(`Failed to execute command:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to execute command",
      error: err.message,
    });
  }
};

/**
 * @desc    Delete/terminate terminal session
 * @route   DELETE /api/terminal/:sessionId
 * @access  Private
 */
export const deleteTerminal = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Find terminal session
    const terminalSession = await TerminalSession.findById(sessionId);

    if (!terminalSession) {
      return res.status(404).json({
        success: false,
        message: "Terminal session not found",
      });
    }

    // Verify ownership
    if (terminalSession.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this terminal",
      });
    }

    info(`Deleting terminal session: ${sessionId}`);

    // Delete Docker container
    try {
      await deleteContainer(terminalSession.containerId);
    } catch (dockerErr) {
      error(`Failed to delete Docker container:`, dockerErr);
    }

    // Delete terminal session from database
    await TerminalSession.findByIdAndUpdate(sessionId, {
      status: "terminated",
    });

    info(`Terminal session terminated: ${sessionId}`);

    res.status(200).json({
      success: true,
      message: "Terminal session terminated successfully",
      data: {
        sessionId,
        status: "terminated",
        commandsExecuted: terminalSession.commandHistory.length,
      },
    });
  } catch (err) {
    error(`Failed to delete terminal session:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to delete terminal session",
      error: err.message,
    });
  }
};

/**
 * @desc    List active terminal sessions for user
 * @route   GET /api/terminal/list
 * @access  Private
 */
export const listActiveSessions = async (req, res) => {
  try {
    const userId = req.user._id;

    info(`Fetching active terminal sessions for user: ${userId}`);

    // Find all active sessions
    const sessions = await TerminalSession.find({
      user: userId,
      status: "active",
      expiresAt: { $gt: new Date() },
    }).select("_id containerId status startedAt expiresAt commandHistory");

    // Filter and format sessions
    const activeSessions = sessions.map((session) => {
      const timeRemaining = Math.max(
        0,
        Math.floor((session.expiresAt - new Date()) / 1000),
      );
      return {
        sessionId: session._id,
        containerId: session.containerId,
        status: session.status,
        createdAt: session.startedAt,
        expiresAt: session.expiresAt,
        timeRemainingSeconds: timeRemaining,
        commandCount: session.commandHistory.length,
      };
    });

    info(`Found ${activeSessions.length} active sessions for user ${userId}`);

    res.status(200).json({
      success: true,
      message: "Active sessions retrieved successfully",
      data: {
        userId,
        activeSessions,
        totalCount: activeSessions.length,
      },
    });
  } catch (err) {
    error(`Failed to list active sessions:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to list active sessions",
      error: err.message,
    });
  }
};

/**
 * @desc    Get command history for terminal session
 * @route   GET /api/terminal/:sessionId/history
 * @access  Private
 */
export const getCommandHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const terminalSession = await TerminalSession.findById(sessionId);

    if (!terminalSession) {
      return res.status(404).json({
        success: false,
        message: "Terminal session not found",
      });
    }

    // Verify ownership
    if (terminalSession.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this terminal history",
      });
    }

    info(`Retrieved command history for session ${sessionId}`);

    res.status(200).json({
      success: true,
      message: "Command history retrieved successfully",
      data: {
        sessionId,
        commandCount: terminalSession.commandHistory.length,
        commands: terminalSession.commandHistory,
      },
    });
  } catch (err) {
    error(`Failed to get command history:`, err);
    res.status(500).json({
      success: false,
      message: "Failed to get command history",
      error: err.message,
    });
  }
};
