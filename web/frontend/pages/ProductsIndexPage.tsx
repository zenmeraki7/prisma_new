import React, { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Tabs,
  IndexTable,
  Text,
  Badge,
  Box,
  Spinner,
} from "@shopify/polaris";
import { useAppBridge, type AppBridgeState } from "@shopify/app-bridge-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  snapshotRunsRequest,
  type SnapshotRunDto,
} from "../queries/snapshotHistory";

/* ---------------------------------------------------
   Snapshot Hooks
--------------------------------------------------- */
function useSnapshotRuns(app: AppBridgeState | undefined) {
  return useInfiniteQuery<
    { runs: SnapshotRunDto[]; nextCursor: string | null },
    Error
  >({
    queryKey: ["snapshotRuns"],
    enabled: !!app,
    queryFn: async () => {
      if (!app) throw new Error("AppBridge not ready");
      return snapshotRunsRequest(app, { limit: 25 });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
  });
}

/* ---------------------------------------------------
   Status Tone Helper
--------------------------------------------------- */
function snapshotStatusTone(
  state: SnapshotRunDto["state"],
): "success" | "critical" | "attention" | "subdued" {
  switch (state) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "critical";
    case "RUNNING":
    case "QUEUED":
      return "attention";
    default:
      return "subdued";
  }
}

/* ---------------------------------------------------
   Snapshot Jobs Tab
--------------------------------------------------- */
function SnapshotJobsTab() {
  const app = useAppBridge();
  const runsQuery = useSnapshotRuns(app);

  const allRuns = useMemo(
    () => runsQuery.data?.pages.flatMap((p) => p.runs) ?? [],
    [runsQuery.data],
  );

  return (
    <Layout.Section>
      <Card>
        <Box padding="400">
          {runsQuery.isLoading && <Spinner />}

          {!runsQuery.isLoading && allRuns.length === 0 && (
            <Text as="p" tone="subdued">
              No snapshot runs yet.
            </Text>
          )}

          {!runsQuery.isLoading && allRuns.length > 0 && (
            <IndexTable
              resourceName={{
                singular: "snapshot run",
                plural: "snapshot runs",
              }}
              itemCount={allRuns.length}
              headings={[
                { title: "ID" },
                { title: "Started At" },
                { title: "Status" },
              ]}
              selectedItemsCount={0}
              onSelectionChange={() => {}}
            >
              {allRuns.map((run, idx) => (
                <IndexTable.Row key={run.id} id={run.id} position={idx}>
                  <IndexTable.Cell>{run.id}</IndexTable.Cell>

                  <IndexTable.Cell>
                    {new Date(run.createdAt).toLocaleString()}
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Badge tone={snapshotStatusTone(run.state)}>
                      {run.state}
                    </Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Box>
      </Card>
    </Layout.Section>
  );
}

/* ---------------------------------------------------
   Products Tab (Dummy)
--------------------------------------------------- */
function ProductsTab() {
  return (
    <Layout.Section>
      <Card>
        <Box padding="400">
          <Text as="p">Products will load here...</Text>
        </Box>
      </Card>
    </Layout.Section>
  );
}

/* ---------------------------------------------------
   Main Page
--------------------------------------------------- */
export default function ProductsIndexPage() {
  const [selectedTab, setSelectedTab] = useState(0);

  const tabs = [
    { id: "products", content: "Products" },
    { id: "snapshots", content: "Snapshots" },
  ];

  return (
    <Page title="Products">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

      <Layout>
        {selectedTab === 0 && <ProductsTab />}
        {selectedTab === 1 && <SnapshotJobsTab />}
      </Layout>
    </Page>
  );
}
