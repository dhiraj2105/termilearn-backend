# Phase 4: Terminal Management with Docker - Testing Guide

## Prerequisites

1. **Docker must be installed and running**

   ```bash
   docker --version
   docker ps
   ```

2. **MongoDB must be running**

   ```bash
   # Verify MongoDB is accessible
   mongosh mongodb://localhost:27017
   ```

3. **Backend server must be running**
   ```bash
   cd termilearn-backend
   npm run dev
   ```

## Testing Workflow

### Step 1: Register a User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpass123"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "username": "testuser",
      "email": "test@example.com",
      "_id": "..."
    },
    "token": "eyJhbGc..."
  }
}
```

**Save the token from response** - you'll need it for subsequent requests.

### Step 2: Create a Terminal Session

```bash
curl -X POST http://localhost:5000/api/terminal/create \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Terminal session created successfully",
  "data": {
    "sessionId": "...",
    "containerId": "testuser-1234567890",
    "containerName": "termilearn-testuser-1234567890",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "expiresAt": "2024-01-15T11:00:00.000Z",
    "durationMinutes": 30
  }
}
```

**Save the sessionId from response** - you'll need it for terminal operations.

### Step 3: List Active Terminal Sessions

```bash
curl -X GET http://localhost:5000/api/terminal/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Active sessions retrieved successfully",
  "data": {
    "userId": "...",
    "activeSessions": [
      {
        "sessionId": "...",
        "containerId": "testuser-1234567890",
        "status": "active",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "expiresAt": "2024-01-15T11:00:00.000Z",
        "timeRemainingSeconds": 1800,
        "commandCount": 0
      }
    ],
    "totalCount": 1
  }
}
```

### Step 4: Get Terminal Session Status

```bash
curl -X GET http://localhost:5000/api/terminal/SESSION_ID_HERE \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Terminal session status retrieved",
  "data": {
    "sessionId": "...",
    "containerId": "testuser-1234567890",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "expiresAt": "2024-01-15T11:00:00.000Z",
    "timeRemainingSeconds": 1795,
    "commandCount": 0,
    "containerStatus": "running"
  }
}
```

### Step 5: Execute a Command in Terminal

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo \"Hello from TermiLearn\""
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Command executed successfully",
  "data": {
    "sessionId": "...",
    "command": "echo \"Hello from TermiLearn\"",
    "output": "Hello from TermiLearn",
    "error": "",
    "exitCode": 0,
    "executedAt": "2024-01-15T10:31:00.000Z"
  }
}
```

### Step 6: Test Various Commands

**List files:**

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "command": "ls -la" }'
```

**Show current directory:**

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "command": "pwd" }'
```

**Get system info:**

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "command": "uname -a" }'
```

**Create a file:**

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "command": "echo \"test content\" > test.txt && cat test.txt" }'
```

### Step 7: Get Command History

```bash
curl -X GET http://localhost:5000/api/terminal/SESSION_ID_HERE/history \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Command history retrieved successfully",
  "data": {
    "sessionId": "...",
    "commandCount": 3,
    "commands": [
      {
        "command": "echo \"Hello from TermiLearn\"",
        "output": "Hello from TermiLearn",
        "createdAt": "2024-01-15T10:31:00.000Z"
      },
      {
        "command": "pwd",
        "output": "/",
        "createdAt": "2024-01-15T10:31:15.000Z"
      },
      {
        "command": "ls -la",
        "output": "total XX\ndrwxr-xr-x ...",
        "createdAt": "2024-01-15T10:31:30.000Z"
      }
    ]
  }
}
```

### Step 8: Delete/Terminate Terminal Session

```bash
curl -X DELETE http://localhost:5000/api/terminal/SESSION_ID_HERE \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Terminal session terminated successfully",
  "data": {
    "sessionId": "...",
    "status": "terminated",
    "commandsExecuted": 3
  }
}
```

### Step 9: Verify Terminal is Deleted

```bash
curl -X GET http://localhost:5000/api/terminal/SESSION_ID_HERE \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response (410 Gone or 404):**

```json
{
  "success": false,
  "message": "Terminal session has expired"
}
```

## Docker Container Inspection

While terminal is running, you can inspect the Docker container:

```bash
# List all containers
docker ps -a

# List TermiLearn containers
docker ps -a | grep termilearn

# Inspect a specific container
docker inspect CONTAINER_ID

# View container logs
docker logs CONTAINER_ID
```

## Error Cases to Test

### 1. Unauthorized Access

```bash
# Without token
curl -X GET http://localhost:5000/api/terminal/list

# Expected: 401 Unauthorized
```

### 2. Invalid Token

```bash
curl -X GET http://localhost:5000/api/terminal/list \
  -H "Authorization: Bearer invalid_token"

# Expected: 401 Invalid token
```

### 3. Non-existent Session

```bash
curl -X GET http://localhost:5000/api/terminal/invalid_session_id \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected: 404 Terminal session not found
```

### 4. Access Other User's Terminal

```bash
# Register second user, get their token
# Try accessing first user's terminal with second user's token

curl -X GET http://localhost:5000/api/terminal/FIRST_USER_SESSION_ID \
  -H "Authorization: Bearer SECOND_USER_TOKEN"

# Expected: 403 Not authorized to access this terminal
```

### 5. Command Timeout (5 second limit)

```bash
curl -X POST http://localhost:5000/api/terminal/SESSION_ID_HERE/execute \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "command": "sleep 10" }'

# Expected: Command execution timeout error
```

## Docker Cleanup

To manually clean up all TermiLearn containers:

```bash
# Remove all stopped TermiLearn containers
docker ps -a | grep termilearn | awk '{print $1}' | xargs docker rm

# Or remove all running ones
docker stop $(docker ps -a | grep termilearn | awk '{print $1}')
docker rm $(docker ps -a | grep termilearn | awk '{print $1}')
```

## Performance Notes

- **Container startup time**: ~1-2 seconds
- **Command execution**: <5 seconds (timeout limit)
- **Memory per container**: Max 256MB
- **CPU per container**: 512 shares
- **Session duration**: 30 minutes

## Logging

Check the application logs to see detailed operation info:

```bash
# View real-time logs
tail -f logs/backend.log

# Search for specific container
grep "container_name" logs/backend.log

# View only errors
grep "error" logs/backend.log
```

## Success Criteria

✅ Can register and login user
✅ Can create terminal session (Docker container starts)
✅ Can list active sessions
✅ Can check session status
✅ Can execute commands and see output
✅ Can retrieve command history
✅ Can terminate session (Docker container stops)
✅ Authorization is enforced (can't access other user's terminal)
✅ Session expires after 30 minutes
✅ All errors are handled gracefully with proper HTTP status codes
