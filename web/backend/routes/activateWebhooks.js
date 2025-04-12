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

    // First, get existing webhooks
    const getWebhooksResponse = await client.query({
      data: `query {
    webhookSubscriptions(first: 2) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
            ... on WebhookEventBridgeEndpoint {
              arn
            }
            ... on WebhookPubSubEndpoint {
              pubSubProject
              pubSubTopic
            }
          }
        }
      }
    }
  }`,
    });


    const existingWebhooks =
      getWebhooksResponse.body.data.webhookSubscriptions.edges;

    console.log("Existing Webhooks:", existingWebhooks);
    const results = [];

    // Process each webhook
    for (const webhook of webhooks) {
      try {
        // Check if webhook already exists
        const existingWebhook = existingWebhooks.find(
          ({ node }) => node.topic === webhook.topic
        );

        if (existingWebhook) {
          // Update existing webhook
          const response = await client.request({
            query: `
              mutation webhookSubscriptionUpdate($id: ID!, $webhookSubscription: WebhookSubscriptionInput!) {
                webhookSubscriptionUpdate(id: $id, webhookSubscription: $webhookSubscription) {
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
              id: existingWebhook.node.id,
              webhookSubscription: {
                callbackUrl: webhook.callbackUrl,
                format: "JSON",
              },
            },
          });

          const { webhookSubscriptionUpdate } = response.body.data;

          if (webhookSubscriptionUpdate.userErrors.length > 0) {
            results.push({
              topic: webhook.topic,
              success: false,
              error: webhookSubscriptionUpdate.userErrors[0].message,
              action: "update",
            });
          } else {
            results.push({
              topic: webhook.topic,
              success: true,
              id: webhookSubscriptionUpdate.webhookSubscription.id,
              action: "update",
            });
          }
        } else {
          // Create new webhook
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
              action: "create",
            });
          } else {
            results.push({
              topic: webhook.topic,
              success: true,
              id: webhookSubscriptionCreate.webhookSubscription.id,
              action: "create",
            });
          }
        }
      } catch (error) {
        results.push({
          topic: webhook.topic,
          success: false,
          error: error.message,
          action: "error",
        });
      }
    }

    const allSuccessful = results.every((result) => result.success);

    res.json({
      success: allSuccessful,
      results,
      message: allSuccessful
        ? "All webhooks processed successfully"
        : "Some webhooks failed to process",
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
