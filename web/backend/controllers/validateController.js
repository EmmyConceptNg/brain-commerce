import { SchemaTypeOptions } from "mongoose";
import shopify from "../../shopify.js";
import User from "../models/User.js";

export const validate = async (req, res) => {
  const { apiKey, storeId } = req.body;

  try {
    const session = res.locals.shopify.session;

    if (!session) {
      return res.status(401).json({ error: "Unauthorized - Missing Session" });
    }

    const shop = session.shop;
    const client = new shopify.api.clients.Graphql({ session });

    await User.findOneAndUpdate(
      { shop: session.shop },
      { storeId, apiKey },
      { upsert: true, new: true }
    );

    const getExistingWebhooks = `
      query {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              id
              topic
              endpoint {
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `;

    const existingWebhooks = await client.query({
      data: { query: getExistingWebhooks },
    });

    const existingWebhookMap =
      existingWebhooks.body.data.webhookSubscriptions.edges.reduce(
        (acc, edge) => {
          const { topic } = edge.node;
          // Just store the topic, we don't need to track URLs anymore
          acc[topic] = true;
          return acc;
        },
        {}
      );

    const webhooks = [
      {
        topic: "PRODUCTS_CREATE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-create-product-webhook?storeID=${storeId}&pageUrl=https://${shop}/products`,
      },
      {
        topic: "PRODUCTS_UPDATE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-update-product-webhook?storeID=${storeId}&pageUrl=https://${shop}/products`,
      },
      {
        topic: "PRODUCTS_DELETE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-delete-product-webhook?storeID=${storeId}&pageUrl=https://${shop}/products`,
      },
      {
        topic: "COLLECTIONS_CREATE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-create-collection-webhook?storeID=${storeId}&pageUrl=https://${shop}/collections`,
      },
      {
        topic: "COLLECTIONS_UPDATE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-update-collection-webhook?storeID=${storeId}&pageUrl=https://${shop}/collections`,
      },
      {
        topic: "COLLECTIONS_DELETE",
        callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-delete-collection-webhook?storeID=${storeId}&pageUrl=https://${shop}/collections`,
      },
    ];

    for (const webhook of webhooks) {
      // Simply check if we have any webhook for this topic
      if (existingWebhookMap[webhook.topic]) {
        console.log(
          `Webhook for ${webhook.topic} already exists, skipping creation`
        );
        continue;
      }

      const mutation = `
        mutation CreateWebhookSubscription($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              format
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

      const variables = {
        topic: webhook.topic,
        webhookSubscription: {
          callbackUrl: webhook.callbackUrl,
          format: "JSON",
        },
      };

      try {
        const response = await client.query({
          data: { query: mutation, variables },
        });

        if (
          response.body.data?.webhookSubscriptionCreate?.userErrors?.length > 0
        ) {
          console.error(
            `Webhook creation error for ${webhook.topic}:`,
            response.body.data.webhookSubscriptionCreate.userErrors
          );
          throw new Error(`Failed to create webhook for ${webhook.topic}`);
        } else {
          console.log(`Webhook for ${webhook.topic} created successfully.`);
        }
      } catch (error) {
        console.error(`Error creating webhook for ${webhook.topic}:`, error);
        throw error;
      }
    }

    res.json({
      validated: true,
      message: "Webhooks registered successfully",
      shop,
    });
  } catch (error) {
    console.error("Webhook Creation Error:", error);
    res
      .status(500)
      .json({
        error: "Failed to validate API Key and create webhooks",
        details: error.message,
      });
  }
};
