/**
 * Cloudflare mTLS Certificate Manager Worker
 * 
 * This worker provides an API and UI to manage mTLS certificates on Cloudflare
 * with hostname association capabilities and client certificate forwarding settings.
 */

// Configuration - replace with your actual values or use environment variables
const CONFIG = {
  // Your Cloudflare account ID
  ACCOUNT_ID: "", // Replace this with your account ID or set as a secret
  
  // Auth settings - can be replaced with Workers Secrets or environment variables
  AUTH_EMAIL: "", // Your Cloudflare account email
  AUTH_KEY: "",   // Your Cloudflare API key

  // API endpoints
  CF_API_BASE: "https://api.cloudflare.com/client/v4",
};

/**
 * Main request handler for the worker
 */
async function handleRequest(request) {
  // CORS headers to allow cross-origin requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Email, X-Auth-Key, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  
  // Handle OPTIONS request for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  
  // Log the request URL and method for debugging
  console.log(`Request: ${request.method} ${url.pathname}`);
  
  // Normalize path (remove trailing slash if present)
  let normalizedPath = url.pathname;
  if (normalizedPath.endsWith('/') && normalizedPath !== '/') {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  
  const path = normalizedPath.split("/").filter(Boolean);
  console.log(`Parsed path:`, path);
  
  // Serve the web UI for the root path
  if (path.length === 0) {
    return new Response(getHtmlUI(), {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
      },
    });
  }

  // Serve CSS for the UI
  if (path[0] === "styles.css") {
    return new Response(getStyles(), {
      headers: {
        "Content-Type": "text/css;charset=UTF-8",
      },
    });
  }

  // Serve JavaScript for the UI
  if (path[0] === "script.js") {
    return new Response(getScript(), {
      headers: {
        "Content-Type": "application/javascript;charset=UTF-8",
      },
    });
  }
  
  // Handle API requests
  if (path[0] === "api") {
    console.log(`API request: ${path.join('/')}`);
    
    // List zones API
    if (path.length >= 2 && path[1] === "zones") {
      if (path.length === 2 && request.method === "GET") {
        console.log("Handling list zones request");
        return await handleListZones(request, corsHeaders);
      }
      
      // List hostname associations for a zone
      if (path.length === 4 && path[3] === "hostname_associations" && request.method === "GET") {
        console.log(`Handling hostname associations for zone: ${path[2]}`);
        return await handleListHostnameAssociations(request, corsHeaders, path[2]);
      }
      
      // NEW: Get certificate forwarding settings
      if (path.length === 4 && path[3] === "certificate_forwarding" && request.method === "GET") {
        console.log(`Handling get certificate forwarding settings for zone: ${path[2]}`);
        return await handleGetCertificateForwarding(request, corsHeaders, path[2]);
      }
      
      // NEW: Update certificate forwarding settings
      if (path.length === 4 && path[3] === "certificate_forwarding" && request.method === "PUT") {
        console.log(`Handling update certificate forwarding settings for zone: ${path[2]}`);
        return await handleUpdateCertificateForwarding(request, corsHeaders, path[2]);
      }
    }
    
    // Certificate related APIs
    if (path.length >= 2 && path[1] === "certificates") {
      // Upload certificates API
      if (path.length === 2 && request.method === "POST") {
        console.log("Handling certificate upload");
        return await handleCertificateUpload(request, corsHeaders);
      }
      
      // List certificates API
      if (path.length === 2 && request.method === "GET") {
        console.log("Handling list certificates");
        return await handleListCertificates(request, corsHeaders);
      }
      
      // Associate hostname API
      if (path.length === 4 && path[3] === "hostnames" && request.method === "POST") {
        console.log(`Handling hostname association for certificate: ${path[2]}`);
        return await handleAssociateHostname(request, corsHeaders, path[2]);
      }
      
      // Get hostname associations API
      if (path.length === 4 && path[3] === "hostnames" && request.method === "GET") {
        console.log(`Handling get hostname associations for certificate: ${path[2]}`);
        return await handleGetHostnameAssociations(request, corsHeaders, path[2]);
      }
      
      // Delete hostname association API
      if (path.length === 4 && path[3] === "hostnames" && request.method === "DELETE") {
        console.log(`Handling delete hostname association for certificate: ${path[2]}`);
        return await handleDeleteHostnameAssociation(request, corsHeaders, path[2]);
      }
    }
    
    // Unknown API endpoint
    console.log(`Unknown API endpoint: ${path.join('/')}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: `Unknown API endpoint: /${path.join('/')}` }]
    }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Handle any other paths
  console.log(`Not found: ${url.pathname}`);
  return new Response(`Not found: ${url.pathname}`, {
    status: 404,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

/**
 * NEW: Handle getting certificate forwarding settings
 */
async function handleGetCertificateForwarding(request, corsHeaders, zoneId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate zoneId
  if (!zoneId) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required parameter: zoneId" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API
  const cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/access/certificates/settings`;
  console.log(`Making GET request to: ${cfApiUrl}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log(`Response from Cloudflare API: ${response.status}`);
    console.log(`Response data:`, responseData);
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error getting certificate forwarding settings: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to fetch certificate forwarding settings" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * NEW: Handle updating certificate forwarding settings
 */
async function handleUpdateCertificateForwarding(request, corsHeaders, zoneId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate zoneId
  if (!zoneId) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required parameter: zoneId" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Parse request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Invalid JSON body" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate request body
  if (!requestBody.hostname) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required field: hostname" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API
  const cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/access/certificates/settings`;
  console.log(`Making PUT request to: ${cfApiUrl}`);
  
  // Prepare the payload for Cloudflare API
  const payload = {
    settings: [
      {
        hostname: requestBody.hostname,
        client_certificate_forwarding: requestBody.enabled === true,
        china_network: false
      }
    ]
  };
  
  console.log(`Setting certificate forwarding for hostname ${requestBody.hostname} to ${requestBody.enabled === true ? 'enabled' : 'disabled'}`);
  console.log(`Payload: ${JSON.stringify(payload)}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log(`Response from Cloudflare API: ${response.status}`);
    console.log(`Response data:`, responseData);
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error updating certificate forwarding settings: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to update certificate forwarding settings" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle certificate upload request
 */
async function handleCertificateUpload(request, corsHeaders) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Parse request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Invalid JSON body" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate request body
  if (!requestBody.name || !requestBody.certificates) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required fields: name and certificates are required" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate certificates format
  if (!validateCertificates(requestBody.certificates)) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Invalid certificate format. Must contain one or more valid PEM certificates." }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Get account ID from config or request
  const accountId = requestBody.accountId || CONFIG.ACCOUNT_ID;
  
  if (!accountId || accountId === "") {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Account ID is not configured. Please provide it in the request or configure it in the worker." }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API
  const cfApiUrl = `${CONFIG.CF_API_BASE}/accounts/${accountId}/mtls_certificates`;
  console.log(`Making request to: ${cfApiUrl}`);
  
  // Prepare the payload for Cloudflare API
  const payload = {
    name: requestBody.name,
    certificates: requestBody.certificates,
    // Set ca flag if the certificate is a CA certificate
    ca: requestBody.ca !== undefined ? requestBody.ca : true
  };
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log(`Response from Cloudflare API: ${response.status}`);
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error uploading certificate: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to upload certificate to Cloudflare API" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle listing certificates
 */
async function handleListCertificates(request, corsHeaders) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || CONFIG.ACCOUNT_ID;
  
  if (!accountId || accountId === "") {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Account ID is not configured. Please provide it in the request or configure it in the worker." }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API
  const cfApiUrl = `${CONFIG.CF_API_BASE}/accounts/${accountId}/mtls_certificates`;
  console.log(`Making request to: ${cfApiUrl}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log(`Response from Cloudflare API: ${response.status}`);
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error listing certificates: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to fetch certificates from Cloudflare API" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle listing zones
 */
async function handleListZones(request, corsHeaders) {
  console.log("Executing handleListZones function");
  
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  console.log(`Auth headers: ${authEmail ? 'Email present' : 'Email missing'}, ${authKey ? 'Key present' : 'Key missing'}`);
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API
  const cfApiUrl = `${CONFIG.CF_API_BASE}/zones`;
  console.log(`Making request to: ${cfApiUrl}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    console.log(`Cloudflare API response status: ${response.status}`);
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error listing zones: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to fetch zones from Cloudflare API" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle listing hostname associations for a zone
 */
async function handleListHostnameAssociations(request, corsHeaders, zoneId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  if (!zoneId) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required parameter: zoneId" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Get the certId from the request URL if provided
  const url = new URL(request.url);
  const certId = url.searchParams.get("certId");
  
  // Prepare the API URL with certId as mtls_certificate_id if provided
  let cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/certificate_authorities/hostname_associations`;
  
  // If certId is provided and not 'all', add it as a query parameter
  if (certId && certId !== 'all') {
    cfApiUrl += `?mtls_certificate_id=${encodeURIComponent(certId)}`;
    console.log(`Fetching hostname associations for certificate: ${certId}`);
  }
  
  console.log(`Fetching hostname associations from: ${cfApiUrl}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log("Hostname associations response:", JSON.stringify(responseData));
    
    // Create a formatted response object
    let formattedResponse = {
      success: responseData.success,
      errors: responseData.errors || [],
      messages: responseData.messages || [],
      result: []
    };
    
    // If there are hostnames in the response, convert them to the format expected by the UI
    if (responseData.success && responseData.result && responseData.result.hostnames) {
      // Convert the hostnames array to the format expected by the UI
      formattedResponse.result = responseData.result.hostnames.map(hostname => {
        return {
          hostname: hostname,
          // When certId is provided and not 'all', we know all hostnames are associated with this certificate
          mtls_certificate_id: certId && certId !== 'all' ? certId : "default_cert_id",
          status: "Active"
        };
      });
    } else if (responseData.success && Array.isArray(responseData.result)) {
      // Handle the case where the result is already an array (old format)
      formattedResponse.result = responseData.result;
      
      // Filter by certificate ID if provided and not 'all'
      if (certId && certId !== 'all') {
        formattedResponse.result = formattedResponse.result.filter(
          item => item.mtls_certificate_id === certId
        );
      }
    }
    
    console.log("Formatted response:", JSON.stringify(formattedResponse));
    
    // Return the formatted response
    return new Response(JSON.stringify(formattedResponse), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error fetching hostname associations:", error);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: `Error fetching hostname associations: ${error.message}` }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle associating hostname with certificate
 */
async function handleAssociateHostname(request, corsHeaders, certId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Parse request body
  let requestBody;
  try {
    // First get the request as text to log it for debugging
    const text = await request.text();
    console.log("Raw request body:", text);
    
    if (!text || text.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        errors: [{ message: "Empty request body" }]
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    // Try to parse the text as JSON
    try {
      requestBody = JSON.parse(text);
      console.log("Parsed request body:", JSON.stringify(requestBody));
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(JSON.stringify({
        success: false,
        errors: [{ message: "Invalid JSON body: " + parseError.message }]
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  } catch (error) {
    console.error("Error reading request body:", error);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Error reading request body: " + error.message }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Validate request body - now accepting either hostname or hostnames array
  if ((!requestBody.hostname && !requestBody.hostnames) || !requestBody.zoneId) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required fields: either hostname (string) or hostnames (array) is required, along with zoneId" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API - using the correct endpoint and method
  const cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${requestBody.zoneId}/certificate_authorities/hostname_associations`;
  
  // Determine hostnames to associate based on input
  let hostnamesArray = [];
  
  if (requestBody.hostnames && Array.isArray(requestBody.hostnames)) {
    // Multiple hostnames provided as an array
    hostnamesArray = requestBody.hostnames;
    console.log(`Associating multiple hostnames (${hostnamesArray.length}) with certificate: ${certId}`);
  } else if (requestBody.hostname) {
    // Single hostname provided as a string (legacy support)
    hostnamesArray = [requestBody.hostname];
    console.log(`Associating hostname: ${requestBody.hostname} with certificate: ${certId}`);
  }
  
  // Validate that we have at least one hostname
  if (hostnamesArray.length === 0) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "No valid hostnames provided for association" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare the payload for Cloudflare API
  // The API expects an array of hostnames and the mtls_certificate_id parameter
  const payload = {
    hostnames: hostnamesArray,  // Array of hostnames
    mtls_certificate_id: certId  // Using the certificate ID from the path
  };
  
  console.log(`Associating ${hostnamesArray.length} hostname(s) with certificate: ${certId} for zone: ${requestBody.zoneId}`);
  console.log(`API URL: ${cfApiUrl}`);
  console.log(`Payload: ${JSON.stringify(payload)}`);
  
  // Make request to Cloudflare API using PUT method instead of POST
  try {
    const response = await fetch(cfApiUrl, {
      method: "PUT",  // Using PUT instead of POST for Replace Hostname Associations endpoint
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`Response status code: ${response.status}`);
    
    // Try to parse the response as JSON, but handle the case where it might not be valid JSON
    let responseData;
    let responseText;
    
    try {
      responseText = await response.text();
      console.log("Raw response text:", responseText);
      
      if (responseText && responseText.trim() !== '') {
        try {
          responseData = JSON.parse(responseText);
          console.log("Parsed response data:", JSON.stringify(responseData));
        } catch (parseError) {
          console.error("Error parsing response as JSON:", parseError);
          // Return a formatted error response with the raw text
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: "Error parsing Cloudflare API response as JSON" }],
            raw_response: responseText,
            status_code: response.status
          }), {
            status: 502,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }
      } else {
        // Handle empty response
        console.error("Empty response from Cloudflare API");
        return new Response(JSON.stringify({
          success: false,
          errors: [{ message: "Empty response from Cloudflare API" }],
          status_code: response.status
        }), {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    } catch (error) {
      console.error("Error reading response:", error);
      return new Response(JSON.stringify({
        success: false,
        errors: [{ message: "Error reading response from Cloudflare API: " + error.message }]
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error associating hostname: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to associate hostname with certificate: " + error.message }]
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle getting hostname associations for a certificate
 */
async function handleGetHostnameAssociations(request, corsHeaders, certId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  const url = new URL(request.url);
  const zoneId = url.searchParams.get("zoneId");
  
  if (!zoneId) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required query parameter: zoneId" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // Prepare request to Cloudflare API with mtls_certificate_id parameter
  let cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/certificate_authorities/hostname_associations`;
  
  // If certId is provided and not 'all', add it as a query parameter
  if (certId && certId !== 'all') {
    cfApiUrl += `?mtls_certificate_id=${encodeURIComponent(certId)}`;
    console.log(`Fetching hostname associations for certificate: ${certId}`);
  }
  
  console.log(`Fetching hostname associations from: ${cfApiUrl}`);
  
  // Make request to Cloudflare API
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    console.log("Hostname associations response:", JSON.stringify(responseData));
    
    // Create a formatted response object
    let formattedResponse = {
      success: responseData.success,
      errors: responseData.errors || [],
      messages: responseData.messages || [],
      result: []
    };
    
    // If there are hostnames in the response, convert them to the format expected by the UI
    if (responseData.success && responseData.result && responseData.result.hostnames) {
      // Convert the hostnames array to the format expected by the UI
      formattedResponse.result = responseData.result.hostnames.map(hostname => {
        return {
          hostname: hostname,
          // When certId is provided and not 'all', we know all hostnames are associated with this certificate
          mtls_certificate_id: certId && certId !== 'all' ? certId : "default_cert_id",
          status: "Active"
        };
      });
    } else if (responseData.success && Array.isArray(responseData.result)) {
      // Handle the case where the result is already an array (old format)
      formattedResponse.result = responseData.result;
      
      // Filter by certificate ID if provided and not 'all'
      if (certId && certId !== 'all') {
        formattedResponse.result = formattedResponse.result.filter(
          item => item.mtls_certificate_id === certId
        );
      }
    }
    
    console.log("Formatted response:", JSON.stringify(formattedResponse));
    
    // Return the formatted response
    return new Response(JSON.stringify(formattedResponse), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error fetching hostname associations:", error);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: `Error fetching hostname associations: ${error.message}` }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle deleting hostname association
 */
async function handleDeleteHostnameAssociation(request, corsHeaders, certId) {
  // Extract authorization headers
  const authEmail = request.headers.get("X-Auth-Email") || CONFIG.AUTH_EMAIL;
  const authKey = request.headers.get("X-Auth-Key") || CONFIG.AUTH_KEY;
  
  // Validate authorization
  if (!authEmail || !authKey) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing authentication credentials. Provide X-Auth-Email and X-Auth-Key headers." }]
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  const url = new URL(request.url);
  const zoneId = url.searchParams.get("zoneId");
  const hostname = url.searchParams.get("hostname");
  
  if (!zoneId || !hostname) {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Missing required query parameters: zoneId and hostname" }]
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  
  // To remove a hostname association, we need to update the hostnames list without the one to delete
  // First, get the current hostname associations
  let cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/certificate_authorities/hostname_associations`;
  if (certId && certId !== 'all') {
    cfApiUrl += `?mtls_certificate_id=${encodeURIComponent(certId)}`;
  }
  
  console.log(`Getting current hostname associations for certificate: ${certId}`);
  
  // Make request to get current hostname associations
  try {
    const response = await fetch(cfApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      }
    });
    
    // Get response from Cloudflare API
    const responseData = await response.json();
    
    if (!responseData.success) {
      return new Response(JSON.stringify(responseData), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    // Extract the current hostnames
    let currentHostnames = [];
    if (responseData.result && responseData.result.hostnames) {
      currentHostnames = responseData.result.hostnames;
    } else if (Array.isArray(responseData.result)) {
      // Handle old format if needed
      currentHostnames = responseData.result.map(item => item.hostname);
    }
    
    // Filter out the hostname to delete
    const updatedHostnames = currentHostnames.filter(h => h !== hostname);
    
    // Prepare the API URL for updating hostname associations
    cfApiUrl = `${CONFIG.CF_API_BASE}/zones/${zoneId}/certificate_authorities/hostname_associations`;
    
    // Prepare the payload
    const payload = {
      hostnames: updatedHostnames,
      mtls_certificate_id: certId
    };
    
    console.log(`Updating hostname associations without ${hostname}: ${JSON.stringify(payload)}`);
    
    // Make the PUT request to update associations
    const updateResponse = await fetch(cfApiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Email": authEmail,
        "X-Auth-Key": authKey,
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    // Get response from Cloudflare API
    const updateResponseData = await updateResponse.json();
    
    // Return response with appropriate status code
    return new Response(JSON.stringify(updateResponseData), {
      status: updateResponse.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error(`Error deleting hostname association: ${error.message}`);
    return new Response(JSON.stringify({
      success: false,
      errors: [{ message: "Failed to delete hostname association" }],
      details: error.message
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Validate certificate format (basic validation)
 */
function validateCertificates(certificates) {
  // Check if the certificates string contains at least one valid PEM certificate
  const pemRegex = /-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g;
  const matches = certificates.match(pemRegex);
  
  return matches && matches.length > 0;
}

/**
 * Return the HTML for the user interface
 */
function getHtmlUI() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>mTLS Certificate Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>mTLS Certificate Manager</h1>
      <p>Upload and manage your mTLS certificates for Cloudflare</p>
    </header>
    
    <div class="credentials-section">
      <h2>Cloudflare Credentials</h2>
      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" placeholder="Your Cloudflare email">
      </div>
      <div class="form-group">
        <label for="api-key">API Key</label>
        <input type="password" id="api-key" placeholder="Your Cloudflare API key">
      </div>
      <div class="form-group">
        <label for="account-id">Account ID</label>
        <input type="text" id="account-id" placeholder="Your Cloudflare account ID">
      </div>
      <button id="save-credentials" class="btn primary">Save Credentials</button>
      <div class="checkbox-group">
        <input type="checkbox" id="remember-credentials" checked>
        <label for="remember-credentials">Remember credentials in browser</label>
      </div>
      <div id="credentials-message" class="message"></div>
    </div>
    
    <div class="tabs">
      <button class="tab-btn active" data-tab="upload">Upload Certificate</button>
      <button class="tab-btn" data-tab="list">List Certificates</button>
      <button class="tab-btn" data-tab="hostnames">Hostname Associations</button>
      <button class="tab-btn" data-tab="forwarding">Certificate Forwarding</button>
    </div>
    
    <div id="upload" class="tab-content active">
      <h2>Upload mTLS Certificate</h2>
      
      <div class="form-group">
        <label for="cert-name">Certificate Name</label>
        <input type="text" id="cert-name" placeholder="A descriptive name for your certificate">
      </div>
      
      <div class="form-group">
        <label for="cert-content">Certificate Content (PEM Format)</label>
        <textarea id="cert-content" rows="10" placeholder="Paste your certificate in PEM format here"></textarea>
      </div>
      
      <div class="checkbox-group">
        <input type="checkbox" id="is-ca" checked>
        <label for="is-ca">This is a CA certificate</label>
      </div>
      
      <div class="file-upload">
        <label for="cert-file">Or upload a certificate file:</label>
        <input type="file" id="cert-file" accept=".pem,.crt,.cer,.cert">
      </div>
      
      <button id="upload-cert" class="btn primary">Upload Certificate</button>
      <div id="upload-message" class="message"></div>
    </div>
    
    <div id="list" class="tab-content">
      <h2>Existing Certificates</h2>
      <button id="refresh-certs" class="btn secondary">Refresh List</button>
      <div id="certificates-list"></div>
      <div id="list-message" class="message"></div>
    </div>
    
    <div id="hostnames" class="tab-content">
      <h2>Hostname Associations</h2>
      
      <div class="hostname-selector">
        <div class="form-group">
          <label for="zone-select">Select Zone</label>
          <select id="zone-select">
            <option value="">-- Select a zone --</option>
          </select>
          <button id="load-zones" class="btn secondary">Load Zones</button>
        </div>
        
        <div class="form-group">
          <label for="cert-select">Select Certificate (Optional for viewing)</label>
          <select id="cert-select">
            <option value="">-- All Certificates --</option>
          </select>
          <button id="load-certs-for-hostnames" class="btn secondary">Load Certificates</button>
        </div>
      </div>
      
      <div class="hostname-form">
        <h3>Add Hostname Association</h3>
        <div class="form-group">
          <label for="hostname-input">Hostname</label>
          <input type="text" id="hostname-input" placeholder="e.g., example.com or *.example.com">
        </div>
        <div class="form-group">
          <label for="hostnames-input">Or Multiple Hostnames (one per line)</label>
          <textarea id="hostnames-input" rows="4" placeholder="example.com&#10;sub.example.com&#10;*.example.org"></textarea>
        </div>
        <div class="form-group">
          <label for="add-cert-select">Certificate (Required for adding)</label>
          <select id="add-cert-select">
            <option value="">-- Select a certificate --</option>
          </select>
        </div>
        <button id="add-hostname" class="btn primary">Add Association</button>
        <div id="hostname-message" class="message"></div>
      </div>
      
      <div class="hostname-list">
        <h3>Current Hostname Associations</h3>
        <button id="refresh-hostnames" class="btn secondary">Refresh Associations</button>
        <div id="hostname-associations-list"></div>
      </div>
    </div>

    <div id="forwarding" class="tab-content">
      <h2>Client Certificate Forwarding</h2>
      
      <div class="forwarding-info">
        <p>Configure client certificate forwarding to send client certificates to your origin server as HTTP headers. This setup is often helpful for server logging.</p>
        <p>When enabled, the first request of an mTLS connection will include the client certificate headers.</p>
      </div>
      
      <div class="forwarding-selector">
        <div class="form-group">
          <label for="forwarding-zone-select">Select Zone</label>
          <select id="forwarding-zone-select">
            <option value="">-- Select a zone --</option>
          </select>
          <button id="load-forwarding-zones" class="btn secondary">Load Zones</button>
        </div>
        
        <button id="check-forwarding" class="btn secondary">Check Status</button>
      </div>
      
      <div class="forwarding-toggle" style="display: none;">
        <h3>Certificate Forwarding Settings</h3>
        <div id="forwarding-settings-list">
          <!-- Will be populated with hostname settings -->
        </div>
        
        <div class="hostname-forwarding-form">
          <h3>Update Hostname Forwarding</h3>
          <div class="form-group">
            <label for="forwarding-hostname-input">Hostname</label>
            <input type="text" id="forwarding-hostname-input" placeholder="e.g., example.com or *.example.com">
          </div>
          <div class="form-actions">
            <button id="enable-forwarding" class="btn primary">Enable Forwarding</button>
            <button id="disable-forwarding" class="btn danger">Disable Forwarding</button>
          </div>
        </div>
        
        <div id="forwarding-message" class="message"></div>
      </div>
    </div>
  </div>
  <script src="script.js"></script>
</body>
</html>`;
}

/**
 * Return the CSS styles for the UI
 */
function getStyles() {
  return `
:root {
  --primary-color: #f6821f;
  --primary-dark: #d36b19;
  --secondary-color: #232323;
  --light-gray: #f5f5f5;
  --medium-gray: #e0e0e0;
  --dark-gray: #808080;
  --text-color: #333;
  --danger-color: #e74c3c;
  --success-color: #2ecc71;
  --warning-color: #f39c12;
  --info-color: #3498db;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background-color: #f9f9f9;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--medium-gray);
}

header h1 {
  color: var(--primary-color);
  margin-bottom: 10px;
}

header p {
  color: var(--dark-gray);
}

h2 {
  margin-bottom: 20px;
  color: var(--secondary-color);
}

h3 {
  margin-bottom: 15px;
  color: var(--secondary-color);
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

input[type="text"],
input[type="email"],
input[type="password"],
textarea,
select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--medium-gray);
  border-radius: 4px;
  font-size: 14px;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(246, 130, 31, 0.2);
}

.btn {
  display: inline-block;
  padding: 10px 15px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn:hover {
  background-color: var(--primary-dark);
}

.btn.secondary {
  background-color: var(--secondary-color);
}

.btn.secondary:hover {
  background-color: #333;
}

.btn.danger {
  background-color: var(--danger-color);
}

.btn.danger:hover {
  background-color: #c0392b;
}

.checkbox-group {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.checkbox-group input[type="checkbox"] {
  margin-right: 10px;
}

.file-upload {
  margin-bottom: 15px;
}

.tabs {
  display: flex;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--medium-gray);
}

.tab-btn {
  background: none;
  border: none;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: var(--dark-gray);
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: var(--primary-color);
  border-bottom: 2px solid var(--primary-color);
}

.tab-content {
  display: none;
  padding: 20px 0;
}

.tab-content.active {
  display: block;
}

.message {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
}

.message.error {
  background-color: rgba(231, 76, 60, 0.1);
  color: var(--danger-color);
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.message.success {
  background-color: rgba(46, 204, 113, 0.1);
  color: var(--success-color);
  border: 1px solid rgba(46, 204, 113, 0.3);
}

.message.warning {
  background-color: rgba(243, 156, 18, 0.1);
  color: var(--warning-color);
  border: 1px solid rgba(243, 156, 18, 0.3);
}

.message.info {
  background-color: rgba(52, 152, 219, 0.1);
  color: var(--info-color);
  border: 1px solid rgba(52, 152, 219, 0.3);
}

.credentials-section {
  background-color: var(--light-gray);
  padding: 20px;
  border-radius: 4px;
  margin-bottom: 30px;
}

#certificates-list,
#hostname-associations-list,
#forwarding-settings-list {
  margin-top: 20px;
  margin-bottom: 20px;
}

.cert-item,
.setting-item {
  background-color: white;
  border: 1px solid var(--medium-gray);
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 15px;
}

.cert-item h3,
.setting-item h3 {
  color: var(--primary-color);
  margin-bottom: 10px;
}

.cert-item .cert-details,
.setting-item .setting-details {
  font-size: 14px;
  color: var(--dark-gray);
}

.cert-item .cert-date {
  font-size: 12px;
  color: var(--dark-gray);
  margin-top: 10px;
}

.hostname-selector,
.forwarding-selector {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.hostname-selector .form-group,
.forwarding-selector .form-group {
  flex: 1;
  margin-right: 15px;
}

.hostname-selector .form-group:last-child,
.forwarding-selector .form-group:last-child {
  margin-right: 0;
}

.hostname-form,
.hostname-forwarding-form {
  background-color: var(--light-gray);
  padding: 20px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.hostname-list {
  margin-top: 30px;
}

.hostname-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: white;
  border: 1px solid var(--medium-gray);
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 10px;
}

.hostname-item .hostname-details {
  flex: 1;
}

.hostname-item .hostname-actions {
  display: flex;
  align-items: center;
}

.hostname-item .hostname-actions button {
  margin-left: 10px;
}

.forwarding-info {
  margin-bottom: 20px;
}

.forwarding-toggle {
  margin-top: 20px;
}

.hostname-forwarding-form .form-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.forwarding-enabled {
  color: var(--success-color);
  font-weight: bold;
}

.forwarding-disabled {
  color: var(--danger-color);
  font-weight: bold;
}

@media (max-width: 768px) {
  .container {
    padding: 10px;
  }
  
  .tabs {
    flex-direction: column;
    border-bottom: none;
  }
  
  .tab-btn {
    width: 100%;
    text-align: left;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--medium-gray);
  }
  
  .tab-btn.active {
    border-left: 2px solid var(--primary-color);
    border-bottom: 1px solid var(--medium-gray);
  }
  
  .hostname-selector,
  .forwarding-selector {
    flex-direction: column;
  }
  
  .hostname-selector .form-group,
  .forwarding-selector .form-group {
    margin-right: 0;
    margin-bottom: 15px;
  }
  
  .hostname-item {
    flex-direction: column;
  }
  
  .hostname-item .hostname-actions {
    margin-top: 10px;
    justify-content: flex-end;
  }
}`;
}

/**
 * Return the JavaScript for the UI
 */
function getScript() {
  return `
document.addEventListener('DOMContentLoaded', function() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Load saved credentials
  loadCredentials();
  
  // Save credentials
  document.getElementById('save-credentials').addEventListener('click', saveCredentials);
  
  // File upload handling
  document.getElementById('cert-file').addEventListener('change', handleFileUpload);
  
  // Certificate upload
  document.getElementById('upload-cert').addEventListener('click', uploadCertificate);
  
  // Refresh certificate list
  document.getElementById('refresh-certs').addEventListener('click', listCertificates);
  
  // Load zones for hostname associations
  document.getElementById('load-zones').addEventListener('click', loadZones);
  
  // Load certificates for hostname associations
  document.getElementById('load-certs-for-hostnames').addEventListener('click', loadCertificatesForHostnames);
  
  // Add hostname association
  document.getElementById('add-hostname').addEventListener('click', addHostnameAssociation);
  
  // Refresh hostname associations
  document.getElementById('refresh-hostnames').addEventListener('click', refreshHostnameAssociations);
  
  // Load zones for certificate forwarding
  document.getElementById('load-forwarding-zones').addEventListener('click', function() {
    loadZonesForSelect('forwarding-zone-select');
  });
  
  // Check certificate forwarding settings
  document.getElementById('check-forwarding').addEventListener('click', checkCertificateForwarding);
  
  // Enable certificate forwarding
  document.getElementById('enable-forwarding').addEventListener('click', function() {
    updateCertificateForwarding(true);
  });
  
  // Disable certificate forwarding
  document.getElementById('disable-forwarding').addEventListener('click', function() {
    updateCertificateForwarding(false);
  });
});

// Load credentials from localStorage
function loadCredentials() {
  if (localStorage.getItem('cf_credentials')) {
    try {
      const credentials = JSON.parse(localStorage.getItem('cf_credentials'));
      document.getElementById('email').value = credentials.email || '';
      document.getElementById('api-key').value = credentials.apiKey || '';
      document.getElementById('account-id').value = credentials.accountId || '';
      
      showMessage('credentials-message', 'Loaded saved credentials from browser storage.', 'info');
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  }
}

// Save credentials to localStorage
function saveCredentials() {
  const email = document.getElementById('email').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const accountId = document.getElementById('account-id').value.trim();
  const rememberCredentials = document.getElementById('remember-credentials').checked;
  
  if (!email || !apiKey || !accountId) {
    showMessage('credentials-message', 'Please fill in all credential fields.', 'error');
    return;
  }
  
  // Store credentials in memory for current session
  window.cfCredentials = {
    email,
    apiKey,
    accountId
  };
  
  // Optionally save to localStorage
  if (rememberCredentials) {
    try {
      localStorage.setItem('cf_credentials', JSON.stringify(window.cfCredentials));
      showMessage('credentials-message', 'Credentials saved successfully.', 'success');
    } catch (error) {
      showMessage('credentials-message', 'Failed to save credentials: ' + error.message, 'error');
    }
  } else {
    localStorage.removeItem('cf_credentials');
    showMessage('credentials-message', 'Credentials saved for this session only.', 'info');
  }
}

// Handle certificate file upload
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('cert-content').value = e.target.result;
  };
  reader.onerror = function() {
    showMessage('upload-message', 'Error reading file.', 'error');
  };
  reader.readAsText(file);
}

// Upload certificate
function uploadCertificate() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get certificate details
  const name = document.getElementById('cert-name').value.trim();
  const certificates = document.getElementById('cert-content').value.trim();
  const isCA = document.getElementById('is-ca').checked;
  
  if (!name) {
    showMessage('upload-message', 'Please provide a certificate name.', 'error');
    return;
  }
  
  if (!certificates) {
    showMessage('upload-message', 'Please provide certificate content.', 'error');
    return;
  }
  
  // Show loading message
  showMessage('upload-message', 'Uploading certificate...', 'info');
  
  // Upload certificate
  fetch('/api/certificates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    },
    body: JSON.stringify({
      name,
      certificates,
      ca: isCA,
      accountId: credentials.accountId
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      showMessage('upload-message', 'Certificate uploaded successfully!', 'success');
      // Reset form
      document.getElementById('cert-name').value = '';
      document.getElementById('cert-content').value = '';
      
      // Reload certificates list in the hostname associations tab
      loadCertificatesForHostnames();
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to upload certificate.';
      showMessage('upload-message', errorMsg, 'error');
    }
  })
  .catch(error => {
    showMessage('upload-message', 'Error: ' + error.message, 'error');
  });
}

// List certificates
function listCertificates() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Show loading message
  showMessage('list-message', 'Loading certificates...', 'info');
  
  // Fetch certificates
  fetch('/api/certificates?accountId=' + encodeURIComponent(credentials.accountId), {
    method: 'GET',
    headers: {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => response.json())
  .then(data => {
    const listElement = document.getElementById('certificates-list');
    
    if (data.success && data.result) {
      if (data.result.length === 0) {
        showMessage('list-message', 'No certificates found.', 'info');
        listElement.innerHTML = '';
        return;
      }
      
      // Clear message
      document.getElementById('list-message').innerHTML = '';
      
      // Update list
      listElement.innerHTML = '';
      data.result.forEach(cert => {
        const certElement = document.createElement('div');
        certElement.className = 'cert-item';
        
        const expiresDate = cert.expires_on 
          ? new Date(cert.expires_on).toLocaleDateString() 
          : 'N/A';
        
        certElement.innerHTML = \`
          <h3>\${cert.name}</h3>
          <div class="cert-details">
            <p><strong>ID:</strong> \${cert.id}</p>
            <p><strong>Type:</strong> \${cert.ca ? 'CA Certificate' : 'Client Certificate'}</p>
            <p><strong>Expires:</strong> \${expiresDate}</p>
          </div>
          <div class="cert-date">
            <p>Created: \${new Date(cert.uploaded_on).toLocaleString()}</p>
          </div>
        \`;
        
        listElement.appendChild(certElement);
      });
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to load certificates.';
      showMessage('list-message', errorMsg, 'error');
      listElement.innerHTML = '';
    }
  })
  .catch(error => {
    showMessage('list-message', 'Error: ' + error.message, 'error');
  });
}

// Load zones for a specific select element
function loadZonesForSelect(selectId) {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Show loading message
  const messageId = selectId === 'zone-select' ? 'hostname-message' : 'forwarding-message';
  showMessage(messageId, 'Loading zones...', 'info');
  
  // Log the API call we're about to make for debugging
  console.log('Fetching zones from /api/zones with headers:', {
    'X-Auth-Email': credentials.email ? 'Present' : 'Missing',
    'X-Auth-Key': credentials.apiKey ? 'Present' : 'Missing'
  });
  
  // Fetch zones
  fetch('/api/zones', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => {
    console.log('Zones API response status:', response.status);
    return response.json();
  })
  .then(data => {
    console.log('Zones API response data:', data);
    
    if (data.success && data.result) {
      // Update zones dropdown
      const zoneSelect = document.getElementById(selectId);
      zoneSelect.innerHTML = '<option value="">-- Select a zone --</option>';
      
      data.result.forEach(zone => {
        const option = document.createElement('option');
        option.value = zone.id;
        option.textContent = zone.name;
        zoneSelect.appendChild(option);
      });
      
      showMessage(messageId, 'Zones loaded successfully.', 'success');
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to load zones.';
      showMessage(messageId, errorMsg, 'error');
    }
  })
  .catch(error => {
    console.error('Error loading zones:', error);
    showMessage(messageId, 'Error: ' + error.message, 'error');
  });
}

// Load zones for hostname associations
function loadZones() {
  loadZonesForSelect('zone-select');
}

// Load certificates for hostname associations
function loadCertificatesForHostnames() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Show loading message
  showMessage('hostname-message', 'Loading certificates...', 'info');
  
  // Fetch certificates
  fetch('/api/certificates?accountId=' + encodeURIComponent(credentials.accountId), {
    method: 'GET',
    headers: {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success && data.result) {
      // Filter CA certificates only
      const caCertificates = data.result.filter(cert => cert.ca);
      
      // Update certificates dropdown for viewing
      const certSelect = document.getElementById('cert-select');
      certSelect.innerHTML = '<option value="">-- All Certificates --</option>';
      
      caCertificates.forEach(cert => {
        const option = document.createElement('option');
        option.value = cert.id;
        option.textContent = cert.name;
        certSelect.appendChild(option);
      });
      
      // Update certificates dropdown for adding
      const addCertSelect = document.getElementById('add-cert-select');
      addCertSelect.innerHTML = '<option value="">-- Select a certificate --</option>';
      
      caCertificates.forEach(cert => {
        const option = document.createElement('option');
        option.value = cert.id;
        option.textContent = cert.name;
        addCertSelect.appendChild(option);
      });
      
      showMessage('hostname-message', 'Certificates loaded successfully.', 'success');
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to load certificates.';
      showMessage('hostname-message', errorMsg, 'error');
    }
  })
  .catch(error => {
    showMessage('hostname-message', 'Error: ' + error.message, 'error');
  });
}

// Add hostname association
function addHostnameAssociation() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get selected zone and certificate
  const zoneId = document.getElementById('zone-select').value;
  const certId = document.getElementById('add-cert-select').value;
  const singleHostname = document.getElementById('hostname-input').value.trim();
  const multipleHostnames = document.getElementById('hostnames-input').value.trim();
  
  if (!zoneId) {
    showMessage('hostname-message', 'Please select a zone.', 'error');
    return;
  }
  
  if (!certId) {
    showMessage('hostname-message', 'Please select a certificate for the association.', 'error');
    return;
  }
  
  // Determine which hostnames to use (single or multiple)
  let payload;
  if (multipleHostnames) {
    // Parse multiple hostnames from textarea (split by newlines and filter empty lines)
    const hostnames = multipleHostnames.split(/[\\r\\n]+/).map(h => h.trim()).filter(h => h.length > 0);
      
    if (hostnames.length === 0) {
      showMessage('hostname-message', 'Please enter at least one valid hostname.', 'error');
      return;
    }
    
    payload = {
      zoneId,
      hostnames,
      accountId: credentials.accountId
    };
    
    console.log(\`Adding multiple hostname associations (\${hostnames.length} hostnames) for certificate: \${certId} in zone: \${zoneId}\`);
  } else if (singleHostname) {
    // Check if user tried to input multiple hostnames with commas
    if (singleHostname.includes(',')) {
      // Extract hostnames from comma-separated list
      const hostnames = singleHostname.split(',').map(h => h.trim()).filter(h => h.length > 0);
      
      if (hostnames.length > 1) {
        payload = {
          zoneId,
          hostnames,
          accountId: credentials.accountId
        };
        
        console.log(\`Adding multiple hostname associations (\${hostnames.length} hostnames from comma list) for certificate: \${certId} in zone: \${zoneId}\`);
      } else {
        // Just a single hostname that happens to contain a comma
        payload = {
          zoneId,
          hostnames: [singleHostname],
          accountId: credentials.accountId
        };
        
        console.log(\`Adding hostname association: \${singleHostname} for certificate: \${certId} in zone: \${zoneId}\`);
      }
    } else {
      // Use single hostname from input field
      payload = {
        zoneId,
        hostnames: [singleHostname],
        accountId: credentials.accountId
      };
      
      console.log(\`Adding hostname association: \${singleHostname} for certificate: \${certId} in zone: \${zoneId}\`);
    }
  } else {
    showMessage('hostname-message', 'Please enter at least one hostname.', 'error');
    return;
  }
  
  // Show loading message
  showMessage('hostname-message', 'Adding hostname association(s)...', 'info');
  
  // Add hostname association
  fetch(\`/api/certificates/\${certId}/hostnames\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
    console.log('Hostname association response status:', response.status);
    return response.json().catch(error => {
      console.error('Error parsing JSON response:', error);
      return { 
        success: false, 
        errors: [{ message: 'Invalid JSON response from server' }],
        status: response.status
      };
    });
  })
  .then(data => {
    console.log('Hostname association response data:', data);
    
    if (data.success) {
      // Clear both input fields
      document.getElementById('hostname-input').value = '';
      document.getElementById('hostnames-input').value = '';
      
      // Show success message with singular or plural text based on whether multiple hostnames were added
      const hostnamesCount = payload.hostnames ? payload.hostnames.length : 1;
      const successMessage = hostnamesCount === 1 
        ? 'Hostname association added successfully!' 
        : \`\${hostnamesCount} hostname associations added successfully!\`;
        
      showMessage('hostname-message', successMessage, 'success');
      
      // Refresh the list of associations
      refreshHostnameAssociations();
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to add hostname association(s).';
      showMessage('hostname-message', errorMsg, 'error');
    }
  })
  .catch(error => {
    console.error('Error adding hostname association:', error);
    showMessage('hostname-message', 'Error: ' + error.message, 'error');
  });
}

// Refresh hostname associations
function refreshHostnameAssociations() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get selected zone and certificate
  const zoneId = document.getElementById('zone-select').value;
  const certId = document.getElementById('cert-select').value; // This is optional
  
  if (!zoneId) {
    showMessage('hostname-message', 'Please select a zone.', 'error');
    return;
  }
  
  // Show loading message
  showMessage('hostname-message', 'Loading hostname associations...', 'info');
  
  // Construct the URL
  let apiUrl = \`/api/zones/\${zoneId}/hostname_associations\`;
  if (certId) {
    apiUrl += \`?certId=\${encodeURIComponent(certId)}\`;
  }
  
  console.log(\`Fetching hostname associations from: \${apiUrl}\`);
  
  // Fetch hostname associations
  fetch(apiUrl, {
    method: 'GET',
    headers: {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => {
    console.log("Response status:", response.status);
    return response.json();
  })
  .then(data => {
    console.log("Response data:", data);
    const listElement = document.getElementById('hostname-associations-list');
    
    if (data.success && data.result) {
      if (data.result.length === 0) {
        showMessage('hostname-message', 'No hostname associations found.', 'info');
        listElement.innerHTML = '<p>No hostname associations found for the selected zone.</p>';
        return;
      }
      
      // Clear message
      document.getElementById('hostname-message').innerHTML = '';
      
      // Load certificates to get their names
      fetch('/api/certificates?accountId=' + encodeURIComponent(credentials.accountId), {
        method: 'GET',
        headers: {
          'X-Auth-Email': credentials.email,
          'X-Auth-Key': credentials.apiKey
        }
      })
      .then(response => response.json())
      .then(certData => {
        // Create a map of certificate IDs to names
        const certMap = {};
        if (certData.success && certData.result) {
          certData.result.forEach(cert => {
            certMap[cert.id] = cert.name;
          });
        }
        
        // Update list
        listElement.innerHTML = '';
        data.result.forEach(association => {
          const item = document.createElement('div');
          item.className = 'hostname-item';
          
          // Use mtls_certificate_id instead of ca_id
          const certId = association.mtls_certificate_id || "default_cert_id";
          const certName = certMap[certId] || 'Default Certificate';
          
          item.innerHTML = \`
            <div class="hostname-details">
              <p><strong>Hostname:</strong> \${association.hostname}</p>
              <p><strong>Certificate:</strong> \${certName} (\${certId})</p>
              <p><strong>Status:</strong> \${association.status || 'Active'}</p>
            </div>
            <div class="hostname-actions">
              <button class="btn danger delete-hostname" data-hostname="\${association.hostname}" data-cert-id="\${certId}">Delete</button>
            </div>
          \`;
          
          listElement.appendChild(item);
        });
        
        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-hostname').forEach(button => {
          button.addEventListener('click', function() {
            const hostname = this.getAttribute('data-hostname');
            const certId = this.getAttribute('data-cert-id');
            deleteHostnameAssociation(certId, hostname);
          });
        });
      })
      .catch(error => {
        console.error("Error loading certificate names:", error);
        showMessage('hostname-message', 'Error loading certificate names: ' + error.message, 'error');
      });
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to load hostname associations.';
      showMessage('hostname-message', errorMsg, 'error');
      listElement.innerHTML = '';
    }
  })
  .catch(error => {
    console.error("Error fetching hostname associations:", error);
    showMessage('hostname-message', 'Error: ' + error.message, 'error');
  });
}

// Delete hostname association
function deleteHostnameAssociation(certId, hostname) {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get selected zone
  const zoneId = document.getElementById('zone-select').value;
  
  if (!zoneId) {
    showMessage('hostname-message', 'Please select a zone.', 'error');
    return;
  }
  
  // Confirm deletion
  if (!confirm(\`Are you sure you want to delete the hostname association for "\${hostname}"?\`)) {
    return;
  }
  
  // Show loading message
  showMessage('hostname-message', 'Deleting hostname association...', 'info');
  
  console.log(\`Deleting hostname association: \${hostname} for certificate: \${certId} in zone: \${zoneId}\`);
  
  // Delete hostname association
  fetch(\`/api/certificates/\${certId}/hostnames?zoneId=\${encodeURIComponent(zoneId)}&hostname=\${encodeURIComponent(hostname)}\`, {
    method: 'DELETE',
    headers: {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      showMessage('hostname-message', 'Hostname association deleted successfully!', 'success');
      refreshHostnameAssociations();
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to delete hostname association.';
      showMessage('hostname-message', errorMsg, 'error');
    }
  })
  .catch(error => {
    console.error('Error deleting hostname association:', error);
    showMessage('hostname-message', 'Error: ' + error.message, 'error');
  });
}

// Check certificate forwarding settings
function checkCertificateForwarding() {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get selected zone
  const zoneId = document.getElementById('forwarding-zone-select').value;
  
  if (!zoneId) {
    showMessage('forwarding-message', 'Please select a zone.', 'error');
    return;
  }
  
  // Show loading message
  showMessage('forwarding-message', 'Checking certificate forwarding settings...', 'info');
  
  // Show the forwarding toggle section
  document.querySelector('.forwarding-toggle').style.display = 'block';
  
  // Check certificate forwarding settings
  fetch(\`/api/zones/\${zoneId}/certificate_forwarding\`, {
    method: 'GET',
    headers: {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    }
  })
  .then(response => response.json())
  .then(data => {
    console.log('Certificate forwarding response:', data);
    
    if (data.success) {
      // Display the settings
      const settingsListElement = document.getElementById('forwarding-settings-list');
      settingsListElement.innerHTML = '';
      
      if (data.result && data.result.length > 0) {
        data.result.forEach(setting => {
          const item = document.createElement('div');
          item.className = 'setting-item';
          
          item.innerHTML = \`
            <div class="setting-details">
              <p><strong>Hostname:</strong> \${setting.hostname}</p>
              <p><strong>Certificate Forwarding:</strong> <span class="\${setting.client_certificate_forwarding ? 'forwarding-enabled' : 'forwarding-disabled'}">\${setting.client_certificate_forwarding ? 'Enabled' : 'Disabled'}</span></p>
              <p><strong>China Network:</strong> \${setting.china_network ? 'Enabled' : 'Disabled'}</p>
            </div>
            <div class="setting-actions">
              <button class="btn \${setting.client_certificate_forwarding ? 'danger' : 'primary'} toggle-forwarding" 
                data-hostname="\${setting.hostname}" 
                data-enabled="\${setting.client_certificate_forwarding ? 'true' : 'false'}">
                \${setting.client_certificate_forwarding ? 'Disable Forwarding' : 'Enable Forwarding'}
              </button>
            </div>
          \`;
          
          settingsListElement.appendChild(item);
        });
        
        // Add event listeners for toggle buttons
        document.querySelectorAll('.toggle-forwarding').forEach(button => {
          button.addEventListener('click', function() {
            const hostname = this.getAttribute('data-hostname');
            const isEnabled = this.getAttribute('data-enabled') === 'true';
            document.getElementById('forwarding-hostname-input').value = hostname;
            updateCertificateForwarding(!isEnabled);
          });
        });
        
        showMessage('forwarding-message', 'Certificate forwarding settings retrieved successfully.', 'success');
      } else {
        settingsListElement.innerHTML = '<p>No hostname settings found for this zone.</p>';
        showMessage('forwarding-message', 'No hostname settings found.', 'info');
      }
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : 'Failed to check certificate forwarding settings.';
      showMessage('forwarding-message', errorMsg, 'error');
      
      // Clear settings list on error
      document.getElementById('forwarding-settings-list').innerHTML = '';
    }
  })
  .catch(error => {
    console.error('Error checking certificate forwarding:', error);
    showMessage('forwarding-message', 'Error: ' + error.message, 'error');
  });
}

// Update certificate forwarding
function updateCertificateForwarding(enabled) {
  // Get credentials
  const credentials = getCredentials();
  if (!credentials) return;
  
  // Get selected zone and hostname
  const zoneId = document.getElementById('forwarding-zone-select').value;
  const hostname = document.getElementById('forwarding-hostname-input').value.trim();
  
  if (!zoneId) {
    showMessage('forwarding-message', 'Please select a zone.', 'error');
    return;
  }
  
  if (!hostname) {
    showMessage('forwarding-message', 'Please enter a hostname.', 'error');
    return;
  }
  
  // Show loading message
  showMessage('forwarding-message', \`\${enabled ? 'Enabling' : 'Disabling'} certificate forwarding for \${hostname}...\`, 'info');
  
  // Update certificate forwarding
  fetch(\`/api/zones/\${zoneId}/certificate_forwarding\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey
    },
    body: JSON.stringify({
      hostname: hostname,
      enabled: enabled
    })
  })
  .then(response => response.json())
  .then(data => {
    console.log('Certificate forwarding update response:', data);
    
    if (data.success) {
      showMessage('forwarding-message', \`Certificate forwarding successfully \${enabled ? 'enabled' : 'disabled'} for \${hostname}.\`, 'success');
      
      // Refresh the forwarding settings list
      checkCertificateForwarding();
    } else {
      const errorMsg = data.errors && data.errors.length > 0 
        ? data.errors[0].message 
        : \`Failed to \${enabled ? 'enable' : 'disable'} certificate forwarding.\`;
      showMessage('forwarding-message', errorMsg, 'error');
    }
  })
  .catch(error => {
    console.error('Error updating certificate forwarding:', error);
    showMessage('forwarding-message', 'Error: ' + error.message, 'error');
  });
}

// Get credentials
function getCredentials() {
  // Try to get from memory first
  if (window.cfCredentials) {
    return window.cfCredentials;
  }
  
  // Otherwise, get from form
  const email = document.getElementById('email').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const accountId = document.getElementById('account-id').value.trim();
  
  if (!email || !apiKey || !accountId) {
    showMessage('credentials-message', 'Please fill in and save your Cloudflare credentials.', 'error');
    // Switch to credentials tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    return null;
  }
  
  return { email, apiKey, accountId };
}

// Show message
function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.className = 'message';
  
  if (type) {
    element.classList.add(type);
  }
  
  // Clear success and info messages after a delay
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      element.textContent = '';
      element.className = 'message';
    }, 5000);
  }
}
`;
}

// Event listeners for Cloudflare Workers
export default {
  // Handle HTTP requests
  fetch: handleRequest,
};
