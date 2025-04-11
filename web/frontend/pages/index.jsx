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
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux"; // Import useDispatch and useSelector from react-redux

import { shopifyFetch, getShopifyHost } from "../utils/apiUtils";
import { toast } from "react-toastify";
import { setCredentials } from "../store/actions"; // Import the setCredentials action

export default function HomePage() {
  const { t } = useTranslation();
  const app = useAppBridge();
  const dispatch = useDispatch(); // Initialize useDispatch
  const apiKeyFromState = useSelector((state) => state.apiKey); // Get apiKey from Redux state
  const storeIdFromState = useSelector((state) => state.storeId); // Get storeId from Redux state
  const [apiKey, setApiKey] = useState(apiKeyFromState || "");
  const [storeId, setStoreId] = useState(storeIdFromState || "");
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({
    pages: 0,
    categories: 0,
    products: 0,
  });
  const [totalCounts, setTotalCounts] = useState({
    pages: 0,
    categories: 0,
    products: 0,
  });
  const [errors, setErrors] = useState({ apiKey: "", storeId: "" });
  const [host, setHost] = useState(""); // Add this line

  useEffect(() => {
    setApiKey(apiKeyFromState);
    setStoreId(storeIdFromState);
  }, [apiKeyFromState, storeIdFromState]);

  const updateProgress = useCallback((type, synced, total) => {
    setProgress((prev) => ({ ...prev, [type]: synced }));
    setTotalCounts((prev) => ({ ...prev, [type]: total }));
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
      
      const host = getShopifyHost();
      
      // First, delete existing webhooks
      const deleteResponse = await fetch('/api/v1/delete-webhooks', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ host })
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete existing webhooks');
      }

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
      
      if (createResponse.ok && data.results) {
        const allWebhooksSuccessful = data.results.every(result => result.success);
        
        if (allWebhooksSuccessful) {
          toast.success('All webhooks activated successfully!');
          await checkWebhooks();
        } else {
          const failedWebhooks = data.results
            .filter(result => !result.success)
            .map(result => result.topic)
            .join(', ');
          
          toast.warning(`Some webhooks failed to activate: ${failedWebhooks}`);
        }
      } else {
        const errorMessage = data.error || 'Unknown error occurred';
        toast.error(`Failed to activate webhooks: ${errorMessage}`);
      }

    } catch (error) {
      console.error('Error activating webhooks:', error);
      toast.error('Error activating webhooks: ' + error.message);
    }
  };

  useEffect(() => {
    let eventSource;
    
    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/v1/sync-progress');

        eventSource.onopen = () => {
          console.log('SSE Connected');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('SSE message received:', data);
            
            if (data.type === 'connection') {
              console.log('SSE connection confirmed:', data.status);
              return;
            }
            
            setProgress((prev) => ({ ...prev, [data.type]: data.synced }));
            setTotalCounts((prev) => ({ ...prev, [data.type]: data.total }));
          } catch (error) {
            console.error('Error processing SSE message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE Error:', error);
          if (eventSource.readyState === EventSource.CLOSED) {
            console.log('SSE connection closed');
          }
        };

      } catch (error) {
        console.error('Error creating SSE connection:', error);
      }
    };

    if (syncing) {
      connectSSE();
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [syncing]);

  const renderProgressBar = (type) => {
    if (!syncing) return null;
    const currentProgress = progress[type];
    const total = totalCounts[type];
    const percentage = total ? (currentProgress / total) * 100 : 0;
    
    return (
      <Box padding="3">
        <Text as="p" variant="bodyMd">
          {type.charAt(0).toUpperCase() + type.slice(1)}: {currentProgress} / {total}
        </Text>
        <ProgressBar progress={percentage} size="small" />
      </Box>
    );
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
                  disabled={syncing || !apiKey || !storeId}
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
                <Text as="p">1. Add this code to your theme.liquid file just before the closing &lt;/body&gt; tag:</Text>
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderWidth="025"
                  borderRadius="200"
                >
                  <InlineStack align="space-between">
                    <code>{`<script async src="https://firebasestorage.googleapis.com/v0/b/braincommerce-prod.appspot.com/o/bc_bar_prod.js?alt=media&token=0bec0839-0454-4b4c-9ad9-0950f935f0bc" storeid="${storeId}"></script>`}</code>
                    <Button
                      variant="plain"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `<script async src="https://firebasestorage.googleapis.com/v0/b/braincommerce-prod.appspot.com/o/bc_bar_prod.js?alt=media&token=0bec0839-0454-4b4c-9ad9-0950f935f0bc" storeid="${storeId}"></script>`
                        );
                        toast.success('Code copied to clipboard!');
                      }}
                    >
                      Copy
                    </Button>
                  </InlineStack>
                </Box>
                <Text as="p">2. To edit your theme:</Text>
                <BlockStack gap="200">
                  <Text as="p">• Go to Online Store → Themes in your Shopify admin</Text>
                  <Text as="p">• Click "Customize" on your active theme</Text>
                  <Text as="p">• Click "Edit code" in the theme editor</Text>
                  <Text as="p">• Open the theme.liquid file</Text>
                  <Text as="p">• Paste the code just before the closing &lt;/body&gt; tag</Text>
                  <Text as="p">• Save the changes</Text>
                </BlockStack>
                <Text as="p">3. Click the "Activate Webhooks" button above to enable real-time updates</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card sectioned>
            <VideoThumbnail
              videoLength={80}
              thumbnailUrl="https://example.com/video-thumbnail.jpg"
              onClick={() => {
                window.open(
                  "https://braincommerce.io/how-to-create-account",
                  "_blank"
                );
              }}
            />
            <TextContainer>
              <Text as="p">
                Watch this video to learn how to create an account and get your
                API keys.
              </Text>
            </TextContainer>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
