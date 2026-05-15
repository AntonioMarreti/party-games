export default {
  async fetch(request, env) {
    const targetUrl = env.TARGET_URL;
    const webhookSecret = env.WEBHOOK_SECRET;
    const botToken = env.BOT_TOKEN;

    if (!targetUrl || !webhookSecret || !botToken) {
      return new Response("Missing Worker secrets", { status: 500 });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\//, "");

      // Webhook route
      if (path === webhookSecret) {
        if (request.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        const body = await request.arrayBuffer();
        const headers = new Headers(request.headers);
        headers.delete("host");
        headers.set("Host", new URL(targetUrl).hostname);

        return fetch(targetUrl, {
          method: "POST",
          headers,
          body,
          timeout: 30000
        });
      }

      // Telegram API proxy
      if (url.pathname.startsWith("/bot")) {
        url.hostname = "api.telegram.org";
        
        const headers = new Headers(request.headers);
        headers.delete("host");
        headers.set("Host", "api.telegram.org");
        headers.set("User-Agent", "TelegramBot");
        
        const body = request.method !== "GET" && request.method !== "HEAD" 
          ? await request.arrayBuffer() 
          : null;

        const proxiedRequest = new Request(url.toString(), {
          method: request.method,
          headers,
          body,
          redirect: "follow",
          cf: {
            mirage: false,
            minify: { javascript: false, css: false, html: false }
          }
        });

        return fetch(proxiedRequest);
      }

      return new Response("Not Found", { status: 404 });

    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};
