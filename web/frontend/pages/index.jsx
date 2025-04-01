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
          <img src="../assets/brain_commerce_logo.svg" alt="brain_commerce_image" width="200px" />
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
                {/* <Button
                  onClick={checkWebhooks}
                  variant="primary"
                  tone="success"
                  size="large"
                  disabled={syncing}
                >
                  check webhooks
                </Button> */}
                <Link url="https://www.braincommerce.io/entry/signup" external>
                  Create an account on Brain Commerce
                </Link>
              </InlineStack>
              {/* {syncing && (
                <Card sectioned>
                  <BlockStack gap="400">
                    <Text variant="headingMd">Sync Progress</Text>
                    {renderProgressBar('pages')}
                    {renderProgressBar('products')}
                    {renderProgressBar('categories')}
                  </BlockStack>
                </Card>
              )} */}
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
