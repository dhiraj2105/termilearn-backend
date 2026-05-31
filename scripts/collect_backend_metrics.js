import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import Docker from "dockerode";
import { io } from "socket.io-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const WS_URL = process.env.WS_URL || BASE_URL;
const OUTPUT_DIR = path.resolve(__dirname, "../reports");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "backend_metrics.json");
const OUTPUT_TEXT = path.join(OUTPUT_DIR, "backend_metrics.txt");
const docker = new Docker();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeFetch = async (url, options = {}) => {
  const start = performance.now();
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text when JSON parse fails
  }
  return {
    url,
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    durationMs: performance.now() - start,
  };
};

const jsonFetch = async (route, method = "GET", body = null, token = null) => {
  const url = `${BASE_URL}${route}`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return safeFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
};

const connectSocket = async (token) => {
  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
    });

    const cleanup = () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("authenticated");
      socket.off("auth-error");
      socket.off("error");
    };

    socket.on("connect", () => {
      socket.emit("authenticate", { token });
    });

    socket.on("authenticated", (payload) => {
      cleanup();
      resolve(socket);
    });

    socket.on("auth-error", (payload) => {
      cleanup();
      reject(new Error(payload?.message || "WebSocket auth failed"));
    });

    socket.on("connect_error", (err) => {
      cleanup();
      reject(err);
    });

    socket.on("error", (err) => {
      // keep listening for authentication events
    });

    socket.connect();
  });
};

const joinSession = async (socket, sessionId) => {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("joined-terminal");
      socket.off("error");
    };

    socket.on("joined-terminal", (payload) => {
      cleanup();
      resolve(payload);
    });

    socket.on("error", (payload) => {
      cleanup();
      reject(new Error(payload?.message || "Failed to join terminal"));
    });

    socket.emit("join-terminal", { sessionId });
  });
};

const websocketCommand = async (socket, sessionId, command) => {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const onComplete = (payload) => {
      if (payload?.command !== command) {
        return;
      }
      cleanup();
      resolve({
        ...payload,
        durationMs: performance.now() - start,
      });
    };
    const onError = (payload) => {
      cleanup();
      reject(new Error(payload?.message || "WebSocket command failed"));
    };

    const cleanup = () => {
      socket.off("command-complete", onComplete);
      socket.off("command-error", onError);
    };

    socket.on("command-complete", onComplete);
    socket.on("command-error", onError);
    socket.emit("terminal-command", { sessionId, command });
  });
};

const cycleLogin = async (email, password, count = 3) => {
  const latencies = [];
  for (let i = 0; i < count; i += 1) {
    const result = await jsonFetch("/api/auth/login", "POST", {
      email,
      password,
    });
    latencies.push({ ...result, attempt: i + 1 });
    await wait(300);
  }
  return latencies;
};

const pickToken = (authResponse, fallbackResponse) => {
  if (authResponse.ok && authResponse.body?.data?.token) {
    return authResponse.body.data.token;
  }
  if (fallbackResponse?.body?.data?.token) {
    return fallbackResponse.body.data.token;
  }
  return null;
};

const retryAuthRequest = async (route, body, maxAttempts = 5) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await jsonFetch(route, "POST", body);
    if (result.status !== 429) {
      return result;
    }
    console.warn(
      `Auth route ${route} rate-limited on attempt ${attempt}; waiting 60s before retrying...`,
    );
    await wait(60000);
  }
  return await jsonFetch(route, "POST", body);
};

const findDockerContainerByLabel = async (label, value) => {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: [`${label}=${value}`] },
  });
  return containers[0] || null;
};

const getContainerStats = async (dockerId) => {
  const container = docker.getContainer(dockerId);
  const stats = await container.stats({ stream: false });
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuPercent =
    systemDelta > 0
      ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
      : 0;
  const memoryUsage = stats.memory_stats.usage || 0;
  const memoryLimit = stats.memory_stats.limit || 0;
  return {
    containerId: dockerId,
    cpuPercent: Number(cpuPercent.toFixed(2)),
    memoryUsage,
    memoryLimit,
    memoryPercent: memoryLimit
      ? Number(((memoryUsage / memoryLimit) * 100).toFixed(2))
      : 0,
    pidsCurrent: stats.pids_stats?.current || null,
    networks: stats.networks || {},
    read: stats.read,
  };
};

const summarize = (report) => {
  const lines = [];
  lines.push("TermiLearn Backend Metrics Report");
  lines.push(`Generated: ${new Date(report.timestamp).toISOString()}`);
  lines.push(`Backend URL: ${report.baseUrl}`);
  lines.push("");
  lines.push("=== Health ===");
  lines.push(`Docker status: ${report.dockerHealth.status}`);
  lines.push("");

  const addSection = (title, values) => {
    lines.push(`=== ${title} ===`);
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "object") {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`- ${key}: ${value}`);
      }
    }
    lines.push("");
  };

  addSection("Auth", {
    adminRegisterMs: report.auth.adminRegisterMs,
    userRegisterMs: report.auth.userRegisterMs,
    loginLatenciesMs: report.auth.loginLatenciesMs.map((l) =>
      Number(l.toFixed(2)),
    ),
  });

  addSection("Session Startup", {
    sessionACreateMs: report.startup.sessionACreateMs,
    sessionBCreateMs: report.startup.sessionBCreateMs,
  });

  addSection("REST Command Latency", {
    executeMs: report.restCommands.executeMs,
    aliasMs: report.restCommands.aliasMs,
  });

  addSection("WebSocket Latency", {
    iterations: report.websocket.latencies.length,
    meanMs: report.websocket.meanMs.toFixed(2),
    valuesMs: report.websocket.latencies.map((v) => Number(v.toFixed(2))),
  });

  addSection("Throughput", {
    requestCount: report.throughput.requestCount,
    successCount: report.throughput.successCount,
    blockedCount: report.throughput.blockedCount,
    durationMs: report.throughput.durationMs.toFixed(2),
  });

  addSection("Concurrency", {
    sessionsCreated: report.concurrency.sessionsCreated,
    parallelCommandCount: report.concurrency.parallelCommandLatencies.length,
    meanLatencyMs: report.concurrency.meanLatencyMs.toFixed(2),
  });

  addSection("Container Resources", {
    totalContainers: report.resourceUsage.containers.length,
    containers: report.resourceUsage.containers.map((c) => ({
      containerId: c.containerId,
      cpuPercent: c.cpuPercent,
      memoryUsage: c.memoryUsage,
      memoryPercent: c.memoryPercent,
    })),
  });

  addSection("Cleanup", {
    deleteMs: report.cleanup.deleteMs,
    adminCleanupMs: report.cleanup.adminCleanupMs,
    cleanupSummary: report.cleanup.cleanupSummary,
  });

  addSection("Audit & Safety", {
    blockedCommandStatus: report.audit.blockedCommandStatus,
    auditEntriesFound: report.audit.auditEntriesFound,
  });

  addSection("Rate Limiting", {
    authAttempts: report.rateLimit.authAttempts,
    auth429Count: report.rateLimit.auth429Count,
    generalRequests: report.rateLimit.generalRequests,
    general429Count: report.rateLimit.general429Count,
  });

  addSection("Failure Recovery", {
    failureMode: report.failure.mode,
    failureResponse: report.failure.response || report.failure.error,
  });

  return lines.join("\n");
};

const measure = async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = Date.now();
  const report = {
    timestamp,
    baseUrl: BASE_URL,
    wsUrl: WS_URL,
    dockerHealth: null,
    auth: {},
    startup: {},
    restCommands: {},
    websocket: {},
    throughput: {},
    concurrency: {},
    resourceUsage: {},
    cleanup: {},
    audit: {},
    rateLimit: {},
    failure: {},
  };

  try {
    const dockerPing = await docker.ping();
    report.dockerHealth = { status: "healthy", dockerPing };
  } catch (err) {
    report.dockerHealth = { status: "unhealthy", error: err.message };
  }

  const uniqueSuffix = Date.now();
  const adminUser = {
    username: `admin_${uniqueSuffix}`,
    email: `admin_${uniqueSuffix}@termilearn.test`,
    password: `AdminPass123!`,
    role: "admin",
  };
  const regularUser = {
    username: `user_${uniqueSuffix}`,
    email: `user_${uniqueSuffix}@termilearn.test`,
    password: `UserPass123!`,
  };

  const adminRegister = await retryAuthRequest("/api/auth/register", adminUser);
  report.auth.adminRegisterMs = adminRegister.durationMs;
  report.auth.adminRegisterResult = adminRegister.body;

  const adminLogin = await retryAuthRequest("/api/auth/login", {
    email: adminUser.email,
    password: adminUser.password,
  });
  report.auth.adminLoginMs = adminLogin.durationMs;
  report.auth.adminToken = pickToken(adminLogin, adminRegister);
  report.auth.adminTokenSource =
    report.auth.adminToken === adminLogin.body?.data?.token
      ? "login"
      : "register";

  const userRegister = await retryAuthRequest(
    "/api/auth/register",
    regularUser,
  );
  report.auth.userRegisterMs = userRegister.durationMs;
  report.auth.userRegisterResult = userRegister.body;

  const userLogin = await retryAuthRequest("/api/auth/login", {
    email: regularUser.email,
    password: regularUser.password,
  });
  report.auth.userLoginMs = userLogin.durationMs;
  report.auth.userToken = pickToken(userLogin, userRegister);
  report.auth.userTokenSource =
    report.auth.userToken === userLogin.body?.data?.token
      ? "login"
      : "register";

  const loginLatencies = await cycleLogin(
    regularUser.email,
    regularUser.password,
    3,
  );
  report.auth.loginLatenciesMs = loginLatencies.map((item) => item.durationMs);
  report.auth.loginResults = loginLatencies.map((item) => ({
    status: item.status,
    message: item.body?.message || null,
  }));

  const sessionACreate = await jsonFetch(
    "/api/terminal/create",
    "POST",
    {},
    report.auth.userToken,
  );
  report.startup.sessionACreateMs = sessionACreate.durationMs;
  report.startup.sessionA = sessionACreate.body?.data || null;
  const sessionAId = sessionACreate.body?.data?.sessionId;

  const sessionBCreate = await jsonFetch(
    "/api/terminal/create",
    "POST",
    {},
    report.auth.userToken,
  );
  report.startup.sessionBCreateMs = sessionBCreate.durationMs;
  report.startup.sessionB = sessionBCreate.body?.data || null;
  const sessionBId = sessionBCreate.body?.data?.sessionId;

  const restExecute = await jsonFetch(
    `/api/terminal/${sessionAId}/execute`,
    "POST",
    { command: "echo rest-latency" },
    report.auth.userToken,
  );
  report.restCommands.executeMs = restExecute.durationMs;
  report.restCommands.executeResult = restExecute.body;

  const restAlias = await jsonFetch(
    `/api/terminal/${sessionAId}/command`,
    "POST",
    { command: "echo alias-latency" },
    report.auth.userToken,
  );
  report.restCommands.aliasMs = restAlias.durationMs;
  report.restCommands.aliasResult = restAlias.body;

  if (!report.auth.userToken) {
    throw new Error(
      "Unable to proceed: no valid user token available for WebSocket tests.",
    );
  }

  const socket = await connectSocket(report.auth.userToken);
  report.websocket.connection = "connected";
  await joinSession(socket, sessionAId);

  const wsLatencies = [];
  for (let i = 0; i < 5; i += 1) {
    const command = `echo ws-${i}`;
    const result = await websocketCommand(socket, sessionAId, command);
    wsLatencies.push(result.durationMs);
    report.websocket[`iteration${i + 1}`] = result;
    await wait(100);
  }
  report.websocket.latencies = wsLatencies;
  report.websocket.meanMs =
    wsLatencies.reduce((sum, v) => sum + v, 0) / wsLatencies.length;
  socket.disconnect();

  const concurrencySessions = [];
  const concurrencyCommands = [];
  for (let i = 0; i < 3; i += 1) {
    const session = await jsonFetch(
      "/api/terminal/create",
      "POST",
      {},
      report.auth.userToken,
    );
    concurrencySessions.push(session.body?.data?.sessionId);
    await wait(200);
  }
  report.concurrency.sessionsCreated = concurrencySessions.length;

  const parallelPromises = concurrencySessions.map(async (sessionId, index) => {
    const command = `echo concurrency-${index}`;
    const start = performance.now();
    const result = await jsonFetch(
      `/api/terminal/${sessionId}/execute`,
      "POST",
      { command },
      report.auth.userToken,
    );
    const durationMs = performance.now() - start;
    concurrencyCommands.push({
      sessionId,
      durationMs,
      status: result.status,
      body: result.body,
    });
    return result;
  });
  await Promise.all(parallelPromises);
  report.concurrency.parallelCommandLatencies = concurrencyCommands.map(
    (item) => item.durationMs,
  );
  report.concurrency.meanLatencyMs =
    concurrencyCommands.reduce((sum, item) => sum + item.durationMs, 0) /
    concurrencyCommands.length;
  report.concurrency.detail = concurrencyCommands;

  const allContainers = await docker.listContainers({ all: true });
  const backendContainers = allContainers.filter((c) =>
    c.Names.some((n) => n.includes("termilearn-")),
  );
  const resourceStats = [];
  for (const item of backendContainers) {
    const dockerId = item.Id;
    try {
      const stats = await getContainerStats(dockerId);
      resourceStats.push({ containerId: item.Names[0], dockerId, ...stats });
    } catch (err) {
      resourceStats.push({
        containerId: item.Names[0],
        dockerId,
        error: err.message,
      });
    }
  }
  report.resourceUsage = {
    containers: resourceStats,
    containerCount: backendContainers.length,
  };

  const deleteStart = performance.now();
  const deleteSessionResponse = await jsonFetch(
    `/api/terminal/${sessionAId}`,
    "DELETE",
    null,
    report.auth.userToken,
  );
  report.cleanup.deleteMs = performance.now() - deleteStart;
  report.cleanup.deleteResult = deleteSessionResponse.body;

  const cleanupStart = performance.now();
  const adminCleanupResponse = await jsonFetch(
    "/api/terminal/cleanup",
    "POST",
    {},
    report.auth.adminToken,
  );
  report.cleanup.adminCleanupMs = performance.now() - cleanupStart;
  report.cleanup.cleanupSummary = adminCleanupResponse.body;

  const blockedCommand = await jsonFetch(
    `/api/terminal/${sessionBId}/execute`,
    "POST",
    { command: "rm -rf /" },
    report.auth.userToken,
  );
  report.audit.blockedCommandStatus = blockedCommand.status;
  report.audit.blockedCommand = blockedCommand.body;

  const safeCommand = await jsonFetch(
    `/api/terminal/${sessionBId}/execute`,
    "POST",
    { command: "echo audit-check" },
    report.auth.userToken,
  );
  report.audit.safeCommandStatus = safeCommand.status;
  report.audit.safeCommand = safeCommand.body;

  const auditLog = await jsonFetch(
    `/api/terminal/${sessionBId}/audit`,
    "GET",
    null,
    report.auth.userToken,
  );
  report.audit.auditEntries = auditLog.body?.data;
  report.audit.auditEntriesFound = Array.isArray(
    auditLog.body?.data?.auditEntries,
  )
    ? auditLog.body.data.auditEntries.length
    : 0;

  const authTestCount = 12;
  let auth429Count = 0;
  for (let i = 0; i < authTestCount; i += 1) {
    const result = await jsonFetch("/api/auth/login", "POST", {
      email: regularUser.email,
      password: regularUser.password,
    });
    if (result.status === 429) {
      auth429Count += 1;
    }
    await wait(100);
  }
  report.rateLimit = {
    authAttempts: authTestCount,
    auth429Count,
  };

  const failureSession = await jsonFetch(
    "/api/terminal/create",
    "POST",
    {},
    report.auth.userToken,
  );
  const failureSessionId = failureSession.body?.data?.sessionId;
  const failureContainerId = failureSession.body?.data?.containerId;
  report.failure.createdSession = failureSession.body;

  const failureContainers = await docker.listContainers({ all: true });
  const failureDockerContainer = failureContainers.find((c) =>
    c.Names.some((name) => name.includes(failureContainerId)),
  );
  if (failureDockerContainer) {
    try {
      await docker.getContainer(failureDockerContainer.Id).stop({ t: 2 });
      await docker
        .getContainer(failureDockerContainer.Id)
        .remove({ force: true });
      report.failure.mode = "container-killed";
      const failureCommand = await jsonFetch(
        `/api/terminal/${failureSessionId}/execute`,
        "POST",
        { command: "echo after-kill" },
        report.auth.userToken,
      );
      report.failure.response = failureCommand.body;
    } catch (error) {
      report.failure.error = error.message;
    }
  } else {
    report.failure.mode = "container-not-found-for-kill";
    report.failure.error =
      "Could not locate the created container for failure recovery test.";
  }

  const throughputStart = performance.now();
  const throughputRequests = 120;
  let successCount = 0;
  let blockedCount = 0;
  for (let i = 0; i < throughputRequests; i += 1) {
    const result = await jsonFetch(
      "/api/terminal/list",
      "GET",
      null,
      report.auth.userToken,
    );
    if (result.status === 429) {
      blockedCount += 1;
    } else if (result.ok) {
      successCount += 1;
    }
    await wait(50);
  }
  const throughputEnd = performance.now();
  report.throughput = {
    requestCount: throughputRequests,
    successCount,
    blockedCount,
    durationMs: throughputEnd - throughputStart,
    requestRatePerSecond:
      throughputRequests / ((throughputEnd - throughputStart) / 1000),
  };

  report.rateLimit = {
    authAttempts: authTestCount,
    auth429Count,
    generalRequests: throughputRequests,
    general429Count: blockedCount,
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2));
  await writeFile(OUTPUT_TEXT, summarize(report));
  console.log(`Metrics collection finished. JSON report: ${OUTPUT_JSON}`);
  console.log(`Text summary: ${OUTPUT_TEXT}`);
};

measure().catch((err) => {
  console.error("Measurement script failed:", err);
  process.exit(1);
});
