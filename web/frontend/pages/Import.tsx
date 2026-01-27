import React from "react";
import {
  Page,
  Layout,
  Card,
  DropZone,
  Text,
  Badge,
  DataTable,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  EmptyState,
  Thumbnail,
  InlineCode,
  Divider,
  ProgressBar,
  Box,
} from "@shopify/polaris";
import {
  ImportIcon,
  DeleteIcon,
  NoteIcon,
} from "@shopify/polaris-icons";

type ImportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

type ImportJob = {
  id: string;
  fileName: string;
  createdAt: string;
  rows: number;
  status: ImportStatus;
  processedRows?: number;
  errorMessage?: string;
};

const DUMMY_IMPORTS: ImportJob[] = [
  {
    id: "IMP-001",
    fileName: "price-updates-dec.csv",
    createdAt: "2024-12-31 18:01",
    rows: 1200,
    status: "COMPLETED",
    processedRows: 1200,
  },
  {
    id: "IMP-002",
    fileName: "bad-handle-import.csv",
    createdAt: "2025-01-02 11:20",
    rows: 320,
    status: "FAILED",
    processedRows: 45,
    errorMessage: "Invalid product handle at row 46",
  },
  {
    id: "IMP-003",
    fileName: "inventory-sync.csv",
    createdAt: "2025-01-03 07:45",
    rows: 5400,
    status: "PROCESSING",
    processedRows: 3200,
  },
  {
    id: "IMP-004",
    fileName: "bulk-tag-update.csv",
    createdAt: "2025-01-05 14:30",
    rows: 890,
    status: "COMPLETED",
    processedRows: 890,
  },
];

function importStatusBadge(status: ImportStatus) {
  switch (status) {
    case "COMPLETED":
      return <Badge tone="success">Completed</Badge>;
    case "FAILED":
      return <Badge tone="critical">Failed</Badge>;
    case "PROCESSING":
      return <Badge tone="attention">Processing</Badge>;
    case "PENDING":
    default:
      return <Badge tone="info">Pending</Badge>;
  }
}

export default function ImportPage() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);

  const handleDropZoneDrop = React.useCallback(
    (_dropFiles: File[], acceptedFiles: File[]) => {
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
    []
  );

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleUpload = () => {
    setUploading(true);
    // Simulate upload
    setTimeout(() => {
      setUploading(false);
      setUploadSuccess(true);
      setFiles([]);
      setTimeout(() => setUploadSuccess(false), 5000);
    }, 2000);
  };

  const validFileUploads = files.length > 0;

  const rows = DUMMY_IMPORTS.map((imp) => {
    const progressContent =
      imp.status === "PROCESSING" && imp.processedRows ? (
        <BlockStack gap="100">
          <Text as="span" variant="bodySm">
            {imp.processedRows.toLocaleString()} / {imp.rows.toLocaleString()}
          </Text>
          <Box width="120px">
            <ProgressBar
              progress={(imp.processedRows / imp.rows) * 100}
              size="small"
            />
          </Box>
        </BlockStack>
      ) : imp.status === "FAILED" && imp.errorMessage ? (
        <Text as="span" variant="bodySm" tone="critical">
          {imp.processedRows?.toLocaleString() || 0} / {imp.rows.toLocaleString()}
        </Text>
      ) : (
        <Text as="span" variant="bodySm">
          {imp.rows.toLocaleString()}
        </Text>
      );

    return [
      <InlineCode>{imp.id}</InlineCode>,
      <InlineStack gap="200" blockAlign="center">
        <Thumbnail
          source={NoteIcon}
          alt="CSV file"
          size="small"
        />
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {imp.fileName}
        </Text>
      </InlineStack>,
      <Text as="span" variant="bodySm" tone="subdued">
        {imp.createdAt}
      </Text>,
      progressContent,
      importStatusBadge(imp.status),
      <InlineStack gap="100">
        <Button size="slim" variant="plain">
          View
        </Button>
        {imp.status === "FAILED" && (
          <Button size="slim" variant="plain">
            Retry
          </Button>
        )}
      </InlineStack>,
    ];
  });

  return (
    <Page
      title="Import Products"
      fullWidth
      subtitle="Upload CSV files to create bulk edit jobs"
      primaryAction={
        validFileUploads
          ? {
              content: uploading ? "Uploading..." : "Process imports",
              onAction: handleUpload,
              loading: uploading,
              icon: ImportIcon,
            }
          : undefined
      }
    >
      <Layout>
        {uploadSuccess && (
          <Layout.Section>
            <Banner
              title="Import started successfully"
              tone="success"
              onDismiss={() => setUploadSuccess(false)}
            >
              Your CSV files have been queued for processing. You can monitor progress below.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            {/* Upload Section */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Upload CSV Files
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Drop your CSV files containing product or variant data. We'll validate the format and generate a preview before processing.
                  </Text>
                </BlockStack>

                <DropZone
                  accept=".csv,text/csv,application/csv"
                  type="file"
                  onDrop={handleDropZoneDrop}
                  allowMultiple
                >
                  <DropZone.FileUpload
                    actionHint="Accepts .csv files"
                    actionTitle="Add files"
                  />
                </DropZone>

                {files.length > 0 && (
                  <>
                    <Divider />
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm" fontWeight="semibold">
                          Files ready to import ({files.length})
                        </Text>
                        <Button
                          variant="plain"
                          tone="critical"
                          onClick={() => setFiles([])}
                        >
                          Clear all
                        </Button>
                      </InlineStack>

                      <BlockStack gap="200">
                        {files.map((file) => (
                          <Card key={file.name} roundedAbove="sm">
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="300" blockAlign="center">
                                <Thumbnail
                                  source={NoteIcon}
                                  alt="CSV file"
                                  size="small"
                                />
                                <BlockStack gap="050">
                                  <Text as="p" variant="bodyMd" fontWeight="medium">
                                    {file.name}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {(file.size / 1024).toFixed(2)} KB
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <Button
                                icon={DeleteIcon}
                                variant="plain"
                                tone="critical"
                                onClick={() => removeFile(file.name)}
                                accessibilityLabel={`Remove ${file.name}`}
                              />
                            </InlineStack>
                          </Card>
                        ))}
                      </BlockStack>

                      <Banner tone="info">
                        <Text as="p" variant="bodySm">
                          Review your files before processing. Each CSV will be validated for proper formatting and required columns.
                        </Text>
                      </Banner>
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Import History */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">
                      Import History
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Track the status of your recent import jobs
                    </Text>
                  </BlockStack>
                  <Button variant="plain">View all imports</Button>
                </InlineStack>

                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Import ID",
                    "File Name",
                    "Created",
                    "Progress",
                    "Status",
                    "Actions",
                  ]}
                  rows={rows}
                  hoverable
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  CSV Format Guide
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Your CSV must include these required columns:
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • <InlineCode>product_id</InlineCode> or <InlineCode>handle</InlineCode>
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • <InlineCode>variant_id</InlineCode> (for variant updates)
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • At least one editable field (price, inventory, tags, etc.)
                  </Text>
                </BlockStack>
                <Divider />
                <Button
                  variant="plain"
                  onClick={() => window.open("/sample-template.csv", "_blank")}
                >
                  Download sample template
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Import Limits
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Max file size
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      50 MB
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Max rows per file
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      50,000
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Concurrent imports
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      5
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Need Help?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Learn more about CSV imports and troubleshooting common errors.
                </Text>
                <Button
                  variant="plain"
                  onClick={() => window.open("https://docs.zenmeraki.com/imports", "_blank")}
                >
                  View documentation
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}