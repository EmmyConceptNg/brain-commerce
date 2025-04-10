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
export async function postToBrainCommerce(storeDetails, apiKey, storeId, app, shop,session) {
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
      await processItem({ type: 'page', data: page }, user, storeDetails.storeUrl, apiKey, storeId, session);
      syncedPages++;
      sendProgress('pages', syncedPages, storeDetails.pages.length);
    }

    // Process products
    for (const product of storeDetails.products) {
      await processItem({ type: 'product', data: product }, user, storeDetails.storeUrl, apiKey, storeId, session);
      syncedProducts++;
      sendProgress('products', syncedProducts, storeDetails.products.length);
    }

    // Process categories
    for (const category of storeDetails.categories) {
      await processItem({ type: 'category', data: category }, user, storeDetails.storeUrl, apiKey, storeId, session);
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

async function processItem(item, user, storeUrl, apiKey, storeId, session) {
  const baseEndpoint = `https://www.braincommerce.io/api/v0/store/create-update-page?storeID=${storeId}`;
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  const { type, data } = item;
  let endpoint, itemData;

  // Helper function to format page content
  function formatPageContent(data, type) {
    const baseContent = {
      id: data.id,
      title: data.title,
      handle: data.handle,
      url: data.url,
    };

    switch (type) {
      case 'product':
        return {
          ...baseContent,
          description: data.descriptionHtml || '',
          vendor: data.vendor,
          productType: data.productType,
          tags: data.tags,
          totalInventory: data.totalInventory,
          image: data.featuredMedia?.image?.originalSrc,
          price: data.productPrice,
          regularPrice: data.productRegularPrice,
          variants: data.variants?.edges?.map(edge => ({
            id: edge.node.id,
            title: edge.node.title,
            price: edge.node.price,
            sku: edge.node.sku,
            inventory: edge.node.inventoryQuantity
          })) || []
        };

      case 'page':
        return {
          ...baseContent,
          body: data.body || '',
          template: data.template || 'default'
        };

      case 'category':
        return {
          ...baseContent,
          description: data.descriptionHtml || '',
          topSellingProducts: data.topSellingProducts || []
        };

      default:
        return baseContent;
    }
  }

  switch (type) {
    case 'page':
    case 'product':
      let categories = [];
      let breadcrumbsData = [];
      
      const url = data.url || (type === 'page' 
        ? `${storeUrl}/pages/${data.handle}`
        : `${storeUrl}/products/${data.handle}`);
      
      if (type === 'product') {
        categories = await fetchProductCategories(data.id);
        breadcrumbsData = categories.map(cat => ({
          title: cat.title,
          url: `${storeUrl}/collections/${cat.handle}`
        }));
        
        breadcrumbsData.unshift({ title: 'Home', url: storeUrl });
        if (data.title) {
          breadcrumbsData.push({ title: data.title, url: '' });
        }
      }

      const formattedContent = formatPageContent(data, type);

      itemData = {
        platformPageContent: formattedContent,
        pageType: "single",
        url: url,  // Using the constructed URL
        h1: data.h1 || data.title || "",
        title: data.title || "",
        description: data.description || "",
        metaImage: data.metaImage || data.featuredMedia?.url || "",
        keywords: data.keywords || data.tags?.join(", ") || "",
        visibleText: data.visibleText || data.descriptionHtml || data.description || "",
        breadcrumbs: breadcrumbsData,
        categoryTagName: categories.map(cat => cat.title),
        postID: data.id || "",
        ...(type === 'product' && {
          productPrice: data.productPrice || "",
          productRegularPrice: data.productRegularPrice || "",
          productWeight: data.variants?.edges?.[0]?.node?.weight || "",
          productDimensions: "",
          productAverageRating: "",
          productRatingCount: "",
          productStockStatus: data.totalInventory > 0 ? "In Stock" : "Out of Stock",
          productID: data.id || "",
          categoryID: categories[0]?.id || "",
        })
      };

      // ...existing code...
      break;

    case 'category':
      // ...existing code...
      const formattedCategoryContent = formatPageContent(data, 'category');
      itemData = {
        platformPageContent: formattedCategoryContent,
        // ...rest of category itemData... okay 
      };
      break;
  }
  
  // ...existing code...
}

// Helper function to fetch categories for a product
async function fetchProductCategories(productId) {
  const client = new shopify.api.clients.Graphql({ session });
  const response = await client.query({
    data: `{
      product(id: "${productId}") {
        collections(first: 10) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    }`
  });
  return response.body.data.product.collections.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    handle: edge.node.handle
  }));
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
      }`
    });

    const collections = response.body.data.collections.edges.map(edge => {
      const products = edge.node.products.edges.map(productEdge => ({
        id: productEdge.node.id,
        title: productEdge.node.title,
        inventory: productEdge.node.totalInventory,
        price: productEdge.node.variants.edges[0]?.node.price || null,
        regularPrice: productEdge.node.variants.edges[0]?.node.compareAtPrice || null,
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

