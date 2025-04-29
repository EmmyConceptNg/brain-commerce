// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import { fileURLToPath } from "url";
import { dirname } from "path";
import http from 'http';

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

import validateRoutes from "./backend/routes/validateRoutes.js";
import cors from 'cors'
import shopifyRoutes from "./backend/routes/shopifyRoutes.js";
import adminRoutes from "./backend/routes/admin.js";
import webhookRoutes from "./backend/routes/activateWebhooks.js";

// Add these lines after imports to define __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();
const server = http.createServer(app);

// Update CORS configuration to allow WebSocket
app.use(cors({
  origin: '*',
  methods: 'GET, POST, PUT, DELETE, OPTIONS',
  allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  credentials: true
}));

// Remove WebSocket related code and add SSE endpoint
app.get('/api/v1/sync-progress', shopify.validateAuthenticatedSession(), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connection', status: 'connected' })}\n\n`);

  // Store the response object to send updates
  const client = res;

  // Add this client to a Set of connected clients
  const clientId = Date.now();
  app.locals.sseClients = app.locals.sseClients || new Set();
  app.locals.sseClients.add({ id: clientId, client });

  // Remove client on connection close
  req.on('close', () => {
    app.locals.sseClients.delete({ id: clientId, client });
  });
});

// Add a function to broadcast progress updates
app.locals.sendProgressUpdate = (type, synced, total) => {
  const data = JSON.stringify({ type, synced, total });
  app.locals.sseClients?.forEach(({ client }) => {
    client.write(`data: ${data}\n\n`);
  });
};

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  (_req, res, next) => {
    console.log("Callback Session:", res.locals.shopify);
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use(
  "/api/*",
  async (req, res, next) => {
    try {
      const sessionId = await shopify.api.session.getCurrentId({
        isOnline: shopify.config.useOnlineTokens,
        rawRequest: req,
        rawResponse: res,
      });

      if (!sessionId) {
        const shop = req.query.shop;
        if (shop) {
          // Redirect to OAuth to create a session
          return res.redirect(`/api/auth?shop=${encodeURIComponent(shop)}`);
        }
        return res.status(401).send({ error: "Unauthorized - Missing Session" });
      }

      const session = await shopify.config.sessionStorage.loadSession(sessionId);
      if (!session) {
        const shop = req.query.shop;
        if (shop) {
          return res.status(401).json({ authUrl: `/api/auth?shop=${encodeURIComponent(shop)}` });
        }
        return res.status(401).send({ error: "Unauthorized - Invalid Session" });
      }
    } catch (e) {
      console.error("Error retrieving session:", e);
      return res.status(500).send({ error: "Internal Server Error" });
    }
    next();
  },
  shopify.validateAuthenticatedSession()
);

app.use(express.json());

app.use("/uploads", express.static(join(__dirname, "uploads")));

app.use(
  "/api/v1/validate-api-key",
  shopify.validateAuthenticatedSession(),
  validateRoutes
);

app.use(
  "/api/v1/shopify-sync",
  shopify.validateAuthenticatedSession(),
  shopifyRoutes
);

app.use("/api/v1/admin", shopify.validateAuthenticatedSession(), adminRoutes);
app.use(
  "/api/v1/activate-webhooks",
  shopify.validateAuthenticatedSession(),
  webhookRoutes
);

app.get("/debug", (req, res) => {
  console.log("Shopify Session:", res.locals.shopify);
  res.json(res.locals.shopify);
});

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});




app.use(serveStatic(STATIC_PATH, { index: false }));
app.use(shopify.cspHeaders());


app.use(
  "/*",
  async (req, res, next) => {
    // Extract shop and host from query parameters
    const shop = req.query.shop;
    const host = req.query.host;

    // Log query parameters for debugging
    console.log("Request query params:", req.query);

    if (!shop) {
      return res.status(400).send("Missing shop parameter");
    }

    // --- SESSION CHECK AND REDIRECT ---
    try {
      const sessionId = await shopify.api.session.getCurrentId({
        isOnline: shopify.config.useOnlineTokens,
        rawRequest: req,
        rawResponse: res,
      });

      let session = null;
      if (sessionId) {
        session = await shopify.config.sessionStorage.loadSession(sessionId);
      }

      if (!session) {
        // Prevent infinite redirect loop
        if (req.query.authUrl) {
          // Already redirected once, just render the page and let frontend handle it
          return next();
        }

        // Redirect to OAuth to create a session
        const authUrl = `/api/auth?shop=${encodeURIComponent(shop)}`;
        return res.redirect(authUrl);
      }
    } catch (e) {
      console.error("Error retrieving session:", e);
      return res.status(500).send({ error: "Internal Server Error" });
    }
    // --- END SESSION CHECK ---

    next();
  },
  shopify.ensureInstalledOnShop(),
  async (req, res) => {
    const apiKey = process.env.SHOPIFY_API_KEY ?? "";

    // Use req.query.shop instead of res.locals.shopify.session.shop
    const shop = req.query.shop;

    console.log("Serving HTML for shop:", shop);
    return res
      .status(200)
      .set("Content-Type", "text/html")
      .send(
        readFileSync(join(STATIC_PATH, "index.html"))
          .toString()
          .replace("%VITE_SHOPIFY_API_KEY%", apiKey)
      );
  }
);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
