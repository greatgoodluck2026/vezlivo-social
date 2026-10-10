export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "Vezlivo API",
      });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "Vezlivo API",
        status: "healthy",
      });
    }

    return json(
      {
        ok: false,
        error: "Route not found",
      },
      404
    );
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}