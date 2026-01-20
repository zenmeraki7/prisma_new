// web/frontend/index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {AppProvider as PolarisAppProvider} from "@shopify/polaris";
import {Provider as AppBridgeProvider} from "@shopify/app-bridge-react";
import enTranslations from "@shopify/polaris/locales/en.json";

import "@shopify/polaris/build/esm/styles.css";

import App from "./App";

type AppBridgeConfig = {
  apiKey: string;
  host: string;
  forceRedirect: boolean;
};

function getAppBridgeConfig(): AppBridgeConfig | undefined {
  const host = new URLSearchParams(window.location.search).get("host");
  const apiKey = document
    .querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')
    ?.content;

  if (!host || !apiKey) {
    console.warn("Missing host or shopify-api-key meta tag for App Bridge");
    return undefined;
  }

  return {
    apiKey,
    host,
    forceRedirect: true,
  };
}

const appBridgeConfig = getAppBridgeConfig();

const container = document.getElementById("app")!;
const root = ReactDOM.createRoot(container);

if (!appBridgeConfig) {
  root.render(
    <PolarisAppProvider i18n={enTranslations}>
      <div style={{padding: 16}}>
        App Bridge configuration missing. Make sure to inject the
        <code>shopify-api-key</code> meta tag and <code>host</code> query param.
      </div>
    </PolarisAppProvider>,
  );
} else {
  root.render(
    <PolarisAppProvider i18n={enTranslations}>
      <AppBridgeProvider config={appBridgeConfig}>
        <App />
      </AppBridgeProvider>
    </PolarisAppProvider>,
  );
}
