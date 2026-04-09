# TermiLearn Backend Documentation

## Overview

TermiLearn backend is a Node.js/Express application that powers isolated Linux terminal sessions for learners. It handles user authentication, session lifecycle management, command execution, monitoring, audit logging, and cleanup.

This single documentation file covers:

- architecture
- source structure
- feature flow
- API reference
- security and validation
- testing guide
- deployment notes

## Tech Stack

- Node.js (ES modules)
- Express.js
- MongoDB with Mongoose
- Docker via Dockerode
- Socket.io for realtime terminal streams
- JWT authentication
- express-rate-limit for rate limiting
- express-validator for request validation

## Completed Phases (1-8)

- Phase 1: Project setup, Express server, environment config
- Phase 2: MongoDB models for users and terminal sessions
- Phase 3: JWT authentication, registration, login, profile endpoints
- Phase 4: Docker terminal management and lifecycle functions
- Phase 5: WebSocket terminal interactions with Socket.io
- Phase 6: Command safety validation, audit logging, monitoring
- Phase 7: Auto cleanup, expiration, orphan container cleanup
- Phase 8: API endpoints, alias support, rate limiting, integration readiness

## Architecture

### Core Components

- `src/index.js` - application entry point
- `src/config/database.js` - MongoDB connection logic
- `src/models/` - Mongoose schemas
- `src/controllers/` - request handling and business logic
- `src/routes/` - route definitions
- `src/middleware/` - authentication, validation, and rate limiting
- `src/utils/` - Docker container utilities, logging, safety checks

### Runtime Flow

1. Server starts via `node src/index.js`
2. Environment variables are validated
3. MongoDB connection is established
4. Express middleware registers logging, CORS, JSON parsing, rate limiting, auth, and error handling
5. API routes and Socket.io are initialized
6. Cleanup scheduler starts to remove expired sessions and orphan containers

## Source Structure and File Uses

### `src/index.js`

- Initializes Express app
- Configures middleware
- Mounts auth and terminal routes
- Starts HTTP server and Socket.io
- Starts cleanup scheduler

### `src/config/database.js`

- Connects to MongoDB
- Exports `connectDB()`

### `src/models/User.js`

- Defines user schema
- Fields: `username`, `email`, `password`, `role`, `createdAt`
- Password hashing and comparison
- Serialized output excludes password

### `src/models/TerminalSession.js`

- Defines terminal session schema
- Tracks `user`, `containerId`, `status`, `startedAt`, `expiresAt`, and command history
- Holds session metrics and audit references

### `src/models/CommandAuditLog.js`

- Captures `user`, `session`, `command`, `origin`, `status`, `reason`, `output`, and `exitCode`
- Used for security and auditing

### `src/controllers/authController.js`

- `register()` - creates user, validates input, returns JWT
- `login()` - verifies credentials and returns JWT
- `getProfile()` - returns authenticated user profile
- `updateProfile()` - updates name/email securely

### `src/controllers/terminalController.js`

- `createTerminal()` - creates Docker container and session
- `deleteTerminal()` - terminates container and session
- `executeCommand()` - runs commands inside container
- `getTerminalStatus()` - returns session and container status
- `listActiveSessions()` - lists active sessions for user
- `getCommandHistory()` - returns history for a session
- `getAuditLog()` - returns audit entries for a session
- `triggerCleanup()` - admin endpoint for manual cleanup

### `src/routes/authRoutes.js`

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/profile`
- PUT `/api/auth/profile`

### `src/routes/terminalRoutes.js`

- POST `/api/terminal/create`
- GET `/api/terminal/:sessionId`
- GET `/api/terminal/:sessionId/status`
- DELETE `/api/terminal/:sessionId`
- POST `/api/terminal/:sessionId/execute`
- POST `/api/terminal/:sessionId/command`
- GET `/api/terminal/:sessionId/history`
- GET `/api/terminal/:sessionId/audit`
- GET `/api/terminal/list`
- POST `/api/terminal/cleanup`

### `src/middleware/auth.js`

- `protect()` verifies JWT
- `authorize()` verifies user role

### `src/middleware/validation.js`

- Validates auth requests using `express-validator`
- Normalizes validation errors

### `src/middleware/rateLimiter.js`

- Auth-specific rate limiter for registration/login
- General API rate limiter for other endpoints

### `src/utils/docker.js`

- Initializes Dockerode client
- Ensures Alpine image availability
- Creates containers with resource constraints
- Executes commands with timeout and output parsing
- Deletes containers safely
- Retrieves container metrics and status
- Cleans up orphan containers and user container lists

### `src/utils/logger.js`

- Structured logger wrapper
- Writes logs to console and `logs/backend.log`

### `src/utils/commandSafety.js`

- Command filtering rules
- Blocks dangerous patterns such as `rm -rf`, `sudo`, `su`, `chmod`, `chown`, `mount`, and `dd`
- Supports warnings and audit metadata

## Feature Flow

### Authentication Flow

1. User registers at `/api/auth/register`
2. Backend validates input and hashes password
3. JWT token is returned on success
4. User logs in at `/api/auth/login`
5. Protected routes require `Authorization: Bearer <token>`
6. Profile data is returned with `/api/auth/profile`

### Terminal Session Flow

1. Authenticated user requests `/api/terminal/create`
2. Docker container is created and terminal session saved
3. Session expires after 30 minutes
4. User executes commands via `/api/terminal/:sessionId/execute` or alias `/api/terminal/:sessionId/command`
5. Command output is returned and persisted
6. User may query `/api/terminal/:sessionId` or `/api/terminal/:sessionId/status`
7. Session may be terminated via DELETE `/api/terminal/:sessionId`
8. Cleanup scheduler removes expired sessions and containers every interval

### Command Monitoring and Safety

- All commands pass through safety validation before execution
- Dangerous operations are blocked immediately
- Commands are recorded in `CommandAuditLog`
- Session command history is retained for replay and auditing

### Cleanup Flow

- Background cleanup runs on server start
- Expired sessions are detected and containers removed
- Orphan containers are cleaned up if they no longer map to a session
- Admins can manually trigger cleanup via `/api/terminal/cleanup`

## API Reference

### Auth Endpoints

#### POST `/api/auth/register`

- Body: `username`, `email`, `password`, optional `role`
- Returns: user profile and JWT token

#### POST `/api/auth/login`

- Body: `email`, `password`
- Returns: user profile and JWT token

#### GET `/api/auth/profile`

- Requires: `Authorization` header with JWT
- Returns: authenticated user profile

#### PUT `/api/auth/profile`

- Requires: JWT
- Body may include updated profile fields

### Terminal Endpoints

#### POST `/api/terminal/create`

- Requires JWT
- Creates a new terminal session for authenticated user
- Returns session metadata and container details

#### GET `/api/terminal/:sessionId`

- Requires JWT
- Returns current session status and container metrics

#### GET `/api/terminal/:sessionId/status`

- Alias to `/api/terminal/:sessionId`
- Provides session status and health details

#### DELETE `/api/terminal/:sessionId`

- Requires JWT
- Terminates the session and removes the Docker container

#### POST `/api/terminal/:sessionId/execute`

- Requires JWT
- Body: `command`
- Executes a command inside the terminal container
- Returns output, exit code, and runtime status

#### POST `/api/terminal/:sessionId/command`

- Alias to `/api/terminal/:sessionId/execute`
- Supports frontend compatibility

#### GET `/api/terminal/:sessionId/history`

- Requires JWT
- Returns command history for the session

#### GET `/api/terminal/:sessionId/audit`

- Requires JWT
- Returns audit log entries for the session

#### GET `/api/terminal/list`

- Requires JWT
- Lists active terminal sessions for authenticated user

#### POST `/api/terminal/cleanup`

- Requires JWT with `admin` role
- Triggers manual cleanup of expired sessions, orphan containers, and old audit logs

## Security and Validation

- JWT protects user and terminal endpoints
- Role-based auth restricts cleanup access to admins
- Rate limits applied:
  - stricter limiter for `/api/auth/*`
  - general limiter for `/api/*`
- Input validation using `express-validator`
- Command safety engine blocks dangerous commands before execution
- Global error handling returns structured error responses

## Testing Guide

### 1. Startup and Health Check

- Start backend:
  - `cd termilearn-backend && npm start`
- Confirm health endpoint:
  - `GET http://localhost:5000/health`
  - Expected: `200 OK`

### 2. Authentication Tests

- Register regular user
- Register admin user
- Login both users
- Confirm JWT tokens are returned
- Confirm protected route access with valid token
- Confirm invalid token returns authorization error

### 3. Terminal Session Tests

- Create session: `POST /api/terminal/create`
- Retrieve status via `/api/terminal/:sessionId`
- Retrieve status via alias `/api/terminal/:sessionId/status`
- Execute safe commands through both `/execute` and `/command`
- Confirm output values and exit codes
- Delete session via `/api/terminal/:sessionId`

### 4. Command Safety Tests

- Send blocked command such as `rm -rf /`
- Confirm response indicates blocked execution
- Verify audit log records blocked command and reason

### 5. History and Audit Tests

- Retrieve history from `/api/terminal/:sessionId/history`
- Retrieve audit log from `/api/terminal/:sessionId/audit`
- Confirm commands and audit entries match

### 6. Admin Authorization Tests

- Trigger cleanup as admin via `/api/terminal/cleanup`
- Confirm cleanup summary is returned
- Trigger cleanup as non-admin user and expect `403`

### 7. Rate Limiting Tests

- Send repeated auth requests beyond the allowed rate
- Confirm `429 Too Many Requests`
- Send repeated general API calls beyond limit
- Confirm `429` and rate limiting message

### 8. Integration Test Summary

- Create user and admin accounts
- Authenticate and retrieve JWT tokens
- Create, query, execute, and delete terminal session
- Confirm alias routes work identically to core routes
- Confirm data is stored in session history and audit logs
- Confirm admin-only cleanup is enforced

## Deployment Notes

- Use `.env` for `MONGODB_URI`, `JWT_SECRET`, and `PORT`
- Ensure Docker daemon is available to the backend host
- Use `docker-compose` in future deployment for backend + MongoDB
- Monitor logs in `logs/backend.log`

## Current Result

Phase 1-8 is complete and validated. The backend supports:

- user authentication
- Docker terminal sessions
- command execution and audit logging
- session expiration and cleanup
- WebSocket compatibility support
- admin cleanup and rate limiting

This backend is ready to move to frontend integration and Phase 9 testing.
