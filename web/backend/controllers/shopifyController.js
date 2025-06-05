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
      blogPosts: [],
      homepage: null,
      totalCounts: { pages: 0, products: 0, categories: 0, blogPosts: 0 },
    };

    // Fetch shop info and homepage
    const shopResponse = await client.query({
      data: `{
        shop {
          name
          myshopifyDomain
          primaryDomain { url }
          description
          metafields(first: 10) {
            edges {
              node {
                key
                value
              }
            }
          }
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

    // After fetching collections, fetch blog posts
    hasNextPage = true;
    cursor = null;

   const response = await client.query({
     data: `{
    blogs(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
      edges {
        node {
          id
          handle
          title
          articles(first: 5) {
            edges {
              node {
                id
                title
                handle
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  }`,
   });


   console.log(JSON.stringify(response.body));


   const blogs = response.body.data.blogs.edges;

   for (const blog of blogs) {
     const blogArticles = blog.node.articles.edges;

     storeDetails.blogPosts.push(
       ...blogArticles.map((article) => ({
         id: article.node.id,
         title: article.node.title,
         handle: article.node.handle,
         content: article.node.contentHtml,
         excerpt: article.node.excerpt,
         publishedAt: article.node.publishedAt,
         tags: article.node.tags,
         blogId: blog.node.id,
         blogTitle: blog.node.title,
         blogHandle: blog.node.handle,
         url: `${storeDetails.storeUrl}/blogs/${blog.node.handle}/${article.node.handle}`,
         metaImage: article.node.image?.url || null,
         author: article.node.authorV2?.name || "",
       }))
     );
   }



    // Set homepage data
    storeDetails.homepage = {
      url: storeDetails.storeUrl,
      title: storeDetails.shopName,
      description: shopResponse.body.data.shop.description || "",
      metafields: shopResponse.body.data.shop.metafields?.edges.map(edge => ({
        key: edge.node.key,
        value: edge.node.value
      })) || []
    };

    storeDetails.totalCounts.pages = storeDetails.pages.length;
    storeDetails.totalCounts.products = storeDetails.products.length;
    storeDetails.totalCounts.categories = storeDetails.categories.length;
    storeDetails.totalCounts.blogPosts = storeDetails.blogPosts.length;

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
  let syncedBlogPosts = 0;

  try {
    let user = await User.findOne({ shop: shop });
    if (!user) throw new Error("User not found");

   
    console.log('store details: ', JSON.stringify(storeDetails));

    // Process homepage (add this before processing other items)
    if (storeDetails.homepage) {
      await processItem(
        { type: "homepage", data: storeDetails.homepage },
        user,
        storeDetails.storeUrl,
        apiKey,
        storeId,
        session
      );
      
    }

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
    }

    // Process blogs
    for (const blogPost of storeDetails.blogPosts) {
      await processItem(
        { type: "blogPost", data: blogPost },
        user,
        storeDetails.storeUrl,
        apiKey,
        storeId,
        session
      );
      syncedBlogPosts++;
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
    featuredMedia: data.featuredMedia,
    url: data.url,
    metaImage: data.metaImage,
    productPrice: data.productPrice,
    productRegularPrice: data.productRegularPrice,
    collections: data.collections || [] // Directly use the collections array
  };

if(type === "product") {
  cleanedData.inStock = data.totalInventory > 0 ? "In Stock" : "Out of Stock";
}


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
      const topSellingProducts = await fetchTopSellingCategories(
        cleanedData.id,
        session,
        storeUrl
      );

      // Get collection tags
      // const collectionTags = await getCollectionTags(cleanedData.id, session);

      itemData = {
        platformPageContent: JSON.stringify(
          {
            ...cleanedData,
            topSellingProducts,
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

    case "blogPost":
      const blogPostUrl = cleanedData.url;

      if (!blogPostUrl) {
        console.warn(`Skipping blog post with ID ${cleanedData.id} - no URL available`);
        return;
      }

      endpoint = `${baseEndpoint}&url=${encodeURIComponent(blogPostUrl)}`;
      itemData = {
        platformPageContent: JSON.stringify(cleanedData, null, 2),
        pageType: "single",
        url: blogPostUrl,
        h1: cleanedData.h1 || cleanedData.title || "",
        title: cleanedData.title || "",
        description: data.contentHtml || data.excerpt || "",
        metaImage: cleanedData.metaImage || "",
        keywords: cleanedData.keywords || data.tags?.join(", ") || "",
        visibleText: data.contentHtml || "",
        breadcrumbs: [
          ...new Set([
            ...(cleanedData.tags || []),
            cleanedData.blogTitle || "",
          ]),
        ],
        blogID: cleanedData.id || "",
        author: data.author?.name || "",
        publishedAt: data.publishedAt || "",
        blogTitle: cleanedData.blogTitle || ""
      };

      console.log("Page content: (blog post)", JSON.stringify(cleanedData, null, 2));

      const blogPostResponse = await axios.post(endpoint, itemData, { headers });
      break;

    case "homepage":
      const homepageUrl = storeUrl;

      endpoint = `${baseEndpoint}&url=${encodeURIComponent(homepageUrl)}`;

      itemData = {
        platformPageContent: JSON.stringify(cleanedData, null, 2),
        pageType: "single",
        url: homepageUrl,
        h1: cleanedData.h1 || cleanedData.title || "",
        title: cleanedData.title || "",
        description: cleanedData.description || "",
        metaImage: cleanedData.metaImage || "",
        keywords: cleanedData.keywords || "",
        visibleText: cleanedData.visibleText || "",
        metafields: cleanedData.metafields || [],
        shopName: cleanedData.shopName || ""
      };

      console.log("Page content: (homepage)", JSON.stringify(cleanedData, null, 2));

      const homepageResponse = await axios.post(endpoint, itemData, { headers });
      break;

    default:
      console.warn(`Unknown item type: ${type}`);
  }
}

// Helper function to fetch top-selling categories
async function fetchTopSellingCategories(categoryId, session, storeUrl) {
  try {
    const client = new shopify.api.clients.Graphql({ session });

    const response = await client.query({
      data: `{
        collection(id: "${categoryId}") {
          id
          title
          products(first: 10, sortKey: BEST_SELLING) {
            edges {
              node {
                id
                title
                handle
                totalInventory
                featuredImage {
                  originalSrc
                  altText
                }
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                
              }
            }
          }
        }
      }`,
    });

    const collection = response.body.data.collection;
    if (!collection) return [];

    const topProducts = collection.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      url: `${storeUrl}/products/${node.handle}`,
      image: node.featuredImage?.originalSrc || null,
      imageAlt: node.featuredImage?.altText || null,
      price: node.priceRange.minVariantPrice.amount,
      currencyCode: node.priceRange.minVariantPrice.currencyCode
    }));

    return {
      id: collection.id,
      title: collection.title,
      topProducts
    };

  } catch (error) {
    console.error("Error fetching top-selling products for category:", error);
    return null;
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
