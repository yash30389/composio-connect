require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Composio } = require("@composio/core");

const app = express();
const PORT = Number(process.env.PORT || 8800);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const DEMO_MODE = process.env.DEMO_MODE === "true";
const MAX_GMAIL_ACCOUNTS = Math.min(
  10,
  Math.max(2, Number(process.env.MAX_GMAIL_ACCOUNTS || 5))
);

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const CATALOG = [
  { slug: "github", name: "GitHub", icon: "GH", category: "Development", auth: "OAuth", description: "Repositories, issues, pull requests, and code workflows." },
  { slug: "gmail", name: "Gmail", icon: "GM", category: "Communication", auth: "OAuth", description: "Connect personal or work Gmail accounts." },
  { slug: "googlecalendar", name: "Google Calendar", icon: "GC", category: "Productivity", auth: "OAuth", description: "Manage calendars and events." },
  { slug: "googledrive", name: "Google Drive", icon: "GD", category: "Productivity", auth: "OAuth", description: "Access files and documents." },
  { slug: "slack", name: "Slack", icon: "SL", category: "Communication", auth: "OAuth", description: "Connect workspaces and messaging." },
  { slug: "notion", name: "Notion", icon: "NO", category: "Productivity", auth: "OAuth", description: "Work with pages and databases." },
  { slug: "linear", name: "Linear", icon: "LI", category: "Development", auth: "OAuth", description: "Manage projects, issues, and cycles." },
  { slug: "jira", name: "Jira", icon: "JI", category: "Development", auth: "OAuth", description: "Manage issues and project workflows." },
  { slug: "microsoft_teams", name: "Microsoft Teams", icon: "MT", category: "Communication", auth: "OAuth", description: "Connect Teams collaboration." },
  { slug: "outlook", name: "Outlook", icon: "OL", category: "Communication", auth: "OAuth", description: "Connect Microsoft email and calendar." },
  { slug: "dropbox", name: "Dropbox", icon: "DB", category: "Storage", auth: "OAuth", description: "Access files and folders." },
  { slug: "figma", name: "Figma", icon: "FI", category: "Design", auth: "OAuth", description: "Connect design files and projects." },
  { slug: "hubspot", name: "HubSpot", icon: "HS", category: "CRM", auth: "OAuth", description: "Connect CRM and customer workflows." },
  { slug: "salesforce", name: "Salesforce", icon: "SF", category: "CRM", auth: "OAuth", description: "Connect CRM records and workflows." },
  { slug: "stripe", name: "Stripe", icon: "ST", category: "Finance", auth: "OAuth", description: "Connect payment and billing workflows." },
  { slug: "webflow", name: "Webflow", icon: "WF", category: "Design", auth: "OAuth", description: "Connect website content and publishing." }
];

let composioClient;

function getComposio() {
  if (!process.env.COMPOSIO_API_KEY) {
    const error = new Error("COMPOSIO_API_KEY is missing from the server .env file.");
    error.status = 503;
    throw error;
  }

  if (!composioClient) {
    composioClient = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY
    });
  }

  return composioClient;
}

function makeUserId() {
  return `demo_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(USERS_FILE);
  } catch {
    const initialUsers = [
      {
        id: "yash-user-001",
        name: "Yash",
        createdAt: new Date().toISOString()
      },
      {
        id: "demo-user-a",
        name: "Demo User A",
        createdAt: new Date().toISOString()
      },
      {
        id: "demo-user-b",
        name: "Demo User B",
        createdAt: new Date().toISOString()
      }
    ];

    await fs.writeFile(USERS_FILE, JSON.stringify(initialUsers, null, 2));
  }
}

async function readUsers() {
  await ensureDataFile();
  return JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const tempFile = `${USERS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(users, null, 2));
  await fs.rename(tempFile, USERS_FILE);
}

async function findUser(userId) {
  const users = await readUsers();
  return users.find((user) => user.id === userId) || null;
}

function requireDemoMode(req, res, next) {
  if (!DEMO_MODE) {
    return res.status(403).json({
      error: "Demo endpoints are disabled. Use real application authentication."
    });
  }

  next();
}

async function getRequestedUser(req) {
  const userId = String(req.header("x-demo-user-id") || "").trim();

  if (!userId) {
    const error = new Error("Select an application user first.");
    error.status = 400;
    throw error;
  }

  const user = await findUser(userId);

  if (!user) {
    const error = new Error("Unknown application user. Refresh the user list.");
    error.status = 404;
    throw error;
  }

  return user;
}

function safeAccount(account) {
  const state = account.state || {};
  const stateValues = state.val || {};

  return {
    id: account.id || account.nanoid || null,
    toolkit: account.toolkit?.slug || account.toolkitSlug || "unknown",
    status: account.status || "UNKNOWN",
    alias: account.alias || null,
    displayName: stateValues.displayName || null,
    createdAt: account.createdAt || account.created_at || null
  };
}

async function listAccountsForUser(userId) {
  const composio = getComposio();

  // Use the current Composio TypeScript SDK connected-account API.
  const result = await composio.connectedAccounts.list({
    userIds: [userId],
    limit: 100
  });

  const accounts = Array.isArray(result)
    ? result
    : result.items || result.data || [];

  return accounts
    .map(safeAccount)
    .filter((account) => account.id);
}

function statusForToolkit(slug, accounts) {
  const matching = accounts.filter(
    (account) =>
      account.toolkit.toLowerCase() === slug.toLowerCase() &&
      account.status.toUpperCase() === "ACTIVE"
  );

  return {
    status: matching.length > 0 ? "connected" : "not_connected",
    connectedCount: matching.length,
    accounts: matching
  };
}

function getToolkit(slug) {
  return CATALOG.find((tool) => tool.slug === slug.toLowerCase()) || null;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "composio-dashboard",
    demoMode: DEMO_MODE
  });
});

/*
 * DEMO USER MANAGEMENT
 * These endpoints are intentionally only available in local demo mode.
 */

app.get("/api/users", requireDemoMode, async (_req, res, next) => {
  try {
    const users = await readUsers();

    res.set("Cache-Control", "no-store");
    res.json({
      users: users.map(({ id, name, createdAt }) => ({ id, name, createdAt }))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireDemoMode, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: "User name must be between 2 and 80 characters."
      });
    }

    const users = await readUsers();
    const user = {
      id: makeUserId(),
      name,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    await writeUsers(users);

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/users/:id", requireDemoMode, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: "User name must be between 2 and 80 characters."
      });
    }

    const users = await readUsers();
    const user = users.find((item) => item.id === req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    user.name = name;
    await writeUsers(users);

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/users/:id", requireDemoMode, async (req, res, next) => {
  try {
    const users = await readUsers();
    const index = users.findIndex((item) => item.id === req.params.id);

    if (index < 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const [deleted] = users.splice(index, 1);
    await writeUsers(users);

    // This removes the local demo user only. It does not revoke
    // or delete any Composio connected accounts.
    res.json({
      deleted: { id: deleted.id, name: deleted.name },
      note: "Local user removed. Composio accounts were not deleted."
    });
  } catch (error) {
    next(error);
  }
});

/*
 * INTEGRATION CATALOG AND LIVE CONNECTION STATUS
 */

app.get("/api/toolkits", requireDemoMode, async (req, res, next) => {
  try {
    const user = await getRequestedUser(req);

    if (!process.env.COMPOSIO_API_KEY) {
      return res.json({
        configured: false,
        user,
        tools: CATALOG.map((tool) => ({
          ...tool,
          status: "not_connected",
          connectedCount: 0,
          accounts: []
        }))
      });
    }

    const accounts = await listAccountsForUser(user.id);

    const tools = CATALOG.map((tool) => ({
      ...tool,
      ...statusForToolkit(tool.slug, accounts)
    }));

    res.set("Cache-Control", "no-store");
    res.json({
      configured: true,
      user: { id: user.id, name: user.name },
      tools,
      connectedAccounts: accounts
    });
  } catch (error) {
    next(error);
  }
});

/*
 * START AN AUTHENTICATION FLOW.
 *
 * For multiple Gmail accounts, give each account a distinct alias.
 * The alias is only a label; it is not proof of the Google email address.
 */


app.post("/api/connect/:slug", requireDemoMode, async (req, res, next) => {
  try {
    const user = await getRequestedUser(req);
    const tool = getToolkit(req.params.slug);

    if (!tool) {
      return res.status(404).json({ error: "Unknown toolkit slug." });
    }

    const aliasInput = String(req.body?.alias || "").trim();

    const alias = aliasInput
      ? aliasInput
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .slice(0, 60)
      : `${tool.slug}-${Date.now()}`;

    const composio = getComposio();

    // Await session creation before calling authorize().
    const session = await composio.create(user.id);

    if (typeof session?.authorize !== "function") {
      throw new Error(
        "The created Composio session does not expose authorize()."
      );
    }

    const connectionRequest = await session.authorize(tool.slug, {
      alias,
      callbackUrl: `${APP_BASE_URL}/?status=success`,
    });

    if (!connectionRequest?.redirectUrl) {
      throw new Error(
        "Composio did not return a redirect URL. Check the server logs."
      );
    }

    return res.json({
      redirectUrl: connectionRequest.redirectUrl,
      user: { id: user.id, name: user.name },
      toolkit: tool.slug,
      alias,
    });
  } catch (error) {
    next(error);
  }
});


/*
 * OPTIONAL: LIST CONNECTED ACCOUNTS FOR THE SELECTED USER.
 */

app.get("/api/accounts", requireDemoMode, async (req, res, next) => {
  try {
    const user = await getRequestedUser(req);
    const accounts = await listAccountsForUser(user.id);

    res.set("Cache-Control", "no-store");
    res.json({
      user: { id: user.id, name: user.name },
      accounts
    });
  } catch (error) {
    next(error);
  }
});

/*
 * Error handler: return readable errors, but never expose API keys or tokens.
 */

app.use((error, _req, res, _next) => {
  console.error("[API error]", error.message || error);

  const status = Number(error.status) || 500;

  res.status(status).json({
    error:
      status < 500
        ? error.message
        : "The request failed. Check the server logs and installed Composio SDK version."
  });
});

async function start() {
  await ensureDataFile();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Composio dashboard running on port ${PORT}`);
    console.log(`Demo mode: ${DEMO_MODE ? "enabled" : "disabled"}`);
    console.log(`Data file: ${USERS_FILE}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});