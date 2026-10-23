# Diagram atlas

Open [the offline presentation](../presentation.html) for navigation, zoom, speaker notes and printing.

Mermaid `.mmd` files are the editable sources. SVG files are the rendered exports.

| Diagram | Question it answers | Source |
| --- | --- | --- |
| [01 · The project in one picture](01-system-context.svg) | Who uses the product, and what supports it? | [Mermaid](01-system-context.mmd) |
| [02 · What actually runs on this Mac](02-local-infrastructure.svg) | Where are the seven containers, networks and data volumes? | [Mermaid](02-local-infrastructure.mmd) |
| [03 · From React components to SQL](03-code-structure.svg) | Which part of the source owns each responsibility? | [Mermaid](03-code-structure.mmd) |
| [04 · Three tables and two meanings of user](04-data-model.svg) | How are accounts, sessions and tasks related? | [Mermaid](04-data-model.mmd) |
| [05 · What happens when a user signs in](05-login-session.svg) | How does the server recognize the next request? | [Mermaid](05-login-session.mmd) |
| [06 · How a task becomes complete](06-ticket-lifecycle.svg) | Is task status stored or calculated? | [Mermaid](06-ticket-lifecycle.mmd) |
| [07 · Who may change a ticket](07-ticket-authorization.svg) | Why is hiding a button insufficient? | [Mermaid](07-ticket-authorization.mmd) |
| [08 · From a change to a release image](08-delivery-pipeline.svg) | What does CI verify, and when can an image be published? | [Mermaid](08-delivery-pipeline.mmd) |
| [09 · A deployment can fail safely](09-deployment-recovery.svg) | How is a failed or interrupted rollout recovered? | [Mermaid](09-deployment-recovery.mmd) |
| [10 · Recover the data, not only the image](10-backup-restore.svg) | How do you know a SQLite backup is usable? | [Mermaid](10-backup-restore.mmd) |
| [11 · Different tools answer different questions](11-observability.svg) | Is it reachable, is it busy, and what happened? | [Mermaid](11-observability.mmd) |
| [12 · How the optional public server differs](12-public-deployment.svg) | What changes when the app is exposed through HTTPS? | [Mermaid](12-public-deployment.mmd) |
| [13 · What goes into the application image](13-image-build.svg) | Why use two Docker build stages? | [Mermaid](13-image-build.mmd) |
