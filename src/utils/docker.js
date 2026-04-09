import Docker from "dockerode";
import { info, error } from "./logger.js";

// Initialize Docker client
const docker = new Docker();

// Alpine Linux image
const IMAGE = "alpine:latest";
const CONTAINER_PREFIX = "termilearn-";

/**
 * Pull or ensure Docker image exists
 */
export const ensureImageExists = async () => {
  try {
    const images = await docker.listImages();
    const imageExists = images.some(
      (img) => img.RepoTags && img.RepoTags.includes(IMAGE),
    );

    if (!imageExists) {
      info(`Pulling Docker image: ${IMAGE}`);
      await new Promise((resolve, reject) => {
        docker.pull(IMAGE, (err, stream) => {
          if (err) {
            reject(err);
          }
          docker.modem.followProgress(stream, (err, res) => {
            if (err) reject(err);
            else {
              info(`Successfully pulled Docker image: ${IMAGE}`);
              resolve(res);
            }
          });
        });
      });
    } else {
      info(`Docker image already exists: ${IMAGE}`);
    }
  } catch (err) {
    error("Failed to ensure Docker image:", err);
    throw err;
  }
};

/**
 * Create a new isolated container for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Container ID and initialization info
 */
export const createContainer = async (userId) => {
  try {
    // Ensure image exists
    await ensureImageExists();

    // Generate unique container name
    const timestamp = Date.now();
    const containerName = `${CONTAINER_PREFIX}${userId}-${timestamp}`;
    const containerId = `${userId}-${timestamp}`;

    info(`Creating container: ${containerName} for user: ${userId}`);

    // Create container with isolated Linux environment
    const container = await docker.createContainer({
      Image: IMAGE,
      name: containerName,
      Hostname: `termilearn-${userId}`,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Cmd: ["/bin/sh"],
      HostConfig: {
        // Resource limits for security
        Memory: 256 * 1024 * 1024, // 256MB max RAM
        MemorySwap: 256 * 1024 * 1024, // No swap
        CpuShares: 512, // CPU limit
        PidsLimit: 100, // Max processes
        // Network isolation
        NetworkMode: "bridge",
        // Read-only root filesystem with temp writable areas
        ReadonlyRootfs: false,
        // Don't allow privilege escalation
        SecurityOpt: ["no-new-privileges:true"],
      },
      Labels: {
        "termilearn.userId": userId,
        "termilearn.createdAt": new Date().toISOString(),
      },
      Env: ["NODE_ENV=production", `USER_ID=${userId}`],
    });

    // Start container
    await container.start();

    info(
      `Container started successfully: ${containerName} (${container.id.substring(0, 12)})`,
    );

    return {
      containerId,
      containerDockerID: container.id.substring(0, 12),
      containerName,
      status: "active",
      createdAt: new Date(),
    };
  } catch (err) {
    error(`Failed to create container for user ${userId}:`, err);
    throw new Error(`Container creation failed: ${err.message}`);
  }
};

/**
 * Execute a command in a container with real-time streaming
 * @param {string} containerId - The container ID from our system (not Docker ID)
 * @param {string} command - The command to execute
 * @param {function} onData - Callback for data chunks (data, isStdout)
 * @param {function} onEnd - Callback when execution ends (exitCode)
 * @param {function} onError - Callback for errors
 * @param {number} timeout - Timeout in milliseconds (default 5000)
 */
export const executeCommandStream = async (
  containerId,
  command,
  onData,
  onEnd,
  onError,
  timeout = 5000,
) => {
  try {
    // Find container by our ID format
    const containers = await docker.listContainers({ all: true });
    const dockerContainer = containers.find(
      (c) =>
        c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
    );

    if (!dockerContainer) {
      throw new Error(`Container not found: ${containerId}`);
    }

    const container = docker.getContainer(dockerContainer.Id);

    info(`Streaming command execution in container ${containerId}: ${command}`);

    // Create execution instance
    const exec = await container.exec({
      Cmd: ["/bin/sh", "-c", command],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    // Execute with timeout
    const executePromise = exec.start({ Detach: false, Tty: false });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Command execution timeout")), timeout),
    );

    const stream = await Promise.race([executePromise, timeoutPromise]);

    // Handle streaming output
    stream.on("data", (chunk) => {
      // Docker multiplexes stdout and stderr
      // First byte indicates stream type: 0x01 = stdout, 0x02 = stderr
      const firstByte = chunk[0];
      const data = chunk.slice(1).toString();

      if (firstByte === 1) {
        onData(data, true); // stdout
      } else if (firstByte === 2) {
        onData(data, false); // stderr
      } else {
        onData(data, true); // fallback to stdout
      }
    });

    stream.on("error", (err) => {
      error(`Stream error in container ${containerId}:`, err);
      onError(err);
    });

    stream.on("end", async () => {
      try {
        // Get exit code
        const inspect = await exec.inspect();
        const exitCode = inspect.ExitCode;

        info(
          `Streaming command completed with exit code ${exitCode} in container ${containerId}`,
        );

        onEnd(exitCode);
      } catch (err) {
        error(`Failed to get exit code for container ${containerId}:`, err);
        onError(err);
      }
    });
  } catch (err) {
    error(
      `Failed to execute streaming command in container ${containerId}:`,
      err,
    );
    onError(err);
  }
};
export const executeCommand = async (containerId, command, timeout = 5000) => {
  try {
    // Find container by our ID format
    const containers = await docker.listContainers({ all: true });
    const dockerContainer = containers.find(
      (c) =>
        c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
    );

    if (!dockerContainer) {
      throw new Error(`Container not found: ${containerId}`);
    }

    const container = docker.getContainer(dockerContainer.Id);

    info(`Executing command in container ${containerId}: ${command}`);

    // Create execution instance
    const exec = await container.exec({
      Cmd: ["/bin/sh", "-c", command],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    // Execute with timeout
    const executePromise = exec.start({ Detach: false, Tty: false });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Command execution timeout")), timeout),
    );

    const stream = await Promise.race([executePromise, timeoutPromise]);

    // Collect output
    let stdout = "";
    let stderr = "";

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      stream.on("error", (err) => {
        reject(err);
      });

      stream.on("end", async () => {
        // Get exit code
        const inspect = await exec.inspect();
        const exitCode = inspect.ExitCode;

        info(
          `Command executed with exit code ${exitCode} in container ${containerId}`,
        );

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          command,
        });
      });
    });
  } catch (err) {
    error(`Failed to execute command in container ${containerId}:`, err);
    throw new Error(`Command execution failed: ${err.message}`);
  }
};

/**
 * Get container status
 * @param {string} containerId - The container ID from our system
 * @returns {Promise<Object>} Container status information
 */
export const getContainerStatus = async (containerId) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const dockerContainer = containers.find(
      (c) =>
        c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
    );

    if (!dockerContainer) {
      return {
        status: "not_found",
        containerId,
        message: "Container not found",
      };
    }

    const container = docker.getContainer(dockerContainer.Id);
    const inspect = await container.inspect();

    return {
      status: inspect.State.Running ? "running" : inspect.State.Status,
      containerId,
      containerDockerID: dockerContainer.Id.substring(0, 12),
      uptime: inspect.State.StartedAt,
      memory: inspect.HostConfig.Memory,
      cpu: inspect.HostConfig.CpuShares,
      isRunning: inspect.State.Running,
      isPaused: inspect.State.Paused,
      details: inspect.State,
    };
  } catch (err) {
    error(`Failed to get container status for ${containerId}:`, err);
    throw new Error(`Status check failed: ${err.message}`);
  }
};

// export const getContainerMetrics = async (containerId) => {
//   try {
//     const containers = await docker.listContainers({ all: true });
//     const dockerContainer = containers.find(
//       (c) =>
//         c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
//     );

//     if (!dockerContainer) {
//       return {
//         message: "Container not found",
//         containerId,
//       };
//     }

//     const container = docker.getContainer(dockerContainer.Id);
//     const statsStream = await new Promise((resolve, reject) => {
//       container.stats({ stream: false }, (err, stream) => {
//         if (err) {
//           reject(err);
//           return;
//         }
//         resolve(stream);
//       });
//     });

//     const chunks = [];
//     return await new Promise((resolve, reject) => {
//       statsStream.on("data", (chunk) => chunks.push(chunk));
//       statsStream.on("end", () => {
//         try {
//           const raw = JSON.parse(Buffer.concat(chunks).toString());
//           const cpuDelta =
//             raw.cpu_stats.cpu_usage.total_usage -
//             raw.precpu_stats.cpu_usage.total_usage;
//           const systemDelta =
//             raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
//           const cpuPercent =
//             systemDelta > 0
//               ? (cpuDelta / systemDelta) * raw.cpu_stats.online_cpus * 100
//               : 0;
//           const memoryUsage = raw.memory_stats.usage || 0;
//           const memoryLimit = raw.memory_stats.limit || 0;
//           const memoryPercent = memoryLimit
//             ? (memoryUsage / memoryLimit) * 100
//             : 0;

//           resolve({
//             containerId,
//             cpuPercent: Number(cpuPercent.toFixed(2)),
//             memoryUsage,
//             memoryLimit,
//             memoryPercent: Number(memoryPercent.toFixed(2)),
//             pidsCurrent: raw.pids_stats?.current || null,
//             networks: raw.networks || {},
//             read: raw.read,
//           });
//         } catch (parseErr) {
//           reject(parseErr);
//         }
//       });
//       statsStream.on("error", reject);
//     });
//   } catch (err) {
//     error(`Failed to get container metrics for ${containerId}:`, err);
//     return {
//       containerId,
//       error: err.message,
//     };
//   }
// };
export const getContainerMetrics = async (containerId) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const dockerContainer = containers.find(
      (c) =>
        c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
    );

    if (!dockerContainer) {
      return {
        message: "Container not found",
        containerId,
      };
    }

    const container = docker.getContainer(dockerContainer.Id);

    const raw = await container.stats({ stream: false });

    const cpuDelta =
      raw.cpu_stats.cpu_usage.total_usage -
      raw.precpu_stats.cpu_usage.total_usage;

    const systemDelta =
      raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;

    const cpuPercent =
      systemDelta > 0
        ? (cpuDelta / systemDelta) * raw.cpu_stats.online_cpus * 100
        : 0;

    const memoryUsage = raw.memory_stats.usage || 0;
    const memoryLimit = raw.memory_stats.limit || 0;

    const memoryPercent = memoryLimit ? (memoryUsage / memoryLimit) * 100 : 0;

    return {
      containerId,
      cpuPercent: Number(cpuPercent.toFixed(2)),
      memoryUsage,
      memoryLimit,
      memoryPercent: Number(memoryPercent.toFixed(2)),
      pidsCurrent: raw.pids_stats?.current || null,
      networks: raw.networks || {},
      read: raw.read,
    };
  } catch (err) {
    error(`Failed to get container metrics for ${containerId}:`, err);

    return {
      containerId,
      error: err.message,
    };
  }
};

/**
 * Delete/stop and remove a container
 * @param {string} containerId - The container ID from our system
 * @returns {Promise<Object>} Deletion status
 */
export const deleteContainer = async (containerId) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const dockerContainer = containers.find(
      (c) =>
        c.Names[0].includes(containerId) || c.Labels?.["termilearn.userId"],
    );

    if (!dockerContainer) {
      throw new Error(`Container not found: ${containerId}`);
    }

    const container = docker.getContainer(dockerContainer.Id);

    info(`Stopping container: ${containerId}`);
    await container.stop({ t: 5 }); // 5 second timeout

    info(`Removing container: ${containerId}`);
    await container.remove();

    info(`Container successfully deleted: ${containerId}`);

    return {
      success: true,
      containerId,
      message: "Container stopped and removed",
    };
  } catch (err) {
    // Container might already be stopped, try to remove directly
    try {
      const containers = await docker.listContainers({ all: true });
      const dockerContainer = containers.find((c) =>
        c.Names[0].includes(containerId),
      );
      if (dockerContainer) {
        const container = docker.getContainer(dockerContainer.Id);
        await container.remove({ force: true });
        info(`Container force removed: ${containerId}`);
      }
    } catch (removeErr) {
      error(`Failed to remove container ${containerId}:`, removeErr);
    }

    throw new Error(`Container deletion failed: ${err.message}`);
  }
};

/**
 * Clean up all expired/terminated containers for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Cleanup summary
 */
export const cleanupUserContainers = async (userId) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const userContainers = containers.filter(
      (c) => c.Labels?.["termilearn.userId"] === userId,
    );

    info(`Found ${userContainers.length} containers for user ${userId}`);

    let removed = 0;
    for (const container of userContainers) {
      try {
        const c = docker.getContainer(container.Id);
        await c.stop({ t: 5 });
        await c.remove();
        removed++;
        info(`Removed container: ${container.Id.substring(0, 12)}`);
      } catch (err) {
        error(
          `Failed to remove container ${container.Id.substring(0, 12)}:`,
          err,
        );
      }
    }

    info(`Cleanup completed for user ${userId}: ${removed} containers removed`);
    return {
      success: true,
      userId,
      containersRemoved: removed,
      totalFound: userContainers.length,
    };
  } catch (err) {
    error(`Failed to cleanup user containers for ${userId}:`, err);
    throw new Error(`Cleanup failed: ${err.message}`);
  }
};

/**
 * List all active containers for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} List of active containers
 */
export const listUserContainers = async (userId) => {
  try {
    const containers = await docker.listContainers();
    const userContainers = containers.filter(
      (c) =>
        c.Labels?.["termilearn.userId"] === userId && c.State === "running",
    );

    info(`Found ${userContainers.length} active containers for user ${userId}`);

    return userContainers.map((c) => ({
      containerDockerID: c.Id.substring(0, 12),
      containerName: c.Names[0],
      status: c.State,
      createdAt: new Date(c.Created * 1000),
      labels: c.Labels,
    }));
  } catch (err) {
    error(`Failed to list user containers for ${userId}:`, err);
    throw new Error(`List failed: ${err.message}`);
  }
};

/**
 * List all containers (for cleanup operations)
 * @returns {Promise<Array>} List of all containers
 */
export const listAllContainers = async () => {
  try {
    const containers = await docker.listContainers({ all: true });
    info(`Found ${containers.length} total containers`);

    return containers.map((c) => ({
      Id: c.Id,
      Names: c.Names,
      Image: c.Image,
      State: c.State,
      Status: c.Status,
      Created: c.Created,
      Labels: c.Labels,
    }));
  } catch (err) {
    error("Failed to list all containers:", err);
    throw new Error(`List all containers failed: ${err.message}`);
  }
};

/**
 * Health check - verify Docker daemon is accessible
 */
export const checkDockerHealth = async () => {
  try {
    const info_result = await docker.ping();
    info("Docker daemon is accessible");
    return {
      status: "healthy",
      docker: "connected",
    };
  } catch (err) {
    error("Docker daemon is not accessible:", err);
    return {
      status: "unhealthy",
      docker: "disconnected",
      error: err.message,
    };
  }
};

export default {
  ensureImageExists,
  createContainer,
  executeCommand,
  getContainerStatus,
  getContainerMetrics,
  deleteContainer,
  cleanupUserContainers,
  listUserContainers,
  listAllContainers,
  checkDockerHealth,
};
