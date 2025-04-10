import shopify from "../../shopify.js";
import axios from "axios";
import User from "../models/User.js";

/**
 * Fetches Shopify store details
 * @param {Object} session - Shopify session
 * @returns {Promise<Object>} Store details
 */
export async function fetchShopifyStoreDetails(session) {
  try {
    const client = new shopify.api.clients.Graphql({ session });
    let hasNextPage = true;
    let cursor = null;
    const storeDetails = {
      pages: [],
      products: [],
      categories: [],
      totalCounts: { pages: 0, products: 0, categories: 0 },
    };

    // Fetch shop info first
    const shopResponse = await client.query({
      data: `{
        shop {
          name
          myshopifyDomain
          primaryDomain { url }
        }
      }`,
    });
    storeDetails.storeUrl =
      shopResponse.body.data.shop.primaryDomain?.url ||
      `https://${shopResponse.body.data.shop.myshopifyDomain}`;
    storeDetails.shopName = shopResponse.body.data.shop.name;

    // Paginated fetching for products
    while (hasNextPage) {
      const response = await client.query({
        data: `{
          products(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                descriptionHtml
                vendor
                productType
                tags
                handle
                totalInventory
                collections(first: 10) {
                  edges {
                    node {
                      id
                      title
                      handle
                    }
                  }
                }
                featuredMedia {
                  ... on MediaImage {
                    image {
                      originalSrc
                      altText
                    }
                  }
                }
                variants(first: 250) {
                  edges {
                    node {
                      id
                      title
                      price
                      compareAtPrice
                      sku
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }`,
      });

      const { edges, pageInfo } = response.body.data.products;
      storeDetails.products.push(
        ...edges.map((edge) => ({
          ...edge.node,
          url: `${storeDetails.storeUrl}/products/${edge.node.handle}`,
          metaImage: edge.node.featuredMedia?.image?.originalSrc || null,
          productPrice: edge.node.variants?.edges?.[0]?.node?.price || null, // Add product price
          productRegularPrice:
            edge.node.variants?.edges?.[0]?.node?.compareAtPrice || null, // Add regular price
          collections:
            edge.node.collections?.edges?.map((col) => ({
              id: col.node.id,
              title: col.node.title,
              handle: col.node.handle,
              url: `${storeDetails.storeUrl}/collections/${col.node.handle}`,
            })) || [],
        }))
      );

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    // Similar pagination for pages and collections
    // Paginated fetching for pages
    hasNextPage = true;
    cursor = null;
    while (hasNextPage) {
      const response = await client.query({
        data: `{
          pages(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                body
                handle
              }
            }
          }
        }`,
      });

      const { edges, pageInfo } = response.body.data.pages;
      storeDetails.pages.push(
        ...edges.map((edge) => ({
          ...edge.node,
          url: `${storeDetails.storeUrl}/pages/${edge.node.handle}`,
        }))
      );

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    // Paginated fetching for collections
    hasNextPage = true;
    cursor = null;
    while (hasNextPage) {
      const response = await client.query({
        data: `{
          collections(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                descriptionHtml
                handle
              }
            }
          }
        }`,
      });

      const { edges, pageInfo } = response.body.data.collections;
      storeDetails.categories.push(
        ...edges.map((edge) => ({
          ...edge.node,
          url: `${storeDetails.storeUrl}/collections/${edge.node.handle}`,
        }))
      );

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    storeDetails.totalCounts.pages = storeDetails.pages.length;
    storeDetails.totalCounts.products = storeDetails.products.length;
    storeDetails.totalCounts.categories = storeDetails.categories.length;

    console.log("store details", storeDetails);

    return storeDetails;
  } catch (error) {
    console.error("Error fetching Shopify store details:", error);
    throw error;
  }
}

/**
 * Posts data to Brain Commerce
 * @param {Object} storeDetails - Store details from Shopify
 * @param {string} apiKey - Brain Commerce API key
 * @param {string} storeId - Brain Commerce store ID
 * @param {Function} updateProgress - Function to update progress
 * @returns {Promise<void>}
 */
export async function postToBrainCommerce(
  storeDetails,
  apiKey,
  storeId,
  app,
  shop,
  session
) {
  const batchSize = 50;
  const maxRetries = 3;
  const queue = [];

  // Separate counters for each type
  let syncedPages = 0;
  let syncedProducts = 0;
  let syncedCategories = 0;

  try {
    let user = await User.findOne({ shop: shop });
    if (!user) throw new Error("User not found");

    // Update progress using the app.locals.sendProgressUpdate function
    const sendProgress = (type, synced, total) => {
      app.locals.sendProgressUpdate(type, synced, total);
    };

    // Process pages
    for (const page of storeDetails.pages) {
      await processItem(
        { type: "page", data: page },
        user,
        storeDetails.storeUrl,
        apiKey,
        storeId,
        session
      );
      syncedPages++;
      sendProgress("pages", syncedPages, storeDetails.pages.length);
    }

    // Process products
    for (const product of storeDetails.products) {
      await processItem(
        { type: "product", data: product },
        user,
        storeDetails.storeUrl,
        apiKey,
        storeId,
        session
      );
      syncedProducts++;
      sendProgress("products", syncedProducts, storeDetails.products.length);
    }

    // Process categories
    for (const category of storeDetails.categories) {
      await processItem(
        { type: "category", data: category },
        user,
        storeDetails.storeUrl,
        apiKey,
        storeId,
        session
      );
      syncedCategories++;
      sendProgress(
        "categories",
        syncedCategories,
        storeDetails.categories.length
      );
    }

    await user.save();
  } catch (error) {
    console.error("Error in sync process:", error);
    throw error;
  }
}

// Add new helper classes/functions
class RateLimit {
  constructor(limit, interval) {
    this.limit = limit;
    this.interval = interval;
    this.requests = [];
  }

  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => time > now - 1000);

    if (this.requests.length >= this.limit) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.requests[0] - (now - 1000))
      );
    }

    this.requests.push(now);
  }
}

async function processItem(item, user, storeUrl, apiKey, storeId, session) {
  const baseEndpoint = `https://www.braincommerce.io/api/v0/store/create-update-page?storeID=${storeId}`;
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  const { type, data } = item;
  let endpoint, itemData;

  // Pick only the fields we want, excluding variants
  const cleanedData = {
    id: data.id,
    title: data.title,
    descriptionHtml: data.descriptionHtml,
    vendor: data.vendor,
    productType: data.productType,
    tags: data.tags,
    handle: data.handle,
    totalInventory: data.totalInventory,
    inStock: data.totalInventory > 0,
    featuredMedia: data.featuredMedia,
    url: data.url,
    metaImage: data.metaImage,
    productPrice: data.productPrice,
    productRegularPrice: data.productRegularPrice,
    // Clean up collections structure if present
    collections:
      data.collections?.edges?.map((edge) => ({
        ...edge.node,
      })) || [],
  };

  console.log("Cleaned data:", JSON.stringify(data)); // Format with indentation

  switch (type) {
    case "page":
      const pageUrl =
        cleanedData.onlineStoreUrl ||
        (cleanedData.handle ? `${storeUrl}/pages/${cleanedData.handle}` : null);

      if (!pageUrl) {
        console.warn(
          `Skipping page with ID ${cleanedData.id} - no URL available`
        );
        return;
      }

      endpoint = `${baseEndpoint}&url=${encodeURIComponent(pageUrl)}`;

      itemData = {
        platformPageContent: JSON.stringify(cleanedData, null, 2),
        pageType: "single",
        url: pageUrl,
        h1: cleanedData.h1 || cleanedData.title || "",
        title: cleanedData.title || "",
        description: cleanedData.description || "",
        metaImage: cleanedData.metaImage || "",
        keywords: cleanedData.keywords || "",
        visibleText: cleanedData.visibleText || cleanedData.body || "",
        breadcrumbs: [
          ...new Set([
            ...(cleanedData.tags || []),
            ...(cleanedData.collections?.map((col) => col.title) || []),
          ]),
        ],
        postID: cleanedData.id || "",
      };

      console.log("Page content (page):", JSON.stringify(cleanedData, null, 2)); // Format with indentation

      const pageResponse = await axios.post(endpoint, itemData, { headers });
      break;

    case "category":
      const categoryUrl =
        cleanedData.onlineStoreUrl ||
        (cleanedData.handle
          ? `${storeUrl}/collections/${cleanedData.handle}`
          : null);

      if (!categoryUrl) {
        console.warn(
          `Skipping category with ID ${cleanedData.id} - no URL available`
        );
        return;
      }

      endpoint = `${baseEndpoint}&url=${encodeURIComponent(categoryUrl)}`;

      // Add top-selling categories to platformPageContent
      const topSellingCategories = await fetchTopSellingCategories(
        cleanedData.id,
        session
      );

      // Get collection tags
      // const collectionTags = await getCollectionTags(cleanedData.id, session);

      itemData = {
        platformPageContent: JSON.stringify(
          {
            ...cleanedData,
            topSellingCategories,
          },
          null,
          2
        ),
        pageType: "category",
        url: categoryUrl,
        h1: cleanedData.h1 || cleanedData.title || "",
        title: cleanedData.title || "",
        description: cleanedData.description || "",
        metaImage: cleanedData.metaImage || "",
        keywords: cleanedData.keywords || "",
        visibleText: cleanedData.visibleText || cleanedData.body || "",
        breadcrumbs: [
          ...new Set([
            ...(cleanedData.tags || []),
            ...(cleanedData.collections?.map((col) => col.title) || []),
          ]),
        ],
        categoryTagName: [
          ...new Set([
            ...(cleanedData.tags || []),
            ...(cleanedData.collections?.map((col) => col.title) || []),
          ]),
        ],
        categoryID: cleanedData.id || "",
      };

      console.log(
        "Page content: (category)",
        JSON.stringify(itemData.platformPageContent, null, 2)
      ); // Format with indentation

      const categoryResponse = await axios.post(endpoint, itemData, {
        headers,
      });
      break;

    case "product":
      const productUrl =
        cleanedData.onlineStoreUrl ||
        (cleanedData.handle
          ? `${storeUrl}/products/${cleanedData.handle}`
          : null);

      if (!productUrl) {
        console.warn(
          `Skipping product with ID ${cleanedData.id} - no URL available`
        );
        return;
      }

      endpoint = `${baseEndpoint}&url=${encodeURIComponent(productUrl)}`;

      itemData = {
        platformPageContent: JSON.stringify(cleanedData, null, 2),
        pageType: "single",
        url: productUrl,
        h1: cleanedData.h1 || cleanedData.title || "",
        title: cleanedData.title || "",
        description: cleanedData.description || "",
        metaImage:
          cleanedData.metaImage || cleanedData.featuredMedia?.url || "",
        keywords: cleanedData.keywords || cleanedData.tags?.join(", ") || "",
        visibleText:
          cleanedData.visibleText ||
          cleanedData.descriptionHtml ||
          cleanedData.description ||
          "",
        breadcrumbs: [
          ...new Set([
            ...(cleanedData.tags || []),
            ...(cleanedData.collections?.map((col) => col.title) || []),
          ]),
        ],
        productPrice: cleanedData.productPrice || "",
        productRegularPrice: cleanedData.productRegularPrice || "",
        productWeight: cleanedData.variants?.[0]?.weight || "",
        productDimensions: "", // Shopify doesn't have a standard dimensions field
        productAverageRating: "", // Add if available in your data
        productRatingCount: "", // Add if available in your data
        productStockStatus:
          cleanedData.totalInventory > 0 ? "In Stock" : "Out of Stock",
        productID: cleanedData.id || "",
        categoryID: cleanedData.collections?.[0]?.id || "",
      };

      console.log(
        "Posting product data to Brain Commerce:",
        JSON.stringify(itemData, null, 2)
      ); // Format with indentation
      console.log("Page content: (product)", JSON.stringify(cleanedData)); // Format with indentation

      const productResponse = await axios.post(endpoint, itemData, { headers });
      break;

    default:
      console.warn(`Unknown item type: ${type}`);
  }
}

// Helper function to fetch top-selling categories
async function fetchTopSellingCategories(categoryId, session) {
  try {
    const client = new shopify.api.clients.Graphql({ session }); // Ensure session is available globally or passed as a parameter

    const response = await client.query({
      data: `{
        collections(first: 10, query: "id:${categoryId}") {
          edges {
            node {
              id
              title
              products(first: 10, sortKey: BEST_SELLING) {
                edges {
                  node {
                    id
                    title
                    totalInventory
                    variants(first: 1) {
                      edges {
                        node {
                          price
                          compareAtPrice
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
    });

    const collections = response.body.data.collections.edges.map((edge) => {
      const products = edge.node.products.edges.map((productEdge) => ({
        id: productEdge.node.id,
        title: productEdge.node.title,
        inventory: productEdge.node.totalInventory,
        price: productEdge.node.variants.edges[0]?.node.price || null,
        regularPrice:
          productEdge.node.variants.edges[0]?.node.compareAtPrice || null,
      }));

      return {
        id: edge.node.id,
        name: edge.node.title,
        topProducts: products,
      };
    });

    return collections;
  } catch (error) {
    console.error("Error fetching top-selling categories:", error);
    return [];
  }
}

// Add new helper function to get collection tags
async function getCollectionTags(collectionId, session) {
  try {
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.query({
      data: `{
        collection(id: "${collectionId}") {
          tags
        }
      }`,
    });

    return response.body.data.collection?.tags || [];
  } catch (error) {
    console.error("Error fetching collection tags:", error);
    return [];
  }
}
