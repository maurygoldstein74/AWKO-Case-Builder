export default async (request: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-key-index",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "GET") {
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      if (Deno.env.get(`ANTHROPIC_KEY_${i}`)) count++;
    }
    if (count === 0 && Deno.env.get("ANTHROPIC_API_KEY")) count = 1;
    return new Response(JSON.stringify({ keys: count }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keyIndex = parseInt(request.headers.get("x-key-index") || "1", 10);
  const apiKey =
    Deno.env.get(`ANTHROPIC_KEY_${keyIndex}`) ||
    Deno.env.get("ANTHROPIC_KEY_1") ||
    Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "No API key configured. Set ANTHROPIC_KEY_1 in Netlify env vars." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let isStreaming = false;
  try {
    isStreaming = JSON.parse(body).stream === true;
  } catch {}

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const outHeaders = new Headers(corsHeaders);
    outHeaders.set("x-key-used", keyIndex.toString());
    const retryAfter = resp.headers.get("retry-after");
    if (retryAfter) outHeaders.set("retry-after", retryAfter);

    if (isStreaming && resp.ok && resp.body) {
      outHeaders.set("Content-Type", "text/event-stream");
      outHeaders.set("Cache-Control", "no-cache");
      return new Response(resp.body, { status: resp.status, headers: outHeaders });
    } else {
      outHeaders.set("Content-Type", "application/json");
      return new Response(await resp.text(), { status: resp.status, headers: outHeaders });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${err.message}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
