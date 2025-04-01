import shopify from '../../shopify.js';
import axios from 'axios';
import User from '../models/User.js';

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
      totalCounts: { pages: 0, products: 0, categories: 0 }
    };

    // Fetch shop info first
    const shopResponse = await client.query({
      data: `{
        shop {
          name
          myshopifyDomain
          primaryDomain { url }
        }
      }`
    });
    storeDetails.storeUrl = shopResponse.body.data.shop.primaryDomain?.url || 
                           `https://${shopResponse.body.data.shop.myshopifyDomain}`;
    storeDetails.shopName = shopResponse.body.data.shop.name;

    // Paginated fetching for products
    while (hasNextPage) {
      const response = await client.query({
        data: `{
          products(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
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
        }`
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
          pages(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
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
        }`
      });
      
      const { edges, pageInfo } = response.body.data.pages;
      storeDetails.pages.push(...edges.map(edge => ({
        ...edge.node,
        url: `${storeDetails.storeUrl}/pages/${edge.node.handle}`,
      })));
      
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    // Paginated fetching for collections
    hasNextPage = true;
    cursor = null;
    while (hasNextPage) {
      const response = await client.query({
        data: `{
          collections(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
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
        }`
      });
      
      const { edges, pageInfo } = response.body.data.collections;
      storeDetails.categories.push(...edges.map(edge => ({
        ...edge.node,
        url: `${storeDetails.storeUrl}/collections/${edge.node.handle}`,
      })));
      
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
export async function postToBrainCommerce(storeDetails, apiKey, storeId, app, shop) {
  const batchSize = 50;
  const maxRetries = 3;
  const queue = [];
  
  // Separate counters for each type
  let syncedPages = 0;
  let syncedProducts = 0;
  let syncedCategories = 0;

  try {
    let user = await User.findOne({ shop: shop });
    if (!user) throw new Error('User not found');

    // Update progress using the app.locals.sendProgressUpdate function
    const sendProgress = (type, synced, total) => {
      app.locals.sendProgressUpdate(type, synced, total);
    };

    // Process pages
    for (const page of storeDetails.pages) {
      await processItem({ type: 'page', data: page }, user, storeDetails.storeUrl, apiKey, storeId);
      syncedPages++;
      sendProgress('pages', syncedPages, storeDetails.pages.length);
    }

    // Process products
    for (const product of storeDetails.products) {
      await processItem({ type: 'product', data: product }, user, storeDetails.storeUrl, apiKey, storeId);
      syncedProducts++;
      sendProgress('products', syncedProducts, storeDetails.products.length);
    }

    // Process categories
    for (const category of storeDetails.categories) {
      await processItem({ type: 'category', data: category }, user, storeDetails.storeUrl, apiKey, storeId);
      syncedCategories++;
      sendProgress('categories', syncedCategories, storeDetails.categories.length);
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
    this.requests = this.requests.filter(time => time > now - 1000);
    
    if (this.requests.length >= this.limit) {
      await new Promise(resolve => 
        setTimeout(resolve, this.requests[0] - (now - 1000))
      );
    }
    
    this.requests.push(now);
  }
}

async function processItem(item, user, storeUrl, apiKey, storeId) {
  const baseEndpoint = `https://www.braincommerce.io/api/v0/store/create-update-page?storeID=${storeId}`;
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  const { type, data } = item;
  let endpoint, itemData;

  switch (type) {
    case 'page':
      if (user.syncedPages.includes(data.id)) {
        console.warn(`Skipping already synced page with ID ${data.id}`);
        return;
      }

      const pageUrl = data.onlineStoreUrl || 
                      (data.handle ? `${storeUrl}/pages/${data.handle}` : null);
                      
      if (!pageUrl) {
        console.warn(`Skipping page with ID ${data.id} - no URL available`);
        return;
      }
      
      endpoint = `${baseEndpoint}&url=${encodeURIComponent(pageUrl)}`;
      
      itemData = {
        platformPageContent: JSON.stringify(data),
        pageType: "single",
        url: pageUrl,
        h1: data.h1 || data.title || "",
        title: data.title || "",
        description: data.description || "",
        metaImage: data.metaImage || "",
        keywords: data.keywords || "",
        visibleText: data.visibleText || data.body || "",
        breadcrumbs: data.breadcrumbs || [],
        postID: data.id || ""
      };

      console.log('Page content (page):', JSON.stringify(data)); // Log only the page content object

      const pageResponse = await axios.post(endpoint, itemData, { headers });
      if (pageResponse.status === 200) {
        user.syncedPages.push(data.id);
      }
      break;

    case 'category':
      if (user.syncedCategories.includes(data.id)) {
        console.warn(`Skipping already synced category with ID ${data.id}`);
        return;
      }

      const categoryUrl = data.onlineStoreUrl || 
                         (data.handle ? `${storeUrl}/collections/${data.handle}` : null);
                         
      if (!categoryUrl) {
        console.warn(`Skipping category with ID ${data.id} - no URL available`);
        return;
      }
      
      endpoint = `${baseEndpoint}&url=${encodeURIComponent(categoryUrl)}`;
      
      itemData = {
        platformPageContent: JSON.stringify(data),
        pageType: "category",
        url: categoryUrl,
        h1: data.h1 || data.title || "",
        title: data.title || "",
        description: data.description || "",
        metaImage: data.metaImage || "",
        keywords: data.keywords || "",
        visibleText: data.visibleText || data.body || "",
        breadcrumbs: data.breadcrumbs || [],
        categoryTagName: data.tags || [],
        categoryID: data.id || ""
      };

      // console.log('Posting category data to Brain Commerce:', itemData);
      console.log("Page content: (category)", JSON.stringify(data));

      const categoryResponse = await axios.post(endpoint, itemData, { headers });
      if (categoryResponse.status === 200) {
        user.syncedCategories.push(data.id);
      }
      break;

    case 'product':
      if (user.syncedProducts.includes(data.id)) {
        console.warn(`Skipping already synced product with ID ${data.id}`);
        return;
      }

      const productUrl = data.onlineStoreUrl || 
                        (data.handle ? `${storeUrl}/products/${data.handle}` : null);
                        
      if (!productUrl) {
        console.warn(`Skipping product with ID ${data.id} - no URL available`);
        return;
      }
      
      endpoint = `${baseEndpoint}&url=${encodeURIComponent(productUrl)}`;
      
      itemData = {
        platformPageContent: JSON.stringify(data),
        pageType: "single",
        url: productUrl,
        h1: data.h1 || data.title || "",
        title: data.title || "",
        description: data.description || "",
        metaImage: data.metaImage || data.featuredMedia?.url || "",
        keywords: data.keywords || data.tags?.join(", ") || "",
        visibleText: data.visibleText || data.descriptionHtml || data.description || "",
        breadcrumbs: data.breadcrumbs || [],
        productPrice: data.priceRangeV2?.minVariantPrice?.amount || "",
        productRegularPrice: data.compareAtPriceRange?.minVariantPrice?.amount || "",
        productWeight: data.variants?.edges?.[0]?.node?.weight || "",
        productDimensions: "",  // Shopify doesn't have a standard dimensions field
        productAverageRating: "",  // Add if available in your data
        productRatingCount: "",    // Add if available in your data
        productStockStatus: data.totalInventory > 0 ? "In Stock" : "Out of Stock",
        productID: data.id || "",
        categoryID: data.collections?.edges?.[0]?.node?.id || ""
      };

      // console.log('Posting product data to Brain Commerce:', itemData);
      console.log("Page content: (product)", JSON.stringify(data));

      const productResponse = await axios.post(endpoint, itemData, { headers });
      if (productResponse.status === 200) {
        user.syncedProducts.push(data.id);
      }
      break;

    default:
      console.warn(`Unknown item type: ${type}`);
  }
}

