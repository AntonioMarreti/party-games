export default {
  async fetch(request, env) {
    const targetUrl = env.TARGET_URL;
    const webhookSecret = env.WEBHOOK_SECRET;
    const botToken = env.BOT_TOKEN;

    if (!targetUrl || !webhookSecret || !botToken) {
      return new Response("Missing Worker secrets", { status: 500 });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, "");

    if (path === webhookSecret) {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const body = await request.arrayBuffer();
      const headers = new Headers(request.headers);
      headers.set("Host", new URL(targetUrl).hostname);

      return fetch(targetUrl, {
        method: "POST",
        headers,
        body
      });
    }

    if (url.pathname.startsWith("/bot")) {
      url.hostname = "api.telegram.org";
      const upstreamPath = url.pathname.replace("/bot" + botToken, "");
      url.pathname = "/bot" + botToken + upstreamPath;

      const proxiedRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
        redirect: "follow"
      });

      return fetch(proxiedRequest);
    }

    return new Response("Not Found", { status: 404 });
  }
};
