# TaskMaster – Collaborative Task Tracking API

A production-ready REST + real-time backend for a team task tracker. Users register, create
teams/projects, invite teammates, create and assign tasks, and collaborate through comments and
file attachments. They get live notifications over WebSockets and can use Claude to draft task
descriptions or summarize a task.

**Stack:** Node.js 20 · Express 5 · MongoDB (Mongoose 8) · JWT · Socket.IO · Zod · Multer ·
Pino · Jest + Supertest · Anthropic Claude (optional)

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Real-time notifications](#real-time-notifications)
- [AI assistance](#ai-assistance)
- [Architecture](#architecture)
- [Security](#security)
- [Performance](#performance)
- [Testing & quality](#testing--quality)
- [Project structure](#project-structure)

---

## Features

Every user story in the brief maps to an endpoint:

| User story                                   | Endpoint(s)                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Create an account                            | `POST /auth/register`                                            |
| Log in securely                              | `POST /auth/login`, `POST /auth/refresh`                         |
| View / update my profile                     | `GET /users/me`, `PATCH /users/me`, `PATCH /users/me/password`   |
| Create a task (title, description, due date) | `POST /tasks`                                                    |
| View tasks assigned to me                    | `GET /tasks/assigned-to-me` (or `GET /tasks?assignee=me`)        |
| Mark a task as completed                     | `PATCH /tasks/:id/status` `{ "status": "completed" }`            |
| Assign a task to a team member               | `PATCH /tasks/:id/assignee`                                      |
| Filter tasks by status                       | `GET /tasks?status=open,in_progress`                             |
| Search tasks by title or description         | `GET /tasks?search=login`                                        |
| Comments & attachments                       | `/tasks/:id/comments`, `/tasks/:id/attachments`                  |
| Create a team / invite members               | `POST /teams`, `POST /teams/:id/invitations`, `POST /teams/join` |
| Log out securely                             | `POST /auth/logout`, `POST /auth/logout-all`                     |
| _(Optional)_ Real-time notifications         | Socket.IO + `GET /notifications`                                 |
| _(Optional)_ Generative-AI descriptions      | `POST /ai/task-description`, `POST /ai/tasks/:id/summary`        |

Beyond the brief:

- Filter by priority, tags, team, assignee, creator, due-date range and overdue. Sort by due date,
  priority (semantic order), title, status or search relevance. All lists are paginated.
- A dashboard stats endpoint (`GET /tasks/stats`).
- Team roles (owner / admin / member), invite codes, email invitations, leaving and removing
  members.
- Session management: list your devices, refresh-token rotation with reuse detection, and log out
  of every device at once.
- OpenAPI 3 docs with Swagger UI at **`/api-docs`**.
- Docker image, docker-compose, GitHub Actions CI, health and readiness probes, and graceful
  shutdown.

---

## Quick start

### Option A – Docker (API + MongoDB)

```bash
cp .env.example .env            # optional – compose has dev defaults
docker compose up --build
```

API: `http://localhost:3000/api/v1` · Docs: `http://localhost:3000/api-docs`

### Option B – Local Node.js

Requirements: Node.js ≥ 20.19 and a MongoDB 6+ instance (local or Atlas).

```bash
npm install
cp .env.example .env            # set MONGODB_URI and JWT_ACCESS_SECRET
npm run dev                     # auto-reload (node --watch)
# or
npm start
```

### Try it

```bash
# Register (returns accessToken + refreshToken)
curl -s localhost:3000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"name":"Asha","email":"asha@example.com","password":"Str0ngPassw0rd"}'

TOKEN=<accessToken>

# Create a task
curl -s localhost:3000/api/v1/tasks -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Write README","description":"Document the API","dueDate":"2026-12-01","priority":"high"}'

# Open tasks, highest priority first
curl -s "localhost:3000/api/v1/tasks?status=open&sort=-priority" -H "authorization: Bearer $TOKEN"
```

> Tip: import `http://localhost:3000/api-docs.json` into Postman or Insomnia to get a ready-made
> collection.

---

## Configuration

All variables are validated at boot by [`src/config/env.js`](src/config/env.js). If one is
missing or malformed, the process exits immediately with a clear message. See
[`.env.example`](.env.example) for the full list.

| Variable                                      | Default           | Purpose                                    |
| --------------------------------------------- | ----------------- | ------------------------------------------ |
| `MONGODB_URI`                                 | –                 | **Required.** MongoDB connection string    |
| `JWT_ACCESS_SECRET`                           | –                 | **Required.** At least 32 characters       |
| `JWT_ACCESS_EXPIRES_IN`                       | `15m`             | Access-token lifetime                      |
| `REFRESH_TOKEN_TTL_DAYS`                      | `7`               | Session / refresh-token lifetime           |
| `BCRYPT_SALT_ROUNDS`                          | `12`              | Password hashing cost                      |
| `CORS_ORIGINS`                                | `*`               | Comma-separated allowed origins            |
| `TRUST_PROXY`                                 | `0`               | Number of proxy hops (for client IPs)      |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX`      | `300` / `20`      | Requests per 15 minutes                    |
| `MAX_UPLOAD_SIZE_MB` / `MAX_FILES_PER_UPLOAD` | `10` / `5`        | Attachment limits                          |
| `NOTIFICATION_TTL_DAYS`                       | `90`              | Old notifications are purged automatically |
| `ANTHROPIC_API_KEY`                           | _(empty)_         | Turns on the AI endpoints                  |
| `AI_MODEL`                                    | `claude-opus-5-5` | Claude model used by the AI endpoints      |

---

## API overview

Base URL: **`/api/v1`**. Interactive docs: **`/api-docs`** (spec: `/api-docs.json`).

**Response envelope**

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNextPage": true, "hasPrevPage": false } }

// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
  "details": [{ "location": "body", "field": "title", "message": "Required" }], "requestId": "…" } }
```

Status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409` (duplicate or concurrent edit),
`413`, `415`, `422` (validation), `429` (rate limit), `502`/`503` (AI upstream).

### Auth

| Method | Path               | Description                                        |
| ------ | ------------------ | -------------------------------------------------- |
| POST   | `/auth/register`   | Create account → user + token pair                 |
| POST   | `/auth/login`      | Log in → user + token pair                         |
| POST   | `/auth/refresh`    | Rotate refresh token (body or `tm_refresh` cookie) |
| POST   | `/auth/logout`     | Revoke the current session                         |
| POST   | `/auth/logout-all` | Revoke all sessions                                |
| GET    | `/auth/sessions`   | Active sessions / devices                          |

### Users

| Method | Path                 | Description                               |
| ------ | -------------------- | ----------------------------------------- |
| GET    | `/users/me`          | My profile                                |
| PATCH  | `/users/me`          | Update name / bio / avatarUrl             |
| PATCH  | `/users/me/password` | Change password (signs out other devices) |
| GET    | `/users/:userId`     | A teammate's public profile               |

### Teams & invitations

| Method | Path                                       | Who                      |
| ------ | ------------------------------------------ | ------------------------ |
| POST   | `/teams`                                   | anyone (→ owner)         |
| GET    | `/teams`                                   | my teams                 |
| GET    | `/teams/:teamId`                           | member                   |
| PATCH  | `/teams/:teamId`                           | owner/admin              |
| DELETE | `/teams/:teamId`                           | owner (cascades)         |
| GET    | `/teams/:teamId/members`                   | member                   |
| PATCH  | `/teams/:teamId/members/:userId`           | owner (set role)         |
| DELETE | `/teams/:teamId/members/:userId`           | owner/admin              |
| POST   | `/teams/:teamId/leave`                     | member                   |
| POST   | `/teams/:teamId/invite-code`               | owner/admin (regenerate) |
| POST   | `/teams/join`                              | anyone with a code       |
| POST   | `/teams/:teamId/invitations`               | owner/admin              |
| GET    | `/teams/:teamId/invitations`               | owner/admin              |
| DELETE | `/teams/:teamId/invitations/:invitationId` | owner/admin              |
| GET    | `/invitations`                             | my pending invitations   |
| POST   | `/invitations/:id/accept` · `/decline`     | invitee                  |

### Tasks

| Method | Path                      | Description                                    |
| ------ | ------------------------- | ---------------------------------------------- |
| POST   | `/tasks`                  | Create (personal, or in one of my teams)       |
| GET    | `/tasks`                  | List with filters, search, sort and pagination |
| GET    | `/tasks/assigned-to-me`   | Tasks assigned to me                           |
| GET    | `/tasks/stats`            | Counters (open / in progress / done / overdue) |
| GET    | `/tasks/:taskId`          | Details plus my permissions                    |
| PATCH  | `/tasks/:taskId`          | Partial update                                 |
| PATCH  | `/tasks/:taskId/status`   | Change status (complete / reopen)              |
| PATCH  | `/tasks/:taskId/assignee` | Assign / unassign                              |
| DELETE | `/tasks/:taskId`          | Delete (with comments and files)               |

**Query parameters for `GET /tasks`:** `status`, `priority`, `tags` (comma lists) · `team` ·
`assignee=me|unassigned|<id>` · `createdBy=me|<id>` · `dueBefore`, `dueAfter` (ISO dates) ·
`overdue=true` · `search` · `sort` (`createdAt`, `updatedAt`, `dueDate`, `priority`, `title`,
`status`, `relevance`; prefix `-` for descending) · `page`, `limit` (max 100).

**Permissions**

|        | Personal task  | Team task                                                       |
| ------ | -------------- | --------------------------------------------------------------- |
| View   | creator        | any team member                                                 |
| Edit   | creator        | creator, assignee, team owner/admin                             |
| Assign | creator (self) | creator, assignee, team owner/admin (assignee must be a member) |
| Delete | creator        | creator, team owner/admin                                       |

### Comments & attachments

| Method | Path                                                | Description                                        |
| ------ | --------------------------------------------------- | -------------------------------------------------- |
| GET    | `/tasks/:taskId/comments?order=asc`                 | Paginated thread                                   |
| POST   | `/tasks/:taskId/comments`                           | Add a comment                                      |
| PATCH  | `/tasks/:taskId/comments/:commentId`                | Edit (author only)                                 |
| DELETE | `/tasks/:taskId/comments/:commentId`                | Author, or task creator / team manager             |
| GET    | `/tasks/:taskId/attachments`                        | List                                               |
| POST   | `/tasks/:taskId/attachments`                        | `multipart/form-data`, field `files` (≤ 5 × 10 MB) |
| GET    | `/tasks/:taskId/attachments/:attachmentId/download` | Download                                           |
| DELETE | `/tasks/:taskId/attachments/:attachmentId`          | Uploader, or task creator / team manager           |

```bash
curl -s localhost:3000/api/v1/tasks/$TASK/attachments -H "authorization: Bearer $TOKEN" \
  -F "files=@./spec.pdf" -F "files=@./mockup.png"
```

Allowed file types: png, jpg, gif, webp, pdf, txt, csv, md, json, zip, and Office documents.

### Notifications

| Method | Path                                | Description                         |
| ------ | ----------------------------------- | ----------------------------------- |
| GET    | `/notifications?unread=true&type=…` | Inbox (includes `meta.unreadCount`) |
| GET    | `/notifications/unread-count`       | Badge counter                       |
| PATCH  | `/notifications/:id/read`           | Mark one as read                    |
| PATCH  | `/notifications/read-all`           | Mark all as read                    |
| DELETE | `/notifications/:id`                | Delete                              |

---

## Real-time notifications

Socket.IO runs on the same port as the API. Clients authenticate with their access token:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { auth: { token: accessToken } });

socket.on('ready', ({ userId, teams }) => console.log('connected', teams));
socket.on('notification:new', (n) => console.log(n.message)); // "Asha assigned you "Fix login""
socket.on('task:updated', ({ task, changes, actor }) => refreshBoard(task));
```

| Event                                                         | Sent to                                           |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `notification:new`                                            | the recipient                                     |
| `task:created` · `task:updated` · `task:deleted`              | the task's team (or its owner for personal tasks) |
| `comment:created` · `comment:updated` · `comment:deleted`     | same as above                                     |
| `attachment:added` · `attachment:deleted`                     | same as above                                     |
| `team:member_joined` · `team:member_removed` · `team:deleted` | team members                                      |

**When notifications are created:**

- When you are assigned a task.
- When a task you created or are assigned is updated or completed.
- When someone comments on, or attaches files to, a task you created or are assigned.
- When you are invited to a team.
- When a member joins a team you own or administer.
- When you are removed from a team.

You are never notified about your own actions.

Room membership stays in sync. Joining or leaving a team updates your open sockets, and logging
out disconnects that session's sockets.

---

## AI assistance

When `ANTHROPIC_API_KEY` is set, two endpoints use Claude (`claude-opus-5-5` by default):

- **`POST /ai/task-description`** `{ title, notes?, priority? }` returns a description,
  acceptance criteria, a suggested priority and tags. The client can review these before
  calling `POST /tasks`.
- **`POST /ai/tasks/:taskId/summary`** summarizes the task and its latest 50 comments into
  `summary`, `keyPoints`, `blockers` and `nextSteps`. It follows the same access rules as reading
  the task.

How it works:

- **Validated output.** Responses use structured outputs (a JSON schema) and are checked again
  with Zod.
- **Prompt-injection protection.** User text is escaped and wrapped in data tags. The system
  prompt tells the model never to follow instructions found inside those tags.
- **Refusal handling.** Server-side refusal fallback is enabled (`fallbacks: "default"`). If the
  model still declines, the API returns `422 AI_REFUSED`.
- **Clear errors.** Upstream failures map to `502` or `503`. Without an API key, the AI
  endpoints return `503 AI_NOT_CONFIGURED`.
- **Cost control.** AI requests have their own per-user rate limit.

---

## Architecture

```
src/
├── app.js / server.js          Express app factory · HTTP + Socket.IO bootstrap, graceful shutdown
├── config/                     validated env, pino logger, Mongo connection
├── middlewares/                authenticate, validate (zod), sanitize, rate limiters, errors
├── modules/<feature>/          model · validation · service · controller · routes
│   ├── auth/                   sessions, JWT, refresh rotation
│   ├── users/  teams/  tasks/  comments/  attachments/  notifications/  ai/
├── events/eventBus.js          in-process domain events
├── realtime/socket.js          Socket.IO gateway (subscribes to domain events)
├── services/storage/           attachment storage driver (local disk)
└── docs/openapi.yaml
```

Each layer has one job:

- **Routes** declare middleware and validation.
- **Controllers** translate HTTP to service calls.
- **Services** hold the business rules and never touch `req`/`res`.

**Event-driven side effects.** Services publish domain events (`task.updated`,
`comment.created`, …) after a write succeeds. The notification module and the real-time gateway
subscribe to these events. This keeps request handlers fast and the modules decoupled. Swapping
the in-process bus for Redis Streams or RabbitMQ changes no service code.

### Data model

```
User ──< Session                      (one per login/device; TTL-expired)
User ──< Team.members[{user, role}] >── Team ──< Invitation (by email)
Team ──< Task >── assignee: User, createdBy: User
Task ──< Comment, Attachment          (denormalised commentCount / attachmentCount)
User ──< Notification                 (TTL-expired)
```

Design decisions:

- **Embedded team members.** Members live inside the team document. Membership is always read
  with the team and team size is capped at 500, so an index on `members.user` makes "my teams" a
  single index lookup.
- **Personal tasks** have `team: null` and are private to their creator. **Team tasks** are
  visible to every team member.
- **Semantic priority sort.** `priorityRank` lets priority sort as `low < medium < high < urgent`
  instead of alphabetically.
- **Optimistic concurrency.** Two simultaneous edits of the same task produce `409
VERSION_CONFLICT` instead of silently overwriting each other.
- **Clean cascades.** Deleting a task removes its comments, attachment records and stored files.
  Deleting a team removes all of its tasks. Removing a member unassigns their tasks.

---

## Security

- **Passwords.** Hashed with bcrypt (cost 12). Policy: 8–72 characters with upper-case,
  lower-case and a digit. Login takes the same time whether or not the email exists, so accounts
  can't be discovered through timing.
- **Sessions, not bare JWTs.** Each access token (HS256, 15 min) is tied to a session. Logout
  revokes the session, so its tokens stop working immediately.
- **Refresh tokens.** They are random, stored only as SHA-256 hashes, and rotated on every use.
  The rotation is a single atomic compare-and-swap. Reusing an old refresh token is treated as
  theft and revokes the whole session.
- **Cookies.** The refresh token is also set as an `httpOnly`, `SameSite=Strict`,
  path-scoped cookie (and `Secure` in production).
- **Authorization.** Every resource is checked against team membership and role. Resources you
  can't access return `404`, so their existence isn't revealed.
- **Input validation.** Every input is validated with strict Zod schemas, so unknown fields are
  rejected (no mass assignment). As defense in depth, keys starting with `$` or containing `.` are
  stripped, and query strings are parsed flat (no nested objects).
- **Uploads.**
  - Files are stored under random keys.
  - The MIME type and extension must both be on an allow-list.
  - Size and count are limited.
  - Access is checked before any bytes are written.
  - Downloads use `Content-Disposition: attachment` and `nosniff`.
- **HTTP hardening.** Helmet headers, a CORS allow-list, body-size limits, and rate limiting
  (global, stricter on auth endpoints, per-user on AI).
- **Logging.** Structured Pino logs with request IDs. Credentials and tokens are redacted.
  Production errors never expose internals.

---

## Performance

- **Indexes match the queries.** Compound indexes cover "assigned to me", "my tasks" and team
  boards. A weighted full-text index (title > tags > description) powers search, and TTL indexes
  expire sessions and old notifications.
- **Lean reads.** Read endpoints use `lean()` queries, projections and targeted `populate`.
  Comment and attachment counts are stored on the task, so task lists need no extra queries.
- **Parallel queries.** Each list page and its total count run at the same time, and pagination
  is stable (`_id` tie-breaker).
- **Atomic writes.** Single-statement conditional updates handle joins, the team-size cap,
  invitation acceptance, refresh rotation and counters, so concurrent requests can't race.
- **Streaming uploads.** Files stream straight to disk without buffering in memory, and
  responses are compressed.
- **Scaling out.**
  - The API is stateless; shared state lives in MongoDB.
  - Rate limiting can move to a shared store (for example, `rate-limit-redis`).
  - Socket.IO can scale with `@socket.io/redis-adapter`.
  - The storage driver can be swapped for S3.

---

## Testing & quality

```bash
npm test               # 96 integration tests (in-memory MongoDB, no setup needed)
npm run test:coverage
npm run lint           # ESLint (flat config)
npm run format:check   # Prettier
```

The tests exercise the real HTTP stack and a real MongoDB through Supertest. They cover auth
(rotation, reuse detection, logout), authorization rules, filters, search, sorting and
pagination, invitations, uploads and downloads, notification rules, Socket.IO delivery and
disconnect on logout, AI flows (with a stubbed client), and platform behavior such as security
headers, malformed JSON and injection attempts. CI runs lint, format checks and the tests on
every push and pull request.

---

## Project structure

```
.
├── src/                    application code (see Architecture)
├── tests/                  Jest + Supertest integration suites and helpers
├── Dockerfile              multi-stage, non-root, healthcheck
├── docker-compose.yml      API + MongoDB
├── .github/workflows/ci.yml
├── .env.example
└── eslint.config.js · .prettierrc.json · jest.config.js
```

## License

MIT
