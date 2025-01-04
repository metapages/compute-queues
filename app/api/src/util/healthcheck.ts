const port = parseInt(Deno.env.get("PORT") || "8000");
const resp = await fetch(`http://localhost:${port}/healthz`);
Deno.exit(resp.status !== 200 ? 1 : 0);
