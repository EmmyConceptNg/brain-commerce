import express from "express";
import shopify from "../../shopify.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { webhooks } = req.body;
    const session = res.locals.shopify.session;

    if (!session) {
      return res.status(401).json({ error: "Unauthorized - Missing Session" });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const results = [];

    for (const webhook of webhooks) {
      const mutation = `
        mutation CreateWebhookSubscription($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              endpoint {
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      try {
        const response = await client.query({
          data: {
            query: mutation,
            variables: {
              topic: webhook.topic,
              webhookSubscription: {
                callbackUrl: webhook.callbackUrl,
                format: "JSON",
              },
            },
          },
        });

        results.push({
          topic: webhook.topic,
          success:
            !response.body.data.webhookSubscriptionCreate.userErrors.length,
          errors: response.body.data.webhookSubscriptionCreate.userErrors,
        });
      } catch (error) {
        results.push({
          topic: webhook.topic,
          success: false,
          error: error.message,
        });
      }
    }

    const success = results.every((result) => result.success);
    res.json({ success, results });
  } catch (error) {
    console.error("Error activating webhooks:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
