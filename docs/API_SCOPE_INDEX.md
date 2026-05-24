# API Scope & Documentation Index

Quick-reference index of every API endpoint, scope, and documentation link used in 2Fast. Use this page when debugging API calls or checking parameter formats.

---

## Google / Gmail

### OAuth 2.0

| Resource | URL |
| --- | --- |
| OAuth 2.0 for Desktop Apps (full guide) | [developers.google.com/identity/protocols/oauth2/native-app](http://developers.google.com/identity/protocols/oauth2/native-app) |
| OAuth 2.0 overview | [developers.google.com/identity/protocols/oauth2](http://developers.google.com/identity/protocols/oauth2) |
| OAuth 2.0 scopes for Google APIs | [developers.google.com/identity/protocols/oauth2/scopes](http://developers.google.com/identity/protocols/oauth2/scopes) |
| Gmail API scopes (choose scopes) | [developers.google.com/workspace/gmail/api/auth/scopes](http://developers.google.com/workspace/gmail/api/auth/scopes) |
| Google Cloud Console (create OAuth client) | [console.cloud.google.com/apis/credentials](http://console.cloud.google.com/apis/credentials) |
| App verification process | [support.google.com/cloud/answer/13461325](http://support.google.com/cloud/answer/13461325) |
| OAuth 2.0 Playground (test tokens) | [developers.google.com/oauthplayground](http://developers.google.com/oauthplayground) |

### Gmail REST API v1

Base URL: `https://gmail.googleapis.com/gmail/v1`

| Endpoint | Description | Docs |
| --- | --- | --- |
| `GET /users/me/messages` | List message IDs (paginated, supports `q` search param) | [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) |
| `GET /users/me/messages/{id}` | Get full message (headers, body, attachments) | [messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) |
| `POST /users/me/messages/send` | Send email (RFC 2822 base64url encoded) | [messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) |
| `POST /users/me/messages/{id}/modify` | Add/remove labels on a message | [messages.modify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify) |
| `POST /users/me/messages/{id}/trash` | Move message to trash | [messages.trash](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/trash) |
| `GET /users/me/threads` | List threads | [threads.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list) |
| `GET /users/me/threads/{id}` | Get thread with all messages | [threads.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get) |
| `GET /users/me/labels` | List all labels | [labels.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list) |
| `POST /users/me/drafts` | Create a draft | [drafts.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create) |
| `POST /users/me/drafts/send` | Send an existing draft | [drafts.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/send) |
| `GET /users/me/messages/{id}/attachments/{aId}` | Download attachment data | [attachments.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get) |
| `GET /users/me/profile` | Get user email + messagesTotal | [users.getProfile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile) |
| `POST /users/me/watch` | Set up push notifications (Cloud Pub/Sub) | [users.watch](http://users.watch) |

### `googleapis` npm package

- Install: `pnpm add googleapis`
- Usage: `const { google } = require('googleapis'); const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });`
- Docs: [npmjs.com/package/googleapis](http://npmjs.com/package/googleapis)
- API reference: [googleapis.dev/nodejs/googleapis/latest/gmail](http://googleapis.dev/nodejs/googleapis/latest/gmail)

---

## Microsoft / Outlook

### OAuth 2.0 (Microsoft Entra / Azure AD)

| Resource | URL |
| --- | --- |
| Auth code flow with PKCE (main guide) | [learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow](http://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) |
| MSAL Node getting started | [learn.microsoft.com/en-us/entra/msal/node](http://learn.microsoft.com/en-us/entra/msal/node) |
| Register an app (Azure portal) | [learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app](http://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) |
| Permissions reference (all Graph scopes) | [learn.microsoft.com/en-us/graph/permissions-reference](http://learn.microsoft.com/en-us/graph/permissions-reference) |
| Choose auth provider (SDK guide) | [learn.microsoft.com/en-us/graph/sdks/choose-authentication-providers](http://learn.microsoft.com/en-us/graph/sdks/choose-authentication-providers) |
| Azure App Registration portal | [portal.azure.com/#view/Microsoft_AAD_RegisteredApps](http://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) |

### Microsoft Graph v1.0 — Mail

Base URL: `https://graph.microsoft.com/v1.0`

| Endpoint | Description | Docs |
| --- | --- | --- |
| `GET /me/messages` | List messages (supports `$top`, `$skip`, `$filter`, `$search`, `$select`, `$orderby`) | [List messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages) |
| `GET /me/messages/{id}` | Get single message | [Get message](https://learn.microsoft.com/en-us/graph/api/message-get) |
| `POST /me/sendMail` | Send a new email | [Send mail](https://learn.microsoft.com/en-us/graph/api/user-sendmail) |
| `POST /me/messages/{id}/reply` | Reply to a message | [Reply](https://learn.microsoft.com/en-us/graph/api/message-reply) |
| `POST /me/messages/{id}/forward` | Forward a message | [Forward](https://learn.microsoft.com/en-us/graph/api/message-forward) |
| `DELETE /me/messages/{id}` | Delete a message | [Delete](https://learn.microsoft.com/en-us/graph/api/message-delete) |
| `POST /me/messages/{id}/move` | Move to folder | [Move](https://learn.microsoft.com/en-us/graph/api/message-move) |
| `GET /me/mailFolders` | List mail folders (Inbox, Sent, Drafts, etc.) | [List folders](https://learn.microsoft.com/en-us/graph/api/user-list-mailfolders) |
| `GET /me/mailFolders/{id}/messages` | List messages in a specific folder | [List folder messages](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages) |
| `POST /me/messages` (isDraft: true) | Create a draft message | [Create message](https://learn.microsoft.com/en-us/graph/api/user-post-messages) |
| `POST /me/messages/{id}/send` | Send a draft | [Send draft](https://learn.microsoft.com/en-us/graph/api/message-send) |
| `GET /me/messages/{id}/attachments` | List attachments on a message | [List attachments](https://learn.microsoft.com/en-us/graph/api/message-list-attachments) |
| `GET /me/messages/{id}/attachments/{aId}` | Download specific attachment | [Get attachment](https://learn.microsoft.com/en-us/graph/api/attachment-get) |
| `GET /me` | Get user profile (displayName, mail, id) | [Get user](https://learn.microsoft.com/en-us/graph/api/user-get) |

### `@azure/msal-node` + `@microsoft/microsoft-graph-client`

- Install: `pnpm add @azure/msal-node @microsoft/microsoft-graph-client`
- MSAL Node docs: [learn.microsoft.com/en-us/entra/msal/node](http://learn.microsoft.com/en-us/entra/msal/node)
- Graph JS SDK: [npmjs.com/package/@microsoft/microsoft-graph-client](http://npmjs.com/package/@microsoft/microsoft-graph-client)
- Graph SDK usage: [learn.microsoft.com/en-us/graph/sdks/create-client](http://learn.microsoft.com/en-us/graph/sdks/create-client)

---

## Common debugging tips

### Google

- **"Access blocked: app not verified"** → User hasn't added themselves as a test user in GCP Console → OAuth consent screen → Test users.
- **`invalid_grant`** → Refresh token expired or revoked. Re-authenticate the user.
- **`403 Insufficient Permission`** → Wrong scope. Check the scope list passed during OAuth.
- **Rate limit (429)** → Implement exponential backoff. Check `Retry-After` header.

### Microsoft

- **`AADSTS700016: Application not found`** → Wrong client_id or app registration not in the right tenant.
- **`AADSTS65001: User has not consented`** → Need to re-trigger consent flow or admin consent.
- **`403 Forbidden` on `/me/messages`** → Missing `Mail.Read` or `Mail.ReadWrite` scope.
- **`ErrorItemNotFound`** → Message/folder ID is invalid or deleted.
- **Throttling (429)** → Read `Retry-After` header. Use delta queries to reduce call volume.
