# Cloudflare mTLS Certificate Manager

A Cloudflare Workers application that provides a web UI and API for managing mTLS certificates, hostname associations, and client certificate forwarding settings.

## Features

- Upload CA certificates to your Cloudflare account
- List existing certificates with their details
- Associate hostnames with certificates for mTLS validation
- Manage hostname associations (add, view, delete)
- Configure client certificate forwarding settings for origin servers
- Easy-to-use web interface
- RESTful API endpoints for programmatic access

## Deployment Instructions

### Prerequisites

- A Cloudflare account
- Cloudflare API token with appropriate permissions
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (Cloudflare's CLI tool for managing Workers)

### Configuration

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/cloudflare-mtls-certificate-manager.git
   cd cloudflare-mtls-certificate-manager
   ```

2. Open the `worker.js` file and update the `CONFIG` object with your Cloudflare account information:
   ```javascript
   const CONFIG = {
     // Your Cloudflare account ID
     ACCOUNT_ID: "your-account-id-here", // Replace or set as a secret
     
     // Auth settings - can be replaced with Workers Secrets or environment variables
     AUTH_EMAIL: "your-email@example.com", // Your Cloudflare account email
     AUTH_KEY: "your-api-key-here",   // Your Cloudflare API key
   };
   ```

3. For better security, use Wrangler secrets instead of hardcoding your credentials:
   ```bash
   wrangler secret put ACCOUNT_ID
   wrangler secret put AUTH_EMAIL
   wrangler secret put AUTH_KEY
   ```

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

1. **Credentials Section** - Enter your Cloudflare API credentials
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

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.