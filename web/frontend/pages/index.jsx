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
} from "@shopify/polaris";

import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux"; // Import useDispatch and useSelector from react-redux

import { getShopifyHost } from "../utils/apiUtils";
import { toast } from "react-toastify";
import { setCredentials } from "../store/actions"; // Import the setCredentials action

export default function HomePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch(); // Initialize useDispatch
  const apiKeyFromState = useSelector((state) => state.apiKey); // Get apiKey from Redux state
  const storeIdFromState = useSelector((state) => state.storeId); // Get storeId from Redux state
  const [apiKey, setApiKey] = useState(apiKeyFromState || "");
  const [storeId, setStoreId] = useState(storeIdFromState || "");
  const [syncing, setSyncing] = useState(false);
 
  const [errors, setErrors] = useState({ apiKey: "", storeId: "" });

  const [activating, setActivating] = useState(false);

  useEffect(() => {
    setApiKey(apiKeyFromState);
    setStoreId(storeIdFromState);
  }, [apiKeyFromState, storeIdFromState]);

  

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
        console.log("API Key and Store ID are valid");
        toast.success("API Key and Store ID are valid! Please wait while we sync shopify with brain commerce");

        // Dispatch the credentials to Redux store
        dispatch(setCredentials({ apiKey, storeId }));

        return true;
      } else {
        console.log("Invalid API Key or Store ID");
        setErrors({
          apiKey: data.error ? "Invalid API Key" : "",
          storeId: data.error ? "Invalid Store ID" : "",
        });
        return false;
      }
    } catch (error) {
      console.error("Error validating API Key and Store ID:", error);
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
        console.log("Shopify data synced successfully");
        toast.success("Shopify data synced successfully!");
      } else {
        console.log("Failed to sync Shopify data");
        toast.error("Failed to sync Shopify data");
      }
    } catch (error) {
      console.error("Error syncing Shopify data:", error);
      toast.error("Error syncing Shopify data");
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
        console.log("Webhooks checked successfully", data);
        console.log("Shopify data synced successfully");
        toast.success("Shopify data synced successfully!");
      } else {
        console.log("Failed to sync Shopify data");
        toast.error("Failed to sync Shopify data");
      }
    } catch (error) {
      console.error("Error syncing Shopify data:", error);
      toast.error("Error syncing Shopify data");
    }
  };

  const handleSync = async () => {
    if (!validateFields()) return;
    setSyncing(true);

    const isValid = await validateApiKeyAndStoreId();
    if (isValid) {
      await syncShopifyData();
    }

    setSyncing(false);
  };

  const handleActivateWebhooks = async () => {
    try {
      if (!validateFields()) return;

      setActivating(true)
      
      const host = getShopifyHost();

      // Then create new webhooks
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
      console.log('Webhook activation response:', data); // Add this line for debugging

      if (createResponse.ok && data.results) {
        const allWebhooksSuccessful = data.results.every(result => result.success);
        
        if (allWebhooksSuccessful) {
          toast.success('All webhooks activated successfully!');
          await checkWebhooks();
        } else {
          const failedWebhooks = data.results
            .filter(result => !result.success)
            .map(result => ({
              topic: result.topic,
              error: result.error || 'Unknown error'
            }));
          
          console.error('Failed webhooks:', failedWebhooks); // Add this line for debugging
          
          const failedWebhookMessages = failedWebhooks
            .map(webhook => `${webhook.topic}: ${webhook.error}`)
            .join('\n');
          
          toast.warning(`Some webhooks failed to activate:\n${failedWebhookMessages}`);
        }
      } else {
        const errorMessage = data.error || 'Unknown error occurred';
        toast.error(`Failed to activate webhooks: ${errorMessage}`);
      }

    } catch (error) {
      console.error('Error activating webhooks:', error);
      toast.error('Error activating webhooks: ' + error.message);
    }finally {
      setActivating(false);
    }
  };

  // Extract Shopify store handle from shop domain
  const shop = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("shop") || ""
    : "";
  const storeHandle = shop.replace(".myshopify.com", "");

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
                <Link url="https://www.braincommerce.io/entry/signup" external>
                  Create an account on Brain Commerce
                </Link>
              </InlineStack>

              {syncing && (
                <Box padding="4">
                  <Spinner accessibilityLabel="Syncing" size="large" />
                  <Text>
                    Syncing: Please wait while we sync your data with Brain
                    Commerce
                  </Text>
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
                <Text as="p">
                  1. Add the <b>Brain Commerce Bar</b> block to your theme using
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
                    <br />
                    • Save the changes
                    <br />
                    <br />
                    <Link
                      url={`https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&api_key=${import.meta.env.VITE_SHOPIFY_API_KEY}&handle=brain_commerce&template=index&section=main`}
                      external
                    >
                      Open Theme Editor
                    </Link>
                  </Text>
                </Box>
                <Text as="p">
                  2. Click the "Activate Webhooks" button above to enable
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
