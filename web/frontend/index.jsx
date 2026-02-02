import React from "react";
import ReactDOM from "react-dom/client";

// Shopify Polaris
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

// Shopify App Bridge React v4
// ❌ No Provider export in v4, so don't import it.
// You can still import hooks/components (useAppBridge, Modal, TitleBar, etc.) elsewhere.
// import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";

// React Query
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// i18n utility
import { initI18n } from "./utils/i18nUtils";

// App
import App from "./App";

const queryClient = new QueryClient();

// You no longer need host for a Provider config in v4, but keep it if you
// use it elsewhere. It's safe to delete if unused.
const host = new URLSearchParams(window.location.search).get("host");
const apiKey =
  document.querySelector('meta[name="shopify-api-key"]')?.content ?? "";

if (!host || !apiKey) {
  console.error("Missing App Bridge host or apiKey");
}

initI18n().then(() => {
  const rootElement = document.getElementById("app");
  if (!rootElement) {
    console.error("No #app element found");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <PolarisAppProvider i18n={enTranslations}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </PolarisAppProvider>
  );
});
