import { getSessionToken } from "@shopify/app-bridge-utils";

/**
 * Utility function to make authenticated API requests to the backend
 * @param {Object} app - App Bridge instance
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const shopifyFetch = async (app, endpoint, options = {}) => {
  try {
    // Check if app is a valid App Bridge instance
    if (!app || typeof app.getState !== "function") {
      console.error("Invalid App Bridge instance provided to shopifyFetch");
      throw new Error("Invalid App Bridge instance");
    }

    const sessionToken = await getSessionToken(app);

    // Add the session token to the headers
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${sessionToken}`,
    };

    return fetch(endpoint, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error("Error in shopifyFetch:", error);
    throw error;
  }
};

/**
 * Gets the host parameter from the URL
 * @returns {string|null} - Host parameter or null if not found
 */
export const getShopifyHost = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("host");
};
