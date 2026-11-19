# Composio Integration Dashboard

A small Node.js + Express starter app with an integration catalog and server-side Composio connection flow.

## Requirements

- Node.js 20 or newer
- A Composio account and Project API key from the Composio dashboard

## Run locally

1. Extract this folder.
2. Open a terminal in this folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and set `COMPOSIO_API_KEY` to your Composio Project API key.
6. Run the app:

   ```bash
   npm start
   ```

7. Open `http://localhost:3000`.

## Connect an account

Click **Connect account** on GitHub, Gmail, Slack, or another listed toolkit. The backend creates a Composio session for `COMPOSIO_USER_ID`, asks Composio to authorize that toolkit, and redirects the browser to the returned hosted authentication URL.

Composio-managed authentication is used where supported. Some toolkits may require a custom auth config or additional setup in the Composio dashboard. The starter catalog's slugs are examples; if a toolkit does not connect, check its current slug and auth requirements in the Composio dashboard/catalog.

## Important security and production notes

- Never put `COMPOSIO_API_KEY` in `public/`, frontend JavaScript, source control, or a client-side environment variable.
- Never paste provider passwords, OAuth client secrets, or API tokens into this chat.
- `COMPOSIO_USER_ID=demo-user-001` is only for local testing. In a real multi-user app, derive a stable, unique user ID from your own authenticated user's database record. Do not use a shared ID such as `default` for every customer.
- Add your own login/session authentication, CSRF protection, rate limiting, and authorization checks before exposing this server publicly.
- This starter uses a small curated catalog, not a complete list of Composio integrations. Use Composio's toolkit APIs/SDK to build a paginated live catalog for production.
- The app starts authentication but does not persist a local database of connections. Use Composio's session toolkit status or connected-account APIs to refresh the status, and validate callback state before associating a connection with a user.

## Official documentation

- Composio API reference: https://docs.composio.dev/reference
- Authentication: https://docs.composio.dev/docs/authentication
- Manual authentication / Connect Links: https://docs.composio.dev/docs/authentication/manually-authenticating
- Toolkit catalog: https://composio.dev/toolkits
