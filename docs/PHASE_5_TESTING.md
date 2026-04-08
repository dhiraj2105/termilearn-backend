# Phase 5 Testing Guide: WebSocket for Real-time Terminal

## Overview

Phase 5 implements WebSocket integration for real-time terminal interactions using Socket.io. This enables live command execution with streaming output, multi-user terminal sharing, and real-time session management.

## Prerequisites

1. **Server Running**: Ensure the backend server is running on port 5000
2. **Docker Running**: Docker daemon must be active for container operations
3. **User Authentication**: Valid JWT token from user registration/login
4. **Terminal Session**: Active terminal session created via REST API

## WebSocket Connection Setup

### 1. Establish WebSocket Connection

```javascript
// Client-side connection (example)
import io from "socket.io-client";

const socket = io("http://localhost:5000", {
  transports: ["websocket", "polling"],
});
```

### 2. Authenticate WebSocket Connection

```javascript
// Send JWT token for authentication
socket.emit("authenticate", {
  token: "your-jwt-token-here",
});

// Listen for authentication response
socket.on("authenticated", (data) => {
  console.log("Authenticated:", data);
});

socket.on("auth-error", (error) => {
  console.error("Authentication failed:", error);
});
```

## Terminal Session Management

### 3. Join Terminal Session

```javascript
// Join an existing terminal session
socket.emit("join-terminal", {
  sessionId: "your-session-id-here",
});

// Listen for join confirmation
socket.on("joined-terminal", (data) => {
  console.log("Joined terminal:", data);
});

socket.on("error", (error) => {
  console.error("Join failed:", error);
});
```

### 4. Execute Commands with Real-time Streaming

```javascript
// Execute a command
socket.emit("terminal-command", {
  sessionId: "your-session-id-here",
  command: "ls -la",
});

// Listen for command lifecycle events
socket.on("command-start", (data) => {
  console.log("Command started:", data.command);
});

socket.on("command-output", (data) => {
  console.log("Output:", data.output, "isStdout:", data.isStdout);
});

socket.on("command-complete", (data) => {
  console.log("Command completed:", data);
});

socket.on("command-error", (error) => {
  console.error("Command error:", error);
});
```

## Complete Testing Workflow

### Step 1: User Registration and Login

```bash
# Register a new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login to get JWT token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Extract token from response
# TOKEN="your-jwt-token-here"
```

### Step 2: Create Terminal Session

```bash
# Create a new terminal session
curl -X POST http://localhost:5000/api/terminal/create \
  -H "Authorization: Bearer $TOKEN"

# Extract sessionId from response
# SESSION_ID="your-session-id-here"
```

### Step 3: Test WebSocket Connection

#### Using Node.js Test Script

Create a test file `websocket-test.js`:

```javascript
import io from "socket.io-client";

const TOKEN = "your-jwt-token-here";
const SESSION_ID = "your-session-id-here";

const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("Connected to WebSocket server");

  // Authenticate
  socket.emit("authenticate", { token: TOKEN });
});

socket.on("authenticated", (data) => {
  console.log("Authenticated successfully");

  // Join terminal session
  socket.emit("join-terminal", { sessionId: SESSION_ID });
});

socket.on("joined-terminal", (data) => {
  console.log("Joined terminal session");

  // Execute a simple command
  socket.emit("terminal-command", {
    sessionId: SESSION_ID,
    command: 'echo "Hello from WebSocket!"',
  });
});

socket.on("command-start", (data) => {
  console.log("Command started:", data.command);
});

socket.on("command-output", (data) => {
  console.log("Output:", data.output);
});

socket.on("command-complete", (data) => {
  console.log("Command completed with exit code:", data.exitCode);

  // Execute another command
  socket.emit("terminal-command", {
    sessionId: SESSION_ID,
    command: "pwd",
  });
});

socket.on("error", (error) => {
  console.error("Error:", error);
});

socket.on("command-error", (error) => {
  console.error("Command error:", error);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});
```

Run the test:

```bash
cd /home/dhiraj/Documents/main/termiLearn/termilearn-backend
node websocket-test.js
```

### Step 4: Test Multiple Commands

Execute various commands to test streaming:

```javascript
// Test commands
const testCommands = [
  "ls -la",
  "pwd",
  "whoami",
  "ps aux | head -10",
  'echo "Testing streaming output..." && sleep 1 && echo "Done!"',
  'for i in {1..5}; do echo "Line $i"; sleep 0.5; done',
];

testCommands.forEach((cmd, index) => {
  setTimeout(() => {
    socket.emit("terminal-command", {
      sessionId: SESSION_ID,
      command: cmd,
    });
  }, index * 2000); // Space out commands
});
```

### Step 5: Test Error Handling

```javascript
// Test invalid commands
socket.emit("terminal-command", {
  sessionId: SESSION_ID,
  command: "invalidcommand",
});

socket.emit("terminal-command", {
  sessionId: SESSION_ID,
  command: "rm -rf /", // Should be blocked/safe
});
```

### Step 6: Test Session Management

```javascript
// Test heartbeat
socket.emit("heartbeat");
socket.on("heartbeat-response", () => {
  console.log("Heartbeat received");
});

// Test terminal resize (for future implementation)
socket.emit("terminal-resize", {
  sessionId: SESSION_ID,
  cols: 80,
  rows: 24,
});
```

## Expected Behavior

### Successful Command Execution Flow:

1. **command-start**: Emitted when command begins execution
2. **command-output**: Emitted for each chunk of output (stdout/stderr)
3. **command-complete**: Emitted when command finishes with full results

### Error Scenarios:

- **Invalid token**: `auth-error` event
- **Session not found**: `error` or `command-error` event
- **Command timeout**: `command-error` with timeout message
- **Container not running**: `command-error` with container status

## Multi-User Testing

### Test 1: Multiple Clients in Same Session

1. Open two terminal windows
2. Run the test script in both
3. Execute commands from one client
4. Verify output appears in both clients

### Test 2: User Isolation

1. Create two different user accounts
2. Create separate terminal sessions
3. Attempt to join another user's session
4. Verify access is denied

## Docker Container Inspection

During testing, inspect containers:

```bash
# List running containers
docker ps

# Check container logs
docker logs container-name

# Inspect container details
docker inspect container-name
```

## Performance Testing

### Test 1: Concurrent Commands

```javascript
// Send multiple commands rapidly
for (let i = 0; i < 10; i++) {
  socket.emit("terminal-command", {
    sessionId: SESSION_ID,
    command: `echo "Command ${i}"`,
  });
}
```

### Test 2: Large Output

```javascript
socket.emit("terminal-command", {
  sessionId: SESSION_ID,
  command: 'find / -type f -name "*.log" 2>/dev/null | head -50',
});
```

## Cleanup

After testing:

```bash
# Delete terminal session via REST API
curl -X DELETE http://localhost:5000/api/terminal/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN"

# Verify container is removed
docker ps -a
```

## Success Criteria

✅ WebSocket connection establishes successfully
✅ JWT authentication works
✅ Terminal session joining works
✅ Commands execute with real-time streaming output
✅ Command history is saved to database
✅ Multiple clients can join same session
✅ User isolation prevents unauthorized access
✅ Error handling works for invalid commands/sessions
✅ Container cleanup works after session deletion

## Troubleshooting

### Common Issues:

1. **Connection fails**: Check server is running on port 5000
2. **Authentication fails**: Verify JWT token is valid and not expired
3. **Session join fails**: Ensure session exists and user owns it
4. **Commands don't execute**: Check Docker daemon is running
5. **No output streaming**: Verify WebSocket events are being listened to

### Debug Commands:

```bash
# Check server logs
tail -f /home/dhiraj/Documents/main/termiLearn/termilearn-backend/logs/app.log

# Check Docker status
docker ps
docker system info

# Test WebSocket connection manually
curl -I http://localhost:5000
```
