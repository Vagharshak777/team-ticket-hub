# Code architecture

Frontend source lives in `src/`; backend source lives in `backend/`. They communicate
through the existing JSON API and share no implementation imports. One production
container can still serve both the API and compiled assets. Development runs Vite and
Express as separate processes.

## Frontend

- `App.jsx` composes the authenticated and signed-out views.
- `app/useWorkspace.js` coordinates session state, asynchronous operations and notices.
  Its HTTP dependency is injected, allowing transport substitution without changing views.
- `lib/http.js` owns JSON requests, cancellation and typed HTTP errors. It has protocol
  tests for expired sessions, network failures, invalid proxy responses and cancellation.
- `features/auth`, `features/profile` and `features/tickets` contain feature views.
  Forms receive operation callbacks; they do not construct HTTP requests.
- Shared layout, icons, notices and date fields live in `components/`.
- Pure ticket rules and date helpers are independent of React and browser state.
- `styles/` separates design tokens, base controls, workspace layout and feature styling.

## Backend

- `server.js` remains a stable entry point and export facade for existing scripts/tests.
- `config.js` validates runtime configuration; `runtime.js` owns process startup/shutdown.
- `app.js` assembles middleware, health checks and routes and wires dependencies.
- `database.js` owns SQLite connection setup and schema initialization.
- `domain/` owns input validation and public response serialization.
- `security/passwords.js` owns hashing and verification.
- `repositories/` owns user/ticket SQL. Ticket queries always require an owner identifier.
- `routes/` maps HTTP requests to validation and injected repository operations.

Each boundary has a specific responsibility. Route handlers depend on small repository
contracts; presentation components depend on callback contracts. New storage or transport
implementations can satisfy those contracts without rewriting their consumers. Avoid adding
base classes or generic service frameworks unless a concrete requirement needs them.

The refactor retains existing API URLs, cookie behavior, public gateway option,
health routes and backup interfaces. Docker explicitly includes `backend/`; build context
rules continue to exclude local databases and secrets.

## Team permissions and Clarity

The additive database migration adds `users.role` and `tickets.assignee_id` without
replacing existing rows. Existing accounts default to employee. Authorization lives
on the server: managers can assign work and read the directory; employees can only
read their own member page and visible tasks. Assigned employees can change checklist
completion, while the manager controls assignment and task definition.

The frontend uses `@clr/ui` CSS with native React forms, tables, cards, alerts,
buttons and navigation. It does not require an Angular runtime. Hash routes provide
Dashboard, Tasks, Users, personal member workspaces and Profile without changing
backend routing. Demo credentials are intentionally simple and only created by the
explicit local seed command.
