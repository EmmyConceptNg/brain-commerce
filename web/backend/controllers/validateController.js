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

    // Fetch the Shop GID dynamically
    const shopIdQuery = `
      {
        shop {
          id
        }
      }
    `;
    let shopGid;
    try {
      const shopIdResp = await client.query({ data: { query: shopIdQuery } });
      shopGid = shopIdResp.body.data.shop.id;
    } catch (err) {
      console.error("Error fetching shop GID:", err);
      return res.status(500).json({ error: "Failed to fetch shop GID" });
    }

    // Create or update a store metafield for storeId
    const metafieldMutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const metafields = [
      {
        ownerId: shopGid,
        namespace: "brain_commerce",
        key: "store_id",
        type: "single_line_text_field",
        value: storeId,
      },
    ];
    try {
      const metafieldResp = await client.query({
        data: { query: metafieldMutation, variables: { metafields } },
      });
      if (
        metafieldResp.body.data?.metafieldsSet?.userErrors?.length > 0
      ) {
        console.error(
          "Metafield error:",
          metafieldResp.body.data.metafieldsSet.userErrors
        );
      } else {
        console.log("StoreId metafield set successfully.");
      }
    } catch (err) {
      console.error("Error setting storeId metafield:", err);
    }

    const getExistingWebhooks = `
      query {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              id
              topic
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
          acc[edge.node.topic] = true;
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
      if (existingWebhookMap[webhook.topic]) {
        console.log(`Webhook for ${webhook.topic} already exists, skipping.`);
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
        } else {
          console.log(`Webhook for ${webhook.topic} created successfully.`);
        }
      } catch (error) {
        console.error(`Error creating webhook for ${webhook.topic}:`, error);
        // Do NOT throw the error; just log it and continue
      }
    }

    res.json({
      validated: true,
      message: "Webhooks registered successfully",
      shop,
    });
  } catch (error) {
    console.error("Webhook Creation Error:", error);
    res.status(500).json({
      error: "Failed to validate API Key and create webhooks",
      details: error.message,
    });
  }
};
