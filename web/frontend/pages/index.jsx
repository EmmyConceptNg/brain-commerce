//13-02-2026 
import React, { useState, useCallback, useEffect } from "react";
import {
  Card,
  Page,
  Layout,
  TextContainer,
  TextField,
  Button,
  Link,
  Text,
  VideoThumbnail,
  Box,
  InlineStack,
  BlockStack,
  Spinner,
  ProgressBar,
  Select,
  Banner,
} from "@shopify/polaris";

import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useAppBridge } from "@shopify/app-bridge-react";

import { getShopifyHost } from "../utils/apiUtils";
import { toast } from "react-toastify";
import { setCredentials } from "../store/actions";

export default function HomePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const app = useAppBridge();
  const apiKeyFromState = useSelector((state) => state.apiKey);
  const storeIdFromState = useSelector((state) => state.storeId);
  const [apiKey, setApiKey] = useState(apiKeyFromState || "");
  const [storeId, setStoreId] = useState(storeIdFromState || "");
  const [syncing, setSyncing] = useState(false);
  const [errors, setErrors] = useState({ apiKey: "", storeId: "" });
  const [activating, setActivating] = useState(false);

  // Add client secret state
  const [clientSecret, setClientSecret] = useState("N/A");

  // Get shop information from URL
  const shop = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("shop") || ""
    : "";
  const storeHandle = shop.replace(".myshopify.com", "");

  useEffect(() => {
    setApiKey(apiKeyFromState);
    setStoreId(storeIdFromState);
  }, [apiKeyFromState, storeIdFromState]);

  // Fetch client secret from backend on component mount
  useEffect(() => {
    const fetchClientSecret = async () => {
      try {
        const response = await fetch('/api/v1/get-app-config', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.clientSecret) {
            setClientSecret(data.clientSecret);
            //console.log('✅ Client secret fetched from backend');
          } else {
            //console.log('⚠️ Client secret not available in response');
          }
        } else {
          //console.log('⚠️ Could not fetch client secret from backend');
        }
      } catch (error) {
        //console.error('Error fetching client secret:', error);
      }
    };

    fetchClientSecret();
  }, []);

  const validateFields = useCallback(() => {
    const newErrors = { apiKey: "", storeId: "" };
    if (!apiKey) newErrors.apiKey = "API Key is required";
    if (!storeId) newErrors.storeId = "Store ID is required";
    setErrors(newErrors);
    return !newErrors.apiKey && !newErrors.storeId;
  }, [apiKey, storeId]);

  const validateApiKeyAndStoreId = async () => {
    try {
      const host = getShopifyHost();
      const response = await fetch(`/api/v1/validate-api-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey, storeId, host }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`API request failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.validated) {
        //console.log("API Key and Store ID are valid");
        dispatch(setCredentials({ apiKey, storeId }));
        return true;
      } else {
        //console.log("Invalid API Key or Store ID");
        setErrors({
          apiKey: data.error ? "Invalid API Key" : "",
          storeId: data.error ? "Invalid Store ID" : "",
        });
        return false;
      }
    } catch (error) {
      //console.error("Error validating API Key and Store ID:", error);
      setErrors({
        apiKey: "Error validating credentials",
        storeId: "Error validating credentials",
      });
      return false;
    }
  };

  const syncShopifyData = async () => {
    try {
      const host = getShopifyHost();
      const response = await fetch(`/api/v1/shopify-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey, storeId, host }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Shopify API request failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        //console.log("Shopify data synced successfully");
        return true;
      } else {
        //console.log("Failed to sync Shopify data");
        return false;
      }
    } catch (error) {
      //console.error("Error syncing Shopify data:", error);
      return false;
    }
  };

  const checkWebhooks = async () => {
    try {
      const host = getShopifyHost();
      const response = await fetch(`/api/v1/admin/webhooks/check`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Shopify API request failed with status: ${response.status}`
        );
      }

      const data = await response.json();
      if (data.success) {
        //console.log("Webhooks checked successfully", data);
        return true;
      } else {
        //console.log("Failed to check webhooks");
        return false;
      }
    } catch (error) {
      //console.error("Error checking webhooks:", error);
      return false;
    }
  };

  // Send access token (client secret) to Brain Commerce — proxied through our own backend to avoid CORS
  const sendAccessTokenWebhook = async () => {
    try {
      const payload = {
        storeID: storeId,
        websiteShopifyURL: shop,
        accessToken: clientSecret,
      };

      //console.log('📤 Sending access token to Brain Commerce (via proxy)...');

      const response = await fetch('/api/v1/update-access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        //console.log('✅ Access token sent to Brain Commerce successfully');
        return true;
      } else {
        //console.warn('⚠️ Access token webhook failed:', response.status, data);
        return false;
      }
    } catch (error) {
      //console.error('❌ Error sending access token to Brain Commerce:', error);
      return false;
    }
  };

  // Log store information with detailed formatting
  const logStoreInformation = () => {
    //console.log("\n");
    //console.log("═══════════════════════════════════════════════════════════════════════════");
    //console.log("                      SHOPIFY STORE INFORMATION                            ");
    //console.log("═══════════════════════════════════════════════════════════════════════════");
    //console.log("");

    // Get app bridge config for Client ID and other details
    let host = "N/A";
    let appApiKey = "N/A";
    let clientId = "N/A";

    try {
      const config = app.config;
      host = config.host || "N/A";
      appApiKey = config.apiKey || "N/A";
      clientId = config.apiKey || "N/A";
    } catch (error) {
      //console.log("⚠️  Note: App Bridge config not available");
    }

    // Display information matching the screenshot format
    //console.log("║ 🏪 Shop Domain: " + shop);
    //console.log("║ 📛 Store Handle: " + storeHandle);
    //console.log("║ 🆔 Store ID (Brain Commerce): " + storeId);
    //console.log("║ 🔑 API Key: " + apiKey);
    //console.log("║ 🌐 Host: " + host);
    //console.log("║ 🔧 App API Key: " + appApiKey);
    //console.log("║ 🔐 Client ID: " + clientId);
    //console.log("║ 🔒 Client Secret: " + clientSecret);
    //console.log("║ ⏰ Current Time: " + new Date().toLocaleString());

    //console.log("");
    //console.log("═══════════════════════════════════════════════════════════════════════════");
    //console.log("");
  };

  const handleSync = async () => {
    if (!validateFields()) {
      //console.log('❌ Sync cancelled: Validation failed');
      return;
    }

    logStoreInformation();

    //console.log('🔄 Starting sync...');
    setSyncing(true);

    try {
      //console.log('🔐 Validating API Key and Store ID...');
      const isValid = await validateApiKeyAndStoreId();

      if (isValid) {
        //console.log('✅ Credentials validated successfully');
        //console.log('📦 Syncing Shopify data...');
        const syncSuccess = await syncShopifyData();

        if (syncSuccess) {
          // Send access token webhook to Brain Commerce
          await sendAccessTokenWebhook();

          //console.log('✅ Manual sync completed successfully');
          toast.success("Shopify data synced successfully!");
        } else {
          //console.log('❌ Sync failed');
          toast.error("Failed to sync Shopify data");
        }
      } else {
        //console.log('❌ Credential validation failed');
      }
    } catch (error) {
      //console.error('❌ Sync error:', error);
      toast.error("Error during sync");
    } finally {
      setSyncing(false);
      //console.log('🏁 Sync process completed');
    }
  };

  const handleActivateWebhooks = async () => {
    try {
      if (!validateFields()) return;

      setActivating(true);

      const host = getShopifyHost();

      const webhooks = [
        {
          topic: "PRODUCTS_CREATE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-create-product-webhook?storeID=${storeId}`,
        },
        {
          topic: "PRODUCTS_UPDATE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-update-product-webhook?storeID=${storeId}`,
        },
        {
          topic: "PRODUCTS_DELETE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-delete-product-webhook?storeID=${storeId}`,
        },
        {
          topic: "COLLECTIONS_CREATE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-create-collection-webhook?storeID=${storeId}`,
        },
        {
          topic: "COLLECTIONS_UPDATE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-update-collection-webhook?storeID=${storeId}`,
        },
        {
          topic: "COLLECTIONS_DELETE",
          callbackUrl: `https://www.braincommerce.io/api/v0/store/shopify/webhooks/products/shopify-delete-collection-webhook?storeID=${storeId}`,
        }
      ];

      const createResponse = await fetch('/api/v1/activate-webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          webhooks,
          apiKey,
          storeId,
          host
        })
      });

      const data = await createResponse.json();
      //console.log('Webhook activation response:', data);

      if (createResponse.ok && data.results) {
        const allWebhooksSuccessful = data.results.every(result => result.success);

        if (allWebhooksSuccessful) {
          await checkWebhooks();
          await sendAccessTokenWebhook();
          toast.success('All webhooks activated successfully!');
        } else {
          const failedWebhooks = data.results
            .filter(result => !result.success)
            .map(result => ({
              topic: result.topic,
              error: result.error || 'Unknown error'
            }));

          //console.error('Failed webhooks:', failedWebhooks);
          await sendAccessTokenWebhook();
          toast.success("All webhooks activated successfully!");
        }
      } else {
        const errorMessage = data.error || 'Unknown error occurred';
        toast.error(`Failed to activate webhooks: ${errorMessage}`);
      }

    } catch (error) {
      //console.error('Error activating webhooks:', error);
      toast.error('Error activating webhooks: ' + error.message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <Page narrowWidth>
      <Layout>
        <Layout.Section>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src="https://pub-ece2f518b9504c2884b29ab98d7f6283.r2.dev/brain_commerce_logo.svg"
              alt="brain_commerce_image"
              width="200px"
            />
          </div>
          <Card sectioned>
            <BlockStack gap="500">
              <Text variant="headingLg" as="h1">
                Welcome to Brain Commerce
              </Text>
              <TextField
                label="Brain Commerce API Key"
                value={apiKey}
                onChange={(value) => setApiKey(value)}
                autoComplete="off"
                error={errors.apiKey}
              />
              <TextField
                label="Brain Commerce Store Id"
                value={storeId}
                onChange={(value) => setStoreId(value)}
                autoComplete="off"
                error={errors.storeId}
              />

              <InlineStack align="space-between">
                <Button
                  onClick={handleSync}
                  variant="primary"
                  tone="success"
                  size="large"
                  disabled={syncing}
                >
                  Sync
                </Button>
                <Button
                  onClick={handleActivateWebhooks}
                  variant="primary"
                  tone="emphasis"
                  size="large"
                  disabled={activating || !apiKey || !storeId}
                >
                  Activate Webhooks
                </Button>
              </InlineStack>

              {syncing && (
                <Box padding="4">
                  <BlockStack gap="200">
                    <Spinner accessibilityLabel="Syncing" size="large" />
                    <Text>
                      Syncing: Please wait while we sync your data with Brain
                      Commerce
                    </Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card sectioned>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Integration Steps
              </Text>
              <Text as="p">
                Follow these steps to complete the Brain Commerce integration:
              </Text>
              <BlockStack gap="300">
                <Text as="p">1. Ensure you've selected "Shopify app" on the integration section on the BrainCommerce Dashboard</Text>
                <Text as="p">
                  2. Add the <b>Brain Commerce Bar</b> block to your theme using
                  the Shopify theme editor:
                </Text>
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderWidth="025"
                  borderRadius="200"
                >
                  <Text as="p">
                    • Go to <b>Online Store → Themes</b> in your Shopify admin
                    <br />• Click <b>Customize</b> on your active theme
                    <br />• In the theme editor, click <b>
                      Add section
                    </b> or <b>Add block</b>
                    <br />• Search for <b>Brain Commerce Bar</b> and add it to
                    your desired location
                    <br />• Save the changes
                    <br />
                    • Note: Pages needs to be published for the chat widget to
                    appear in the storefront.
                    <br />
                    <br />
                    <Link
                      url={`https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&api_key=${
                        import.meta.env.VITE_SHOPIFY_API_KEY
                      }&handle=brain_commerce&template=index&section=main`}
                      external
                      disabled={storeIdFromState == ""}
                    >
                      Open Theme Editor
                    </Link>
                  </Text>
                </Box>
                <Text as="p">
                  3. Click the "Activate Webhooks" button above to enable
                  real-time updates.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card sectioned>
            <VideoThumbnail
              videoLength={80}
              thumbnailUrl="https://pub-ece2f518b9504c2884b29ab98d7f6283.r2.dev/.Screenshot%202025-04-24%20at%2016.19.50.png"
              onClick={() => {
                window.open("https://youtu.be/j6k8W2YY4jo", "_blank");
              }}
            />
            <BlockStack>
              <Text as="p">
                Watch this video to learn how to create an account and get your
                API keys.
              </Text>
              <Text as="p">
                1. Once you've created an account and logged in, go to the Store
                Settings section in the left sidebar. Then navigate to the
                Account/API section.
              </Text>
              <Text as="p">
                2. click on Manage API Keys, then select Generate New API Key
              </Text>
              <Text as="p">
                3. Enter a name for the key, and the system will create it for
                you.
              </Text>
              <Text as="p">
                4. Important: Make sure to copy and save the API key right away.
              </Text>
              <Text as="p">
                For security reasons, it will not be visible again. Keep your
                API keys private and store them in a safe location.
              </Text>
              <Text as="p">
                If you need any help, feel free to contact our support team.
              </Text>
              <Text as="p">Thank you very much!</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}