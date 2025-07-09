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




export default function App() {

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
