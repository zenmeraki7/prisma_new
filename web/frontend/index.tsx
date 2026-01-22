import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import AppBridgeProvider from "@shopify/app-bridge-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enTranslations from "@shopify/polaris/locales/en.json";

import "@shopify/polaris/build/esm/styles.css";
import App from "./App";

const queryClient = new QueryClient();

const host = new URLSearchParams(window.location.search).get("host");
const apiKey =
  document
    .querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')
    ?.content ?? "";

const root = ReactDOM.createRoot(
  document.getElementById("app") as HTMLElement,
);

root.render(
  <PolarisAppProvider i18n={enTranslations}>
    <AppBridgeProvider
      config={{
        apiKey,
        host: host!,
        forceRedirect: true,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppBridgeProvider>
  </PolarisAppProvider>,
);
