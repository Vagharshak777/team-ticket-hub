TICKET DASHBOARD

Requirements
Node.js 22.16 or later with npm; Node 22.23.3 is pinned in .nvmrc.
Python 3 is required for the host operations tests.
See README.md and docs/runbook.md for the Docker and DevOps setup.

Start
Open a terminal in this folder. It must contain package.json.
  npm install
  npm run dev
Open http://127.0.0.1:5173 in your browser.
Keep the terminal open. Press Ctrl+C to stop the app.

Production
  npm install
  npm run build
  npm start
Open http://127.0.0.1:3001.
Build again after changing the frontend.

Tests
  npm test
The tests use a separate temporary database.

Features
- Register, sign in and sign out.
- Users must be at least 18. The backend checks the date of birth.
  Users enter their own birth date; there is no ID check.
- Create, edit and delete your own tickets.
- Each ticket has a name, a task and a checklist with 1 to 50 steps.
- A ticket is completed when all steps are checked.
- Search tickets and filter by status.
- Edit your name, email address and date of birth in your profile.
- Create your own account to start. There is no default account.

Files
src/App.jsx       React pages and forms
src/style.css     Page styles and layout
server.js         Express backend and SQLite database
server.test.js    Backend tests
vite.config.js    Frontend server and API connection
package.json      Packages and start commands

Code comments are short and written in simple English.
The project uses JavaScript and direct SQL queries.

Data and login
The backend creates data/dashboard.sqlite when it first starts.
It stores users, tickets and sessions. Passwords are saved as hashes.
The browser uses an HttpOnly session cookie. Sessions last seven days.
Signing out ends the session. For HTTPS hosting, set COOKIE_SECURE=true.
