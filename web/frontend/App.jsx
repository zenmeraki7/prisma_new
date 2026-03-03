// FILE: web/frontend/App.tsx

import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";

import { QueryProvider, PolarisProvider } from "./components";
import { initGraphQLClient } from "./lib/graphqlClient";

// ──────────────────────────────────────────────────────────────
// Initialise GraphQL client singleton
// ──────────────────────────────────────────────────────────────
//
// This runs once when the module is loaded. All hooks that call
// getGraphQLClient() (useProductsByFilter, useFilterRegistry, etc.)
// will now have a configured client.
//

initGraphQLClient("/api/graphql", {
  // You can tune these later if needed
  // headers: { Authorization: `Bearer ${token}` },
  timeoutMs: 30_000,
});

export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <NavMenu>
            <a href="/" rel="home" />

            {/* <Route path="/history/:id" element={<BulkJobDetailsPg />} /> */}

            <a href="products">{t("NavigationMenu.Products")}</a>
            {/* <a href="filteredProductspage">{t("NavigationMenu.FilteredProductsPage")}</a> */}
            <a href="productsindexPage">
              {t("NavigationMenu.ProductsIndexPage")}
            </a>
            <a href="snapshotjobspage">
              {t("NavigationMenu.SnapshotJobsPage")}
            </a>
            <a href="/History">
              {t("NavigationMenu.History")}
            </a>
            <a href="/Import">
              {t("NavigationMenu.Import")}
            </a>
            <a href="/settings">
              {t("NavigationMenu.Settings")}
            </a>
            <a href="/spreadsheetEdit">
              {t("NavigationMenu.SpreadSheetEdit")}
            </a>
            <a href="/Export">
              {t("NavigationMenu.Export")}
            </a>
            <a href="/snapshotRunsPage">
              {t("NavigationMenu.SnapshotRunsPage")}
            </a>
          </NavMenu>

          <Routes pages={pages} />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}