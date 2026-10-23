TEAM TICKET HUB

Start with README.md for current setup and browser URLs.
Read docs/README.md for the beginner learning path.
Open docs/presentation.html in a browser for the offline architecture walkthrough.
Read docs/interview-guide.md to rehearse the project demo and interview questions.

Local application: http://127.0.0.1:3001
Local Grafana: http://127.0.0.1:3000/d/ticket-poc
Monitoring login details: secrets/local-access.txt (not tracked by Git).
Fictional app demo accounts: .env.demo and README.md.

The frontend and API share one Docker app container. SQLite data is in a named
volume. Six supporting containers provide monitoring and Docker management.
The optional Linux VPS deployment is documented separately from the local demo.

For source development use Node 22.23.3 (.nvmrc), npm ci, npm test, npm run dev.
Development opens at http://127.0.0.1:5173 and also needs port 3001 for Express.
Do not run the development backend and Docker app on the same port simultaneously.
