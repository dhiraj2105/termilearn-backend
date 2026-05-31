/**
 * ============================================
 * WebSocket Terminal Debug Client (FULL DEBUG)
 * ============================================
 *
 * Features:
 * - Prevents duplicate events
 * - Deep debug logs for backend issues
 * - Validates token/session flow
 * - Tracks full lifecycle
 *
 * Usage:
 * node websocket-client.js
 *
 * ============================================
 */

import io from "socket.io-client";

// ==========================
// 🔧 CONFIGURATION
// ==========================
const SERVER_URL = "http://localhost:5000";

// ⚠️ MUST be fresh (same user for both)
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWQ3OWY1M2FkNWM3NDU2YzI2NGE5MzIiLCJpYXQiOjE3NzY0NDc2NzksImV4cCI6MTc3NzA1MjQ3OX0.J2j6AR0GnsYkM2v1rGwewlbp2uD7IaTWgNfs05GKIgE";
const SESSION_ID = "69e272297d9e7ab766cbd834";

// ==========================
// 🧠 INTERNAL STATE
// ==========================
let state = {
  connected: false,
  authenticated: false,
  joined: false,
};

// ==========================
// 🛠️ DEBUG UTILITIES
// ==========================
function logSection(title) {
  console.log("\n====================================");
  console.log(`🔷 ${title}`);
  console.log("====================================");
}

function logKeyValue(key, value) {
  console.log(`👉 ${key}:`, value);
}

function debugState() {
  console.log("\n🧠 CURRENT STATE:");
  console.log(JSON.stringify(state, null, 2));
}

// ==========================
// 🚀 SOCKET INIT
// ==========================
const socket = io(SERVER_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 3,
  timeout: 5000,
});

// ==========================
// 📡 CONNECTION EVENTS
// ==========================
socket.on("connect", () => {
  state.connected = true;

  logSection("CONNECTED");
  logKeyValue("Socket ID", socket.id);
  logKeyValue("Server URL", SERVER_URL);

  debugState();

  console.log("\n🔐 Sending AUTH request...");
  socket.emit("authenticate", { token: TOKEN });
});

socket.on("disconnect", (reason) => {
  state.connected = false;

  logSection("DISCONNECTED");
  logKeyValue("Reason", reason);

  debugState();
});

// ==========================
// 🔐 AUTH EVENTS
// ==========================
socket.on("authenticated", (data) => {
  if (state.authenticated) {
    console.log("⚠️ Duplicate AUTH event ignored");
    return;
  }

  state.authenticated = true;

  logSection("AUTH SUCCESS");

  logKeyValue("Auth Response", data);

  if (TOKEN) {
    console.log("🔍 Token Preview:", TOKEN.slice(0, 25) + "...");
  }

  debugState();

  console.log("\n📟 Sending JOIN request...");
  socket.emit("join-terminal", {
    sessionId: SESSION_ID,
  });
});

socket.on("auth-error", (err) => {
  logSection("AUTH FAILED");

  console.error("❌ Error:", err);

  debugState();
});

// ==========================
// 💻 TERMINAL JOIN EVENTS
// ==========================
socket.on("joined-terminal", (data) => {
  if (state.joined) {
    console.log("⚠️ Duplicate JOIN ignored");
    return;
  }

  state.joined = true;

  logSection("JOIN SUCCESS");

  logKeyValue("Session ID (client)", SESSION_ID);
  logKeyValue("Join Response", data);

  debugState();

  console.log("\n🧪 Starting command tests...\n");

  runTestCommands();
});

// ==========================
// ❌ GLOBAL ERROR HANDLER
// ==========================
socket.on("error", (err) => {
  logSection("SERVER ERROR");

  console.error("❌ Full Error Object:", err);

  if (err?.message) {
    console.error("👉 Message:", err.message);
  }

  console.log("\n🔍 DEBUG INFO:");
  logKeyValue("Session ID (client)", SESSION_ID);
  logKeyValue("Token Preview", TOKEN.slice(0, 25) + "...");

  debugState();

  console.log("\n⚠️ POSSIBLE ISSUES:");
  console.log("1. Session does not exist in DB");
  console.log("2. Session belongs to different user");
  console.log("3. JWT userId mismatch");
  console.log("4. ObjectId vs string comparison bug");
});

// ==========================
// ⚡ COMMAND EVENTS
// ==========================
socket.on("command-start", (data) => {
  console.log("\n🚀 COMMAND STARTED");
  logKeyValue("Command", data.command);
});

socket.on("command-output", (data) => {
  if (data.isStdout) {
    process.stdout.write(data.output);
  } else {
    process.stderr.write(data.output);
  }
});

socket.on("command-complete", (data) => {
  console.log("\n✅ COMMAND COMPLETE");
  logKeyValue("Exit Code", data.exitCode);
});

socket.on("command-error", (err) => {
  console.error("\n❌ COMMAND ERROR:", err);
});

// ==========================
// 💓 HEARTBEAT
// ==========================
setInterval(() => {
  socket.emit("heartbeat");
}, 5000);

socket.on("heartbeat-response", () => {
  console.log("💓 Heartbeat OK");
});

// ==========================
// 🧪 TEST COMMANDS
// ==========================
function runTestCommands() {
  const commands = [
    'echo "🔥 START TEST"',
    "whoami",
    "pwd",
    "ls -la",
    'for i in {1..3}; do echo "Line $i"; sleep 0.5; done',
    "invalidcommand",
  ];

  commands.forEach((cmd, index) => {
    setTimeout(() => {
      console.log("\n📤 Sending Command:");
      console.log("👉", cmd);

      socket.emit("terminal-command", {
        sessionId: SESSION_ID,
        command: cmd,
      });
    }, index * 3000);
  });

  // 🔥 Concurrent test
  setTimeout(() => {
    logSection("CONCURRENT TEST");

    for (let i = 0; i < 3; i++) {
      socket.emit("terminal-command", {
        sessionId: SESSION_ID,
        command: `echo "Concurrent ${i}"`,
      });
    }
  }, commands.length * 3000);
}

// ==========================
// 🛑 EXIT HANDLING
// ==========================
process.on("SIGINT", () => {
  logSection("SHUTDOWN");

  socket.disconnect();
  process.exit();
});
