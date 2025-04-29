import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { QueryProvider, PolarisProvider } from "./components";
import { PersistGate } from "redux-persist/integration/react";
import { persistor, store } from "./store";
import { Provider } from "react-redux";
import { useEffect } from "react"; // import useEffect

export default function App() {
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  useEffect(() => {
    // Detect if inside iframe
    if (window.top !== window.self) {
      const params = new URLSearchParams(window.location.search);
      const shop = params.get("shop");
      const host = params.get("host");

      if (shop && host) {
        const redirectUri = encodeURIComponent(
          `https://${window.location.hostname}/?shop=${shop}&host=${host}`
        );
        window.location.assign(`/exitiframe?redirectUri=${redirectUri}`);
      }
    }
  }, []);

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
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
            </PersistGate>
          </Provider>
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
