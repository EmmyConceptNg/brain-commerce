import express from "express";
import { checkWebhooks } from "../controllers/checkWebhooksController.js";

const router = express.Router();

// ...existing routes...

router.get("/webhooks/check", checkWebhooks);

// ...existing routes...

export default router;