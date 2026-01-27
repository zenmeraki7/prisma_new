import React from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Select,
  Checkbox,
  TextField,
  Badge,
  Banner,
  Divider,
  RadioButton,
  ChoiceList,
  Box,
  Icon,
  ProgressBar,
} from "@shopify/polaris";
import {
  ExportIcon,

} from "@shopify/polaris-icons";

type ExportFormat = "csv" | "xlsx" | "json" | "xml";
type ExportScope = "all" | "filtered" | "selected";

type Product = {
  id: string;
  title: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  vendor: string;
  image?: string | null;
  price: string;
  sku: string;
};

type ExportHistory = {
  id: string;
  name: string;
  format: string;
  records: number;
  date: string;
  status: "completed" | "processing" | "failed";
  size: string;
};

const SELECTED_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    title: "Ablestar Slayer Tee",
    status: "ACTIVE",
    vendor: "ABHISHEK STOR",
    price: "19.99",
    sku: "ABL-TEE-001",
    image: null,
  },
  {
    id: "prod-2",
    title: "Fast Plane Cap",
    status: "ACTIVE",
    vendor: "ABHISHEK STOR",
    price: "14.99",
    sku: "FAST-CAP-001",
    image: null,
  },
  {
    id: "prod-3",
    title: "Bulk Editor Hoodie",
    status: "DRAFT",
    vendor: "Premium Brands",
    price: "49.99",
    sku: "BULK-HOOD-001",
    image: null,
  },
];

const EXPORT_HISTORY: ExportHistory[] = [
  {
    id: "EXP-001",
    name: "All Active Products",
    format: "CSV",
    records: 1423,
    date: "2025-01-20 14:30",
    status: "completed",
    size: "2.4 MB",
  },
  {
    id: "EXP-002",
    name: "Low Stock Items",
    format: "XLSX",
    records: 89,
    date: "2025-01-19 09:15",
    status: "completed",
    size: "156 KB",
  },
  {
    id: "EXP-003",
    name: "Products with Images",
    format: "JSON",
    records: 2156,
    date: "2025-01-18 16:45",
    status: "processing",
    size: "—",
  },
];

export default function ExportPage() {
  const [format, setFormat] = React.useState<ExportFormat>("csv");
  const [scope, setScope] = React.useState<ExportScope>("selected");
  const [exportName, setExportName] = React.useState(
    "Selected Products Export",
  );

  const [selectedFields, setSelectedFields] = React.useState<string[]>([
    "title",
    "price",
    "sku",
    "vendor",
    "status",
  ]);
  const [showBanner, setShowBanner] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [selectedProducts, setSelectedProducts] =
    React.useState<Product[]>(SELECTED_PRODUCTS);

  const handleExport = () => {
    setIsExporting(true);
    // Simulate export
    setTimeout(() => {
      setIsExporting(false);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 5000);
    }, 3000);
  };

  const fieldOptions = [
    { label: "Product Title", value: "title" },
    { label: "Price", value: "price" },
    { label: "Compare at Price", value: "comparePrice" },
    { label: "SKU", value: "sku" },
    { label: "Barcode", value: "barcode" },
    { label: "Inventory", value: "inventory" },
    { label: "Weight", value: "weight" },
    { label: "Vendor", value: "vendor" },
    { label: "Product Type", value: "type" },
    { label: "Tags", value: "tags" },
    { label: "Status", value: "status" },
    { label: "Created At", value: "createdAt" },
  ];
  const mid = Math.ceil(fieldOptions.length / 2);
  const leftFields = fieldOptions.slice(0, mid);
  const rightFields = fieldOptions.slice(mid);
  const formatOptions = [
    { label: "CSV (Comma Separated)", value: "csv" },
    { label: "Excel (XLSX)", value: "xlsx" },
    { label: "JSON", value: "json" },
    { label: "XML", value: "xml" },
  ];

  const estimatedRecords =
    scope === "all"
      ? 2453
      : scope === "filtered"
      ? 1423
      : selectedProducts.length;

  return (
    <Page
      title="Export Products"
      subtitle="Configure and export your selected products"
      backAction={{ content: "Products", url: "/Products" }}
      primaryAction={{
        content: isExporting ? "Exporting..." : "Start Export",
        onAction: handleExport,
        loading: isExporting,
        icon: ExportIcon,
        disabled:
          !exportName ||
          selectedFields.length === 0 ||
          selectedProducts.length === 0,
      }}
      secondaryActions={[
        {
          content: "Back to Products",
          url: "/Products",
        },
      ]}
    >
      <Layout>
        {showBanner && (
          <Layout.Section>
            <Banner
              title="Export completed successfully"
              tone="success"
              onDismiss={() => setShowBanner(false)}
            >
              Your export file with {selectedProducts.length} products is ready
              for download. Check your downloads folder or the export history
              below.
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
                {selectedProducts.length === 0 ? (
                  <Banner tone="warning">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm">
                        No products selected. Please select products from the
                        Products page to export.
                      </Text>
                      <Button url="/Products" size="slim">
                        Browse Products
                      </Button>
                    </InlineStack>
                  </Banner>
                ) : (
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      {`${selectedProducts.length} ${
                        selectedProducts.length === 1 ? "product" : "products"
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
                      Export Tips
                    </Text>
                  <BlockStack gap="200">
  {[
    "Select products from the Products page",
    "Remove products by clicking the trash icon",
    "CSV format works with Excel and Google Sheets",
    "XLSX preserves formatting and formulas",
    "Exports are available for 30 days",
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