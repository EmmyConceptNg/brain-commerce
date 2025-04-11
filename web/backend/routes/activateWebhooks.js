import express from "express";
import shopify from "../../shopify.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { webhooks } = req.body;
    const session = res.locals.shopify.session;

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized - Missing Session",
      });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const results = [];

    for (const webhook of webhooks) {
      try {
        const response = await client.query({
          data: {
            query: `
              mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
                webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
                  webhookSubscription {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              topic: webhook.topic,
              webhookSubscription: {
                callbackUrl: webhook.callbackUrl,
                format: "JSON",
              },
            },
          },
        });

        const { webhookSubscriptionCreate } = response.body.data;

        if (webhookSubscriptionCreate.userErrors.length > 0) {
          console.error(
            "Webhook creation errors:",
            webhookSubscriptionCreate.userErrors
          );
          results.push({
            topic: webhook.topic,
            success: false,
            error: webhookSubscriptionCreate.userErrors[0].message,
          });
        } else {
          results.push({
            topic: webhook.topic,
            success: true,
            id: webhookSubscriptionCreate.webhookSubscription.id,
          });
        }
      } catch (error) {
        console.error(`Error creating webhook ${webhook.topic}:`, error);
        results.push({
          topic: webhook.topic,
          success: false,
          error: error.message,
        });
      }
    }

    res.json({
      success: results.some((result) => result.success),
      results,
    });
  } catch (error) {
    console.error("Error in activate-webhooks:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      results: [],
    });
  }
});

export default router;
