import React, { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Select,
  TextField,
  Badge,
  Banner,
  Divider,
  ChoiceList,
  Box,
  ProgressBar,
} from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useMutation } from "@tanstack/react-query";
import type { AppBridgeState } from "@shopify/app-bridge-react";

type ExportFormat = "csv" | "json";

type CreateSnapshotResponse = {
  snapshotRunId: string;
  reused: boolean;
};

type DownloadExportResponse = {
  data: string;
  filename: string;
};

/* ----------------------- */
/* GraphQL Mutations       */
/* ----------------------- */

async function createSnapshotMutation(
  app: AppBridgeState,
  productIds: string[]
): Promise<CreateSnapshotResponse> {
  const response = await fetch("shopify:admin/api/graphql.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        mutation CreateSnapshot($productIds: [String!]!) {
          createSnapshot(productIds: $productIds) {
            snapshotRunId
            reused
          }
        }
      `,
      variables: { productIds },
    }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message || "Failed to create snapshot");
  }
  return json.data.createSnapshot;
}

async function downloadExportMutation(
  app: AppBridgeState,
  snapshotRunId: string,
  format: string
): Promise<DownloadExportResponse> {
  const response = await fetch("shopify:admin/api/graphql.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        mutation DownloadExport($snapshotRunId: ID!, $format: String!) {
          downloadExport(snapshotRunId: $snapshotRunId, format: $format) {
            data
            filename
          }
        }
      `,
      variables: { snapshotRunId, format },
    }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message || "Failed to download export");
  }
  return json.data.downloadExport;
}

/* ----------------------- */
/* Export Page Component   */
/* ----------------------- */

export default function ExportPage() {
  const app = useAppBridge();

  // Get selected products from localStorage (passed from Products page)
  const selectedProductIds = React.useMemo(() => {
    try {
      const stored = localStorage.getItem("selectedProductIds");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const [format, setFormat] = useState<ExportFormat>("csv");
  const [exportName, setExportName] = useState("Selected Products Export");
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "title",
    "price",
    "vendor",
    "status",
  ]);

  const [snapshotRunId, setSnapshotRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "info" | "warning" | "critical";
    text: string;
  } | null>(null);

  // Create Snapshot Mutation
  const createSnapshot = useMutation({
    mutationFn: async () => {
      if (!app) throw new Error("App not ready");
      return createSnapshotMutation(app, selectedProductIds);
    },
    onSuccess: (data) => {
      setSnapshotRunId(data.snapshotRunId);
      setMessage({
        type: data.reused ? "info" : "success",
        text: data.reused
          ? "Using existing snapshot"
          : "Snapshot created successfully!",
      });
    },
    onError: (error: Error) => {
      setMessage({
        type: "critical",
        text: error.message || "Failed to create snapshot",
      });
    },
  });

  // Download Export Mutation
  const downloadExport = useMutation({
    mutationFn: async () => {
      if (!app || !snapshotRunId) throw new Error("Snapshot not ready");
      return downloadExportMutation(app, snapshotRunId, format);
    },
    onSuccess: (data) => {
      // Create download link
      const blob = new Blob([data.data], {
        type: format === "csv" ? "text/csv" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: "success",
        text: "Export downloaded successfully!",
      });
    },
    onError: (error: Error) => {
      setMessage({
        type: "critical",
        text: error.message || "Failed to download export",
      });
    },
  });

  const handleCreateSnapshot = () => {
    setMessage(null);
    createSnapshot.mutate();
  };

  const handleDownload = () => {
    setMessage(null);
    downloadExport.mutate();
  };

  const fieldOptions = [
    { label: "Product Title", value: "title" },
    { label: "Price", value: "price" },
    { label: "Vendor", value: "vendor" },
    { label: "Product Type", value: "type" },
    { label: "Status", value: "status" },
    { label: "Tags", value: "tags" },
    { label: "Inventory", value: "inventory" },
    { label: "Handle", value: "handle" },
  ];

  const mid = Math.ceil(fieldOptions.length / 2);
  const leftFields = fieldOptions.slice(0, mid);
  const rightFields = fieldOptions.slice(mid);

  const formatOptions = [
    { label: "CSV (Comma Separated)", value: "csv" },
    { label: "JSON", value: "json" },
  ];

  const isSnapshotReady = !!snapshotRunId;
  const isCreating = createSnapshot.isPending;
  const isDownloading = downloadExport.isPending;

  return (
    <Page
      title="Export Products"
      subtitle="Configure and export your selected products"
      backAction={{ content: "Products", url: "/app" }}
      primaryAction={
        isSnapshotReady
          ? {
              content: isDownloading ? "Downloading..." : "Download Export",
              onAction: handleDownload,
              loading: isDownloading,
              icon: ExportIcon,
              disabled: selectedFields.length === 0,
            }
          : {
              content: isCreating ? "Creating Snapshot..." : "Create Snapshot",
              onAction: handleCreateSnapshot,
              loading: isCreating,
              icon: ExportIcon,
              disabled:
                !exportName ||
                selectedFields.length === 0 ||
                selectedProductIds.length === 0,
            }
      }
      secondaryActions={[
        {
          content: "Back to Products",
          url: "/app",
        },
      ]}
    >
      <Layout>
        {/* Message Banner */}
        {message && (
          <Layout.Section>
            <Banner
              title={
                message.type === "success"
                  ? "Success"
                  : message.type === "critical"
                  ? "Error"
                  : "Info"
              }
              tone={message.type}
              onDismiss={() => setMessage(null)}
            >
              {message.text}
            </Banner>
          </Layout.Section>
        )}

        {/* Progress Indicator */}
        {isCreating && (
          <Layout.Section>
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  Creating snapshot for {selectedProductIds.length} products...
                </Text>
                <ProgressBar progress={50} size="small" />
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        {isDownloading && (
          <Layout.Section>
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  Generating export file...
                </Text>
                <ProgressBar progress={75} size="small" />
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            {/* Export Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd" fontWeight="semibold">
                  Export Configuration
                </Text>

                <Divider />

                {/* Selection Info Banner */}
                {selectedProductIds.length === 0 ? (
                  <Banner tone="warning">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm">
                        No products selected. Please select products from the
                        Products page to export.
                      </Text>
                      <Button url="/app" size="slim">
                        Browse Products
                      </Button>
                    </InlineStack>
                  </Banner>
                ) : (
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      {`${selectedProductIds.length} ${
                        selectedProductIds.length === 1 ? "product" : "products"
                      } selected and ready to export`}
                    </Text>
                  </Banner>
                )}

                {/* Export Name */}
                <TextField
                  label="Export name"
                  value={exportName}
                  onChange={setExportName}
                  placeholder="e.g., Active Products January 2025"
                  autoComplete="off"
                  helpText="Give your export a descriptive name for easy identification"
                />

                {/* Format Selection */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    File Format
                  </Text>
                  <Select
                    label="Format"
                    labelHidden
                    options={formatOptions}
                    value={format}
                    onChange={(value) => setFormat(value as ExportFormat)}
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Field Selection and Tips Row */}
            <Layout>
              <Layout.Section>
                <Box paddingBlockEnd="400">
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h2" variant="headingMd" fontWeight="semibold">
                          Field Selection
                        </Text>
                        <Badge tone="info">
                          {`${selectedFields.length} fields selected`}
                        </Badge>
                      </InlineStack>

                      <Divider />

                      <InlineStack gap="400" align="start">
                        <Box minWidth="220px">
                          <ChoiceList
                            title=""
                            titleHidden
                            choices={leftFields}
                            selected={selectedFields}
                            onChange={setSelectedFields}
                            allowMultiple
                          />
                        </Box>

                        <Box minWidth="220px">
                          <ChoiceList
                            title=""
                            titleHidden
                            choices={rightFields}
                            selected={selectedFields}
                            onChange={setSelectedFields}
                            allowMultiple
                          />
                        </Box>
                      </InlineStack>

                      {selectedFields.length === 0 && (
                        <Banner tone="warning">
                          <Text as="p" variant="bodySm">
                            Please select at least one field to export
                          </Text>
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>
                </Box>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd" fontWeight="semibold">
                      How Snapshots Work
                    </Text>
                    <BlockStack gap="200">
                      {[
                        "Snapshot captures product data at a point in time",
                        "Multiple exports can use the same snapshot",
                        "Snapshots are cached for faster subsequent exports",
                        "Exports remain available for 30 days",
                        "Download in multiple formats from one snapshot",
                      ].map((tip) => (
                        <Text key={tip} as="p" variant="bodyMd" tone="subdued">
                          • {tip}
                        </Text>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}