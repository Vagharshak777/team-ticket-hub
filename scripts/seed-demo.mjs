import { chmodSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../backend/database.js";
import { hashPassword } from "../backend/security/passwords.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath =
  process.env.DATABASE_PATH || path.join(root, "data/dashboard.sqlite");
const accounts = [
  {
    name: "Jordan Lee",
    email: "manager@example.test",
    password: "manager123",
    role: "manager",
  },
  {
    name: "Alex Morgan",
    email: "alex@example.test",
    password: "alex12345",
    role: "employee",
  },
  {
    name: "Sara Patel",
    email: "sara@example.test",
    password: "sara12345",
    role: "employee",
  },
  {
    name: "Maya Bennett",
    email: "demo@example.test",
    password: "demo12345",
    role: "employee",
  },
];
const fixtures = [
  [
    "Restore finance team access",
    "The finance team can sign in but cannot open the monthly reporting workspace. Check the updated access policy and confirm the team can export its reports before month-end.",
    [
      "Reproduce the permission error",
      "Compare the finance role with the access policy",
      "Apply the corrected permissions",
      "Ask the requester to verify report access",
    ],
    2,
    0,
  ],
  [
    "Investigate delayed order confirmations",
    "Several customers reported that order confirmation emails arrive more than ten minutes after checkout. Review the notification queue and mail provider responses, then verify delivery with a test order.",
    [
      "Review queue depth and delivery logs",
      "Identify the slow delivery step",
      "Deploy and verify the fix",
    ],
    1,
    1,
  ],
  [
    "Prepare onboarding for the design team",
    "Three designers join on Monday. Prepare their workspace, share the getting-started guide, and confirm the project lead has approved the required access.",
    [
      "Confirm the new starter list",
      "Create workspace invitations",
      "Share the onboarding guide",
      "Verify access with the project lead",
    ],
    0,
    1,
  ],
  [
    "Resolve mobile checkout layout",
    "On smaller screens, the checkout summary overlaps the payment button. Reproduce the issue at common phone widths and verify the corrected spacing with keyboard navigation.",
    [
      "Reproduce at 375px and 390px widths",
      "Update the summary layout",
      "Check keyboard focus and validation",
      "Verify on a physical device",
    ],
    2,
    2,
  ],
  [
    "Update the password reset guide",
    "The help center still shows screenshots from the previous account settings page. Replace the outdated instructions and add a short troubleshooting section for expired reset links.",
    [
      "Review the current reset flow",
      "Capture new screenshots",
      "Update the article and links",
      "Publish after peer review",
    ],
    4,
    3,
  ],
  [
    "Review the weekly backup restore",
    "Run the weekly recovery exercise using the latest verified snapshot. Restore into an isolated workspace and record the recovery time and any follow-up work.",
    [
      "Check snapshot checksum",
      "Restore into an isolated workspace",
      "Verify the expected records",
      "Record recovery time and findings",
    ],
    0,
    3,
  ],
  [
    "Fix duplicate billing notifications",
    "A retry in the billing notification worker sent the same receipt twice. Add an idempotency check and confirm retries no longer produce duplicate customer emails.",
    [
      "Trace the duplicate notification",
      "Add the idempotency check",
      "Test retry behavior",
      "Confirm delivery with support",
    ],
    4,
    5,
  ],
  [
    "Improve workspace search relevance",
    "Searching for a ticket number returned unrelated results ahead of exact matches. Prioritize exact reference matches and check that ordinary text search still behaves as expected.",
    [
      "Collect representative search cases",
      "Update exact-match ranking",
      "Verify the regression cases",
    ],
    3,
    6,
  ],
];

if (process.env.NODE_ENV === "production")
  throw new Error("Demo seeding is only available for local development.");
// Refuse to create a surprise database when a custom path contains a typo.
if (process.env.DATABASE_PATH && !existsSync(databasePath))
  throw new Error("The configured database must already exist.");
const database = openDatabase(databasePath);
try {
  // Only these explicit local demo accounts are updated; real accounts are untouched.
  const hashes = await Promise.all(
    accounts.map((account) => hashPassword(account.password)),
  );
  database.exec("BEGIN IMMEDIATE");
  let inserted = 0;
  let redistributed = 0;
  try {
    const upsert =
      database.prepare(`INSERT INTO users (name, email, birth_date, password_hash, role)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role`);
    const users = accounts.map((account, index) => {
      upsert.run(
        account.name,
        account.email,
        "1993-06-18",
        hashes[index],
        account.role,
      );
      return database
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(account.email);
    });
    const manager = users[0];
    const employees = users.slice(1);
    let index = 0;
    for (const [name, task, steps, completed, daysAgo] of fixtures) {
      const assignee = employees[index++ % employees.length];
      const existing = database
        .prepare(
          "SELECT id, user_id FROM tickets WHERE user_id IN (?, ?) AND name = ? ORDER BY id LIMIT 1",
        )
        .get(manager.id, users[3].id, name);
      if (existing) {
        // Preserve descriptions and checklist progress when migrating the original demo workspace.
        if (existing.user_id !== manager.id) {
          database
            .prepare(
              "UPDATE tickets SET user_id = ?, assignee_id = ? WHERE id = ?",
            )
            .run(manager.id, assignee.id, existing.id);
          redistributed++;
        }
        continue;
      }
      const checklist = steps.map((text, index) => ({
        text,
        done: index < completed,
      }));
      database
        .prepare(
          "INSERT INTO tickets (user_id, name, task, checklist, created_at, assignee_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          manager.id,
          name,
          task,
          JSON.stringify(checklist),
          new Date(Date.now() - daysAgo * 86400000).toISOString(),
          assignee.id,
        );
      inserted++;
    }
    const credentialsPath = path.join(root, ".env.demo");
    const credentials = [
      "# Local development only: fictional accounts with intentionally simple credentials.",
      ...accounts.flatMap((account) => {
        const prefix =
          account.role === "manager"
            ? "MANAGER"
            : account.email.split("@")[0].toUpperCase();
        return [
          `${prefix}_EMAIL=${account.email}`,
          `${prefix}_PASSWORD=${account.password}`,
        ];
      }),
      "",
    ].join("\n");
    writeFileSync(credentialsPath, credentials, { mode: 0o600 });
    chmodSync(credentialsPath, 0o600);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  console.log(
    `Demo workspace ready: 4 accounts, ${inserted} tickets added, ${redistributed} existing demo tickets assigned. Other records preserved.`,
  );
  console.log(
    "Sign-in credentials: .env.demo (kept outside Git and Docker images).",
  );
} finally {
  database.close();
}
