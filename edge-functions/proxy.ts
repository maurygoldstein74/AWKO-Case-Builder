// netlify/edge-functions/proxy.ts
// Streaming proxy for Anthropic API calls. API keys stay server-side.

export default async (request: Request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-key-index, x-site-password",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // GET = status check: how many keys are configured?
  if (request.method === "GET") {
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      if (Deno.env.get(`ANTHROPIC_KEY_${i}`)) count++;
    }
    // Also check legacy single-key env var
    if (count === 0 && Deno.env.get("ANTHROPIC_API_KEY")) count = 1;
    const needsPassword = !!Deno.env.get("SITE_PASSWORD");
    return new Response(
      JSON.stringify({ keys: count, passwordRequired: needsPassword }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional password protection
  const sitePassword = Deno.env.get("SITE_PASSWORD");
  if (sitePassword) {
    const provided = request.headers.get("x-site-password") || "";
    if (provided !== sitePassword) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Key selection: x-key-index header (1-based), defaults to 1
  const keyIndex = parseInt(request.headers.get("x-key-index") || "1", 10);
  const keyName = `ANTHROPIC_KEY_${keyIndex}`;
  const apiKey = Deno.env.get(keyName) || Deno.env.get("ANTHROPIC_KEY_1") || Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: `No API key configured. Set ${keyName} (or ANTHROPIC_KEY_1) in Netlify environment variables.`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Forward the request body to Anthropic
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Determine if this is a streaming request
  let isStreaming = false;
  try {
    const parsed = JSON.parse(body);
    isStreaming = parsed.stream === true;
  } catch {
    // non-JSON body, pass through
  }

  try {
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    // Build response headers
    const respHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "x-key-used, retry-after",
    });

    // Pass through rate limit headers
    const retryAfter = anthropicResp.headers.get("retry-after");
    if (retryAfter) respHeaders.set("retry-after", retryAfter);

    // Tag which key was used (for debugging, no sensitive data)
    respHeaders.set("x-key-used", keyIndex.toString());

    if (isStreaming && anthropicResp.ok && anthropicResp.body) {
      // Stream through: pipe Anthropic's SSE stream directly to the client
      respHeaders.set("Content-Type", "text/event-stream");
      respHeaders.set("Cache-Control", "no-cache");
      respHeaders.set("Connection", "keep-alive");

      return new Response(anthropicResp.body, {
        status: anthropicResp.status,
        headers: respHeaders,
      });
    } else {
      // Non-streaming: read full response and forward
      const respBody = await anthropicResp.text();
      respHeaders.set("Content-Type", "application/json");

      return new Response(respBody, {
        status: anthropicResp.status,
        headers: respHeaders,
      });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/anthropic" };
