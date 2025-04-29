import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { QueryProvider, PolarisProvider } from "./components";
import { PersistGate } from 'redux-persist/integration/react'; // Import PersistGate
import { persistor, store } from './store'; // Import persistor and store
import { Provider } from 'react-redux'; // Import Provider from react-redux

import { useEffect } from "react";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@shopify/app-bridge-react";

function useShopifyAuthRedirect() {
  const app = useAppBridge();

  useEffect(() => {
    // Check for authUrl in the query string (set by backend)
    const params = new URLSearchParams(window.location.search);
    const authUrl = params.get("authUrl");
    const shop = params.get("shop");

    if (authUrl && app) {
      Redirect.create(app).dispatch(Redirect.Action.REMOTE, authUrl);
    } else if (!authUrl && shop && window.top === window.self) {
      // Not embedded, fallback to normal redirect
      window.location.href = `/api/auth?shop=${encodeURIComponent(shop)}`;
    }
  }, [app]);
}

export default function App() {
  useShopifyAuthRedirect();
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <Provider store={store}> {/* Wrap with Provider */}
            <PersistGate loading={null} persistor={persistor}> {/* Add PersistGate */}
              <ToastContainer
                    position="top-right"
                    autoClose={5000}
                    hideProgressBar={false}
                    newestOnTop={false}
                    closeOnClick
                    rtl={true}
                    pauseOnFocusLoss
                    draggable
                    pauseOnHover
                  />
              <NavMenu>
                <a href="/" rel="home" />
              </NavMenu>
              <Routes pages={pages} />
            </PersistGate> {/* Close PersistGate */}
          </Provider> {/* Close Provider */}
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
