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

    // First, get and delete existing webhooks
    const getWebhooksResponse = await client.request({
      query: `
        query {
          webhookSubscriptions(first: 100) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
    });

    const existingWebhooks =
      getWebhooksResponse.body.data.webhookSubscriptions.edges;

      console.log('existingWebhooks', existingWebhooks);

    // Delete all existing webhooks
    for (const { node } of existingWebhooks) {
      const deleteWebhooks = await client.request({
        query: `
          mutation webhookSubscriptionDelete($id: ID!) {
            webhookSubscriptionDelete(id: $id) {
              deletedWebhookSubscriptionId
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          id: node.id,
        },
      });

      const { webhookSubscriptionDelete } = deleteWebhooks.body.data;
      if (webhookSubscriptionDelete.userErrors.length > 0) {
        console.error(
          `Failed to delete webhook ${node.id}: ${webhookSubscriptionDelete.userErrors[0].message}`
        );
      } else {
        console.log(`Deleted webhook ${node.id}`);
      }
    }

    // Create new webhooks
    const results = [];
    for (const webhook of webhooks) {
      try {
        const response = await client.request({
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
        });

        const { webhookSubscriptionCreate } = response.body.data;

        if (webhookSubscriptionCreate.userErrors.length > 0) {
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
        results.push({
          topic: webhook.topic,
          success: false,
          error: error.message,
        });
      }
    }

    const allSuccessful = results.every((result) => result.success);

    res.json({
      success: allSuccessful,
      results,
      message: allSuccessful
        ? "All webhooks activated successfully"
        : "Some webhooks failed to activate",
    });
  } catch (error) {
    console.error("Error in webhook activation:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      results: [],
    });
  }
});

export default router;
