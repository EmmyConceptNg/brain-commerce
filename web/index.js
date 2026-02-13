// @ts-check
//13-02-2026
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
import userRoutes from "./backend/routes/userRoutes.js";

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

// Update CORS configuration to allow WebSocket
// app.use(cors({
//   origin: '*',
//   methods: 'GET, POST, PUT, DELETE, OPTIONS',
//   allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
//   credentials: true
// }));

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
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
      const session = await shopify.config.sessionStorage.loadSession(
        sessionId ?? ""
      );
      console.log(sessionId);
      const shop = req.query.shop || session?.shop;

      if (!shop) {
        return undefined;
      }
    } catch (e) {
      console.error(e);
    }

    next();
  },
  shopify.validateAuthenticatedSession()
);

app.use(express.json());

// Global middleware to log all incoming requests
// app.use((req, res, next) => {
//   console.log(`Incoming request: ${req.method} ${req.url}`);
//   console.log("Headers:", req.headers);
//   next();
// });



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

app.use(
  "/api/v1/user",
  userRoutes
);

app.get("/debug", (req, res) => {
  console.log("Shopify Session:", res.locals.shopify);
  res.json(res.locals.shopify);
});


// In your backend API routes
app.get('/api/v1/get-app-config', async (req, res) => {
  try {
    // Only return the client secret server-side
    res.json({
      success: true,
      clientSecret: process.env.SHOPIFY_API_SECRET // Server-side env variable
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Proxy route: forwards access token (client secret) to Brain Commerce
// Avoids CORS issues since the browser cannot call braincommerce.io directly from the embedded app
app.post('/api/v1/update-access-token', shopify.validateAuthenticatedSession(), async (req, res) => {
  try {
    const { storeID, websiteShopifyURL, accessToken } = req.body;

    if (!storeID || !websiteShopifyURL || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: storeID, websiteShopifyURL, accessToken',
      });
    }

    const response = await fetch(
      'https://braincommerce.io/api/v0/store/shopify/webhooks/shopify-update-access-token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeID, websiteShopifyURL, accessToken }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      console.log('✅ Access token forwarded to Brain Commerce successfully');
      return res.status(200).json({ success: true, data });
    } else {
      console.error('⚠️ Brain Commerce responded with error:', response.status, data);
      return res.status(response.status).json({ success: false, error: data });
    }
  } catch (error) {
    console.error('❌ Error proxying access token to Brain Commerce:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});




app.use(shopify.cspHeaders());


app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});