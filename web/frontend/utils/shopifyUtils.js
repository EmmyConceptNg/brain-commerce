import axios from "axios";
import { getSessionToken } from "@shopify/app-bridge-utils";

/**
 * Fetches Shopify store details
 * @param {Object} app - App Bridge instance
 * @returns {Promise<Object>} Store details
 */
export async function fetchShopifyStoreDetails(app) {
  try {
    const sessionToken = await getSessionToken(app);

    // Make API request to your backend to fetch store details
    const response = await fetch(`/api/store-details`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch store details: ${response.statusText}`);
    }

    const storeData = await response.json();

    // This is a placeholder structure, implement actual data fetching
    const storeDetails = {
      pages: storeData.pages || [],
      products: storeData.products || [],
      categories: storeData.categories || [],
      totalCounts: {
        pages: storeData.pages?.length || 0,
        products: storeData.products?.length || 0,
        categories: storeData.categories?.length || 0,
      },
    };

    return storeDetails;
  } catch (error) {
    console.error("Error fetching Shopify store details:", error);
    throw error;
  }
}

/**
 * Posts data to Brain Commerce
 * @param {Object} app - App Bridge instance
 * @param {Object} storeDetails - Store details from Shopify
 * @param {string} apiKey - Brain Commerce API key
 * @param {string} storeId - Brain Commerce store ID
 * @param {Function} updateProgress - Function to update progress
 * @returns {Promise<void>}
 */
export async function postToBrainCommerce(
  app,
  storeDetails,
  apiKey,
  storeId,
  updateProgress
) {
  const endpoint = `https://www.braincommerce.io/api/v0/store/create-update-page?storeID=${storeId}`;
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  const batchSize = 10;
  let syncedPages = 0;
  let syncedCategories = 0;
  let syncedProducts = 0;

  try {
    const sessionToken = await getSessionToken(app);

    // Update the total counts in the UI
    updateProgress("pages", 0, storeDetails.totalCounts.pages);
    updateProgress("categories", 0, storeDetails.totalCounts.categories);
    updateProgress("products", 0, storeDetails.totalCounts.products);

    // Process pages
    for (let i = 0; i < storeDetails.pages.length; i += batchSize) {
      const batch = storeDetails.pages.slice(i, i + batchSize);

      // Process each page in the batch
      const pagePromises = batch.map(async (page) => {
        const pageData = {
          platformPageContent: JSON.stringify(page),
          pageType: "single",
          // ...map other fields from page to the required format
        };

        // Log progress to backend for debugging
        await fetch(`/api/log-sync-progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            type: "page",
            item: page.id || page.handle,
            progress: syncedPages + 1,
            total: storeDetails.totalCounts.pages,
          }),
        });

        return axios.post(endpoint, pageData, { headers });
      });

      // Wait for all pages in this batch to be processed
      await Promise.all(pagePromises);

      syncedPages += batch.length;
      updateProgress("pages", syncedPages, storeDetails.totalCounts.pages);
    }

    // Process categories and products similarly...
    // ... (rest of the function remains the same, just add sessionToken to fetch calls)
  } catch (error) {
    console.error("Error syncing with Brain Commerce:", error);
    throw error;
  }
}
