import shopify from "../../shopify.js";

export const checkWebhooks = async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    if (!session) {
      return res.status(401).json({ error: "Unauthorized - Missing Session" });
    }

    const client = new shopify.api.clients.Graphql({ session });

    const query = `
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
              format
              createdAt
              metafieldNamespaces
              includeFields
            }
          }
        }
      }
    `;

    const response = await client.query({
      data: { query },
    });

    const webhooks = response.body.data.webhookSubscriptions.edges.map(
      ({ node }) => ({
        id: node.id,
        topic: node.topic,
        callbackUrl: node.endpoint.callbackUrl,
        format: node.format,
        createdAt: node.createdAt,
        metafieldNamespaces: node.metafieldNamespaces,
        includeFields: node.includeFields,
      })
    );

    res.json({
      success: true,
      webhooksCount: webhooks.length,
      webhooks: webhooks
    });

  } catch (error) {
    console.error("Error checking webhooks:", error);
    res.status(500).json({
      error: "Failed to fetch webhooks",
      details: error.message
    });
  }
};
