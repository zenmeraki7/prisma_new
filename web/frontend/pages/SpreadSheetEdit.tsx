import React from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  TextField,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Divider,
  Select,
  Checkbox,
  InlineCode,
  Box,
  Tooltip,
} from "@shopify/polaris";
import {
  EditIcon,
  RefreshIcon,
  ExportIcon,
} from "@shopify/polaris-icons";

type SpreadsheetRow = {
  id: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  inventory: string;
  weight: string;
  selected?: boolean;
};

const INITIAL_ROWS: SpreadsheetRow[] = [
  {
    id: "var-1",
    productTitle: "Ablestar Slayer Tee",
    variantTitle: "Black / M",
    sku: "ABL-TEE-BLK-M",
    price: "19.99",
    compareAtPrice: "29.99",
    inventory: "45",
    weight: "0.25",
    selected: false,
  },
  {
    id: "var-2",
    productTitle: "Ablestar Slayer Tee",
    variantTitle: "Black / L",
    sku: "ABL-TEE-BLK-L",
    price: "19.99",
    compareAtPrice: "29.99",
    inventory: "32",
    weight: "0.25",
    selected: false,
  },
  {
    id: "var-3",
    productTitle: "Ablestar Slayer Tee",
    variantTitle: "White / M",
    sku: "ABL-TEE-WHT-M",
    price: "19.99",
    compareAtPrice: "29.99",
    inventory: "28",
    weight: "0.25",
    selected: false,
  },
  {
    id: "var-4",
    productTitle: "Fast Plane Cap",
    variantTitle: "One Size",
    sku: "FAST-CAP-OS",
    price: "14.99",
    compareAtPrice: "",
    inventory: "120",
    weight: "0.15",
    selected: false,
  },
  {
    id: "var-5",
    productTitle: "Bulk Editor Hoodie",
    variantTitle: "Gray / L",
    sku: "BULK-HOOD-GRY-L",
    price: "49.99",
    compareAtPrice: "69.99",
    inventory: "18",
    weight: "0.65",
    selected: false,
  },
];

type EditableField = "price" | "compareAtPrice" | "inventory" | "weight";

export default function SpreadsheetEditPage() {
  const [rows, setRows] = React.useState<SpreadsheetRow[]>(INITIAL_ROWS);
  const [dirty, setDirty] = React.useState(false);
  const [changeCount, setChangeCount] = React.useState(0);
  const [showBanner, setShowBanner] = React.useState(false);
  const [bulkEditField, setBulkEditField] = React.useState<string>("price");
  const [bulkEditValue, setBulkEditValue] = React.useState("");

  const updateCell = (
    rowId: string,
    key: EditableField,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, [key]: value } : row
      )
    );
    setDirty(true);
    setChangeCount((prev) => prev + 1);
  };

  const toggleRowSelection = (rowId: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, selected: !row.selected } : row
      )
    );
  };

  const toggleSelectAll = () => {
    const allSelected = rows.every((row) => row.selected);
    setRows((prev) =>
      prev.map((row) => ({ ...row, selected: !allSelected }))
    );
  };

  const handleReset = () => {
    setRows(INITIAL_ROWS);
    setDirty(false);
    setChangeCount(0);
  };

  const handleCommit = () => {
    console.log("Submitting spreadsheet changes", rows);
    setDirty(false);
    setShowBanner(true);
    setChangeCount(0);
    setTimeout(() => setShowBanner(false), 5000);
  };

  const handleBulkEdit = () => {
    if (!bulkEditValue) return;
    
    setRows((prev) =>
      prev.map((row) =>
        row.selected
          ? { ...row, [bulkEditField]: bulkEditValue }
          : row
      )
    );
    setDirty(true);
    setBulkEditValue("");
  };

  const selectedCount = rows.filter((row) => row.selected).length;
  const allSelected = rows.length > 0 && rows.every((row) => row.selected);

  const tableRows = rows.map((row) => [
    <Checkbox
      label="Select row"
      labelHidden
      checked={row.selected || false}
      onChange={() => toggleRowSelection(row.id)}
    />,
    <BlockStack gap="050">
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {row.productTitle}
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {row.variantTitle}
      </Text>
    </BlockStack>,
    <InlineCode>{row.sku}</InlineCode>,
    <Box width="100px">
      <TextField
        key={`${row.id}-price`}
        label="Price"
        labelHidden
        value={row.price}
        onChange={(value) => updateCell(row.id, "price", value)}
        autoComplete="off"
        prefix="$"
        type="number"
      />
    </Box>,
    <Box width="100px">
      <TextField
        key={`${row.id}-compare`}
        label="Compare at price"
        labelHidden
        value={row.compareAtPrice}
        onChange={(value) => updateCell(row.id, "compareAtPrice", value)}
        autoComplete="off"
        prefix="$"
        type="number"
      />
    </Box>,
    <Box width="80px">
      <TextField
        key={`${row.id}-inventory`}
        label="Inventory"
        labelHidden
        value={row.inventory}
        onChange={(value) => updateCell(row.id, "inventory", value)}
        autoComplete="off"
        type="number"
      />
    </Box>,
    <Box width="90px">
      <TextField
        key={`${row.id}-weight`}
        label="Weight"
        labelHidden
        value={row.weight}
        onChange={(value) => updateCell(row.id, "weight", value)}
        autoComplete="off"
        suffix="kg"
        type="number"
      />
    </Box>,
  ]);

  const bulkEditOptions = [
    { label: "Price", value: "price" },
    { label: "Compare at price", value: "compareAtPrice" },
    { label: "Inventory", value: "inventory" },
    { label: "Weight", value: "weight" },
  ];

  return (
    <Page
      title="Spreadsheet Editor"
      fullWidth
      subtitle="Edit multiple variants inline and commit changes"
      primaryAction={{
        content: dirty ? `Commit ${changeCount} changes` : "Commit changes",
        disabled: !dirty,
        onAction: handleCommit,
        icon: EditIcon,
      }}
      secondaryActions={[
        {
          content: "Reset",
          onAction: handleReset,
          disabled: !dirty,
          icon: RefreshIcon,
        },
        {
          content: "Export",
          onAction: () => console.log("Exporting..."),
          icon: ExportIcon,
        },
        {
          content: "Import CSV",
          onAction: () => console.log("Importing..."),
        },
      ]}
    >
      <Layout>
        {showBanner && (
          <Layout.Section>
            <Banner
              title="Changes committed successfully"
              tone="success"
              onDismiss={() => setShowBanner(false)}
            >
              Your bulk edit job has been queued and will process {rows.length} variants. You can monitor progress in the History page.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            {/* Bulk Edit Actions */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Bulk Edit Actions
                  </Text>
                  {selectedCount > 0 && (
                    <Badge tone="info">{`${selectedCount} selected`}</Badge>
                  )}
                </InlineStack>

                <Divider />

                <InlineStack gap="300" blockAlign="end">
                  <Box width="180px">
                    <Select
                      label="Field to edit"
                      options={bulkEditOptions}
                      value={bulkEditField}
                      onChange={setBulkEditField}
                    />
                  </Box>
                  <Box width="140px">
                    <TextField
                      label="New value"
                      value={bulkEditValue}
                      onChange={setBulkEditValue}
                      autoComplete="off"
                      placeholder="Enter value"
                    />
                  </Box>
                  <Button
                    onClick={handleBulkEdit}
                    disabled={selectedCount === 0 || !bulkEditValue}
                  >
                    Apply to selected
                  </Button>
                </InlineStack>

                {selectedCount > 0 && (
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Bulk edit will update {selectedCount} selected {selectedCount === 1 ? "variant" : "variants"}
                    </Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* Spreadsheet Grid */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">
                      Variant Grid
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {rows.length} variants loaded • {dirty ? `${changeCount} unsaved changes` : "No changes"}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button
                      variant="plain"
                      onClick={toggleSelectAll}
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                <Divider />

                <Box overflowX="scroll">
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "",
                      "Product / Variant",
                      "SKU",
                      "Price",
                      "Compare Price",
                      "Inventory",
                      "Weight",
                    ]}
                    rows={tableRows}
                    hoverable
                  />
                </Box>

                {dirty && (
                  <Banner tone="warning">
                    <Text as="p" variant="bodySm">
                      You have {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}. Remember to commit your changes when ready.
                    </Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Quick Stats */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Session Stats
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Total variants
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {rows.length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Selected
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {selectedCount}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Unsaved changes
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {changeCount}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Status
                    </Text>
                    {dirty ? (
                      <Badge tone="warning">Modified</Badge>
                    ) : (
                      <Badge tone="success">Saved</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Tips */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Editing Tips
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Select multiple rows for bulk editing
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Changes are tracked but not saved until committed
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Use Reset to discard all changes
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Export to CSV for external editing
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Import CSV to bulk load changes
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Info */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  About Spreadsheet Mode
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Edit variants directly in a spreadsheet-like interface. Changes are validated and queued as a bulk job when committed.
                </Text>
                <Button
                  variant="plain"
                  onClick={() =>
                    window.open("https://docs.zenmeraki.com/spreadsheet", "_blank")
                  }
                >
                  Learn more
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}