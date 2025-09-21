# Cloudflare mTLS Certificate Manager

A Cloudflare Workers application that provides a web UI and API for managing mTLS certificates, hostname associations, and client certificate forwarding settings.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/erichayth/cloudflare-mtls-certificate-manager)

Public Example: https://certmanager.cf-tool.com/

## Features

- Upload CA certificates to your Cloudflare account
- List existing certificates with their details
- Associate hostnames with certificates for mTLS validation
- Manage hostname associations (add, view, delete)
- Configure client certificate forwarding settings for origin servers
- Easy-to-use web interface
- RESTful API endpoints for programmatic access
- Supports API Token and Global API Key authentication

## Deployment Instructions

### Prerequisites

- A Cloudflare account
- Cloudflare API token with appropriate permissions
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (Cloudflare's CLI tool for managing Workers)

### Configuration

1. Clone this repository:
   ```bash
   git clone https://github.com/erichayth/cloudflare-mtls-certificate-manager.git
   cd cloudflare-mtls-certificate-manager
   ```

2. Open the `worker.js` file and update the `CONFIG` object with your Cloudflare account information (or set Wrangler `[vars]` in `wrangler.toml`):
   ```javascript
   const CONFIG = {
     // Your Cloudflare account ID
     ACCOUNT_ID: "your-account-id-here", // Replace or set as a secret
     
     // Auth settings - can be replaced with Workers Secrets or environment variables
    AUTH_EMAIL: "your-email@example.com", // Email for Global API Key auth
    AUTH_KEY: "your-global-api-key-here", // Global API Key (required if using server-side auth)
    AUTH_TOKEN: "",                   // API Token (optional server-side token)
    ALLOWED_ORIGINS: ""               // Comma-separated CORS allowlist (empty = same-origin only)
  };
  ```

3. Current auth: Global API Keys and API Tokens are supported in the UI. If you choose to configure credentials server-side, set them via Wrangler secrets/vars (recommended rather than hardcoding):
   ```bash
   wrangler secret put ACCOUNT_ID
   wrangler secret put AUTH_EMAIL
   wrangler secret put AUTH_KEY
  # Optional: set a server-side API Token if you don't accept client creds
  wrangler secret put AUTH_TOKEN
   ```

   And set a CORS allowlist in `wrangler.toml` if needed:
   ```toml
   [vars]
   ALLOWED_ORIGINS = "https://your-ui.example.com"
   ```

   CORS behavior:
   - Leave `ALLOWED_ORIGINS` empty for strict same-origin: only the deployed worker host (e.g., `https://<service>.<subdomain>.workers.dev` or your custom route host) is allowed.
   - Set one or more exact origins (comma-separated) to allow cross-origin browser calls from those sites.
   - No wildcard is emitted; non-browser requests (no `Origin` header) don’t get an `Access-Control-Allow-Origin` header.

   Security headers:
   - The UI HTML is served with a default Content-Security-Policy that allows only same-origin resources and disallows framing and plugins. If you embed the UI elsewhere or load external assets, you may need to adjust the CSP in `worker.js`.

### Deploy with Wrangler

1. Create a `wrangler.toml` file in your project directory:
   ```toml
   name = "mtls-certificate-manager"
   type = "javascript"
   
   account_id = "your-account-id"
   workers_dev = true
   
   [build]
   command = ""
   [build.upload]
   format = "service-worker"
   ```

2. Deploy the worker:
   ```bash
   wrangler publish
   ```

3. Your mTLS Certificate Manager will be available at the URL provided after deployment, usually: `https://mtls-certificate-manager.<your-worker-subdomain>.workers.dev`

### Alternative Deployment Method

You can also deploy directly from the Cloudflare Dashboard:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to Workers & Pages
3. Click "Create a Service"
4. Upload your `worker.js` file
5. Set up environment variables for your configuration values
6. Deploy the worker

## Usage

After deployment, access the web UI by visiting your Worker URL. The interface provides:

1. **Credentials Section** - Choose API Token or Email + Global API Key and enter your Account ID. Prefer API Tokens with minimal scopes. You can optionally "Remember credentials" (stored in localStorage) or keep them for the current session only (in-memory).
2. **Upload Certificate** - Upload new CA certificates
3. **List Certificates** - View all existing certificates
4. **Hostname Associations** - Associate certificates with specific hostnames
5. **Certificate Forwarding** - Configure client certificate forwarding settings

## API Documentation

The worker provides the following API endpoints:

- `GET /api/certificates` - List all certificates
- `POST /api/certificates` - Upload a new certificate
- `GET /api/zones` - List all zones
- `GET /api/zones/{zoneId}/hostname_associations` - List hostname associations
- `GET /api/certificates/{certId}/hostnames` - Get hostnames associated with a certificate
- `POST /api/certificates/{certId}/hostnames` - Associate hostnames with a certificate
- `DELETE /api/certificates/{certId}/hostnames` - Delete a hostname association
- `GET /api/zones/{zoneId}/certificate_forwarding` - Get certificate forwarding settings
- `PUT /api/zones/{zoneId}/certificate_forwarding` - Update certificate forwarding settings

For more details on API usage, please refer to the code comments in `worker.js`.

## API Token Permissions

When using API Tokens (recommended), grant the minimal permissions needed and scope them to only the zones you manage. The app calls the following Cloudflare APIs and requires permissions roughly equivalent to:

- Zones: Read — List zones (`GET /zones`).
- SSL and Certificates (Zone): Read, Edit — Manage mTLS hostname associations under a zone (`/zones/{zoneId}/certificate_authorities/hostname_associations`).
- Access (Zone): Read, Edit — Read and update certificate forwarding settings (`/zones/{zoneId}/access/certificates/settings`).
- SSL and Certificates (Account) or mTLS Certificates (Account): Read, Edit — Create and list account mTLS certificates (`/accounts/{accountId}/mtls_certificates`).

Notes:
- Permission names shown in the API Token builder can vary slightly; in general, look for “SSL and Certificates” and “Access” permissions at the appropriate scope (Zone vs. Account).
- Scope tokens to specific zones where possible, and to a single account.
- Global API Keys are supported for compatibility but are not scoped; prefer API Tokens.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
