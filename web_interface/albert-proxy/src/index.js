/**
 * CORS reverse proxy for Albert API.
 *
 * GitHub Pages cannot use the Vite `/albert-api` proxy, and
 * https://albert.api.etalab.gouv.fr does not send Access-Control-Allow-Origin
 * for browser calls from xiaoouwang.github.io. This Worker forwards
 * Authorization + body to Albert and returns CORS headers for allowed origins.
 *
 * The user's Albert API key stays in the browser; this Worker does not store keys.
 */

const ALBERT_ORIGIN = "https://albert.api.etalab.gouv.fr";

/** Origins allowed to call this proxy from a browser. */
const ALLOWED_ORIGINS = new Set([
  "https://xiaoouwang.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

const ALLOWED_METHODS = "GET, HEAD, POST, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, Accept";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function pickOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }
  return null;
}

function jsonError(status, message, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...(origin ? corsHeaders(origin) : {}),
  };
  return new Response(JSON.stringify({ error: { message } }), { status, headers });
}

function handleOptions(request, origin) {
  if (!origin) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

async function proxyToAlbert(request, origin) {
  const url = new URL(request.url);

  // Only /v1/... — never open-proxy arbitrary hosts.
  if (!url.pathname.startsWith("/v1/")) {
    return jsonError(404, "Not found. Use /v1/… paths (Albert OpenAI-compatible API).", origin);
  }

  const upstream = new URL(url.pathname + url.search, ALBERT_ORIGIN);

  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  if (authorization) {
    headers.set("Authorization", authorization);
  }
  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const accept = request.headers.get("Accept");
  if (accept) {
    headers.set("Accept", accept);
  }
  headers.set("Origin", ALBERT_ORIGIN);

  const init = {
    method: request.method,
    headers,
    redirect: "follow",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // Required when streaming a body from an incoming request in Workers.
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(upstream, init);
  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });

  // Strip hop-by-hop / conflicting headers, then set CORS for the SPA.
  response.headers.delete("access-control-allow-origin");
  response.headers.delete("access-control-allow-credentials");
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value);
  }

  return response;
}

export default {
  async fetch(request) {
    const origin = pickOrigin(request);

    if (request.method === "OPTIONS") {
      return handleOptions(request, origin);
    }

    if (!origin) {
      // Non-browser probes (curl, health) without Origin still get a clear error.
      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "/health") {
        return Response.json({
          ok: true,
          service: "incognito-albert-proxy",
          albert: ALBERT_ORIGIN,
          allowedOrigins: [...ALLOWED_ORIGINS],
        });
      }
      return jsonError(
        403,
        "Origin not allowed. This proxy only serves the Incognito GitHub Pages app.",
        null,
      );
    }

    if (!["GET", "HEAD", "POST"].includes(request.method)) {
      return jsonError(405, `Method ${request.method} not allowed.`, origin);
    }

    try {
      return await proxyToAlbert(request, origin);
    } catch (error) {
      console.error("albert-proxy error", error);
      return jsonError(502, "Upstream Albert request failed.", origin);
    }
  },
};
