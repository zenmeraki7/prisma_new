// web/frontend/pages/SnapshotJobsPage.tsx
import React, { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Box,
  Spinner,
  Banner,
  Modal,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { AppBridgeState } from "@shopify/app-bridge-react";

import {
  snapshotRunsRequest,
  snapshotRunEventsRequest,
  type SnapshotRunDto,
  type SnapshotRunEventDto,
} from "../queries/snapshotHistory";

function useSnapshotRuns(app: AppBridgeState | undefined) {
  return useInfiniteQuery({
    enabled: !!app,
    queryKey: ["snapshotRuns"],
    queryFn: async ({ pageParam }) => {
      if (!app) throw new Error("AppBridge not ready");
      return snapshotRunsRequest(app, {
        first: 25,
        after: pageParam ?? null,
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ? lastPage.nextCursor : undefined,
  });
}

function useSnapshotRunEvents(
  app: AppBridgeState | undefined,
  runId: string | null
) {
  return useInfiniteQuery({
    enabled: !!app && !!runId,
    queryKey: ["snapshotRunEvents", runId],
    queryFn: async ({ pageParam }) => {
      if (!app || !runId) throw new Error("AppBridge or runId not ready");
      return snapshotRunEventsRequest(app, {
        runId,
        first: 50,
        after: pageParam ?? null,
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ? lastPage.nextCursor : undefined,
  });
}

function statusTone(
  status: SnapshotRunDto["status"]
): "success" | "critical" | "attention" | "subdued" {
  switch (status) {
    case "COMPLETED":
      return "success";      // green
    case "FAILED":
      return "critical";     // red
    case "RUNNING":
    case "INGESTING":
    case "QUEUED":
      return "attention";    // yellow
    default:
      return "subdued";      // grey fallback
  }
}

export default function SnapshotJobsPage() {
  const app = useAppBridge();
  const runsQuery = useSnapshotRuns(app);

  const [selectedRun, setSelectedRun] = useState<SnapshotRunDto | null>(null);

  const eventsQuery = useSnapshotRunEvents(app, selectedRun?.id ?? null);

  const allRuns: SnapshotRunDto[] = useMemo(() => {
    if (!runsQuery.data) return [];
    return runsQuery.data.pages.flatMap((p) => p.runs);
  }, [runsQuery.data]);

  const loadingInitial = runsQuery.isLoading;
  const loadingMore = runsQuery.isFetchingNextPage;

  const resourceName = {
    singular: "snapshot run",
    plural: "snapshot runs",
  };

  const handleRowClick = (run: SnapshotRunDto) => {
    setSelectedRun(run);
  };

  const closeModal = () => {
    setSelectedRun(null);
  };

  const runEvents: SnapshotRunEventDto[] = useMemo(() => {
    if (!eventsQuery.data) return [];
    return eventsQuery.data.pages.flatMap((p) => p.events);
  }, [eventsQuery.data]);

  return (
    <Page title="Snapshot jobs">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              {loadingInitial && (
                <InlineStack align="center" blockAlign="center" gap="200">
                  <Spinner />
                  <Text as="p" variant="bodyMd">
                    Loading snapshot runs…
                  </Text>
                </InlineStack>
              )}

              {!loadingInitial && !allRuns.length && (
                <Banner tone="info">
                  <p>No snapshot runs yet.</p>
                  <p>
                    Snapshots will be created automatically when filters require
                    SNAPSHOT mode.
                  </p>
                </Banner>
              )}
            </Box>

            {!loadingInitial && allRuns.length > 0 && (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={allRuns.length}
                  selectedItemsCount={0}
                  onSelectionChange={() => {}}
                  headings={[
                    { title: "Created" },
                    { title: "Status" },
                    { title: "Progress" },
                    { title: "Filter" },
                    { title: "Plan hash" },
                    { title: "Error" },
                  ]}
                >
                  {allRuns.map((run, index) => (
                    <IndexTable.Row
                      id={run.id}
                      key={run.id}
                      position={index}
                      onClick={() => handleRowClick(run)}
                    >
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm">
                          {new Date(run.createdAt).toLocaleString()}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Badge tone={statusTone(run.status)}>
                          {run.status}
                        </Badge>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm">
                          {run.total > 0
                            ? `${run.progress}/${run.total}`
                            : run.status === "COMPLETED"
                            ? "Completed"
                            : run.status === "RUNNING" ||
                              run.status === "INGESTING"
                            ? "In progress"
                            : "—"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {run.filterSummary || "—"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {run.planHash.slice(0, 10)}…
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {run.errorMessage ? (
                          <Text as="span" tone="critical" variant="bodySm">
                            {run.errorMessage.slice(0, 60)}
                            {run.errorMessage.length > 60 ? "…" : ""}
                          </Text>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            —
                          </Text>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                <Box padding="400">
                  {runsQuery.hasNextPage && (
                    <InlineStack align="center" blockAlign="center">
                      <button
                        type="button"
                        onClick={() => runsQuery.fetchNextPage()}
                        disabled={loadingMore}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--p-radius-200)",
                          border: "1px solid var(--p-color-border-subdued)",
                          background: "white",
                          cursor: loadingMore ? "default" : "pointer",
                        }}
                      >
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    </InlineStack>
                  )}
                </Box>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Modal for events */}
      <Modal
        open={!!selectedRun}
        onClose={closeModal}
        title={
          selectedRun
            ? `Run ${selectedRun.id.slice(0, 8)}… (${selectedRun.status})`
            : "Run details"
        }
        large
      >
        <Modal.Section>
          {selectedRun && (
            <BlockStack gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                Plan hash: <code>{selectedRun.planHash}</code>
              </Text>

              {selectedRun.filterSummary && (
                <Text as="p" variant="bodySm">
                  Filter: {selectedRun.filterSummary}
                </Text>
              )}

              {selectedRun.errorMessage && (
                <Banner tone="critical">
                  <p>{selectedRun.errorMessage}</p>
                </Banner>
              )}

              {eventsQuery.isLoading && (
                <InlineStack align="center" gap="200" blockAlign="center">
                  <Spinner />
                  <Text as="p" variant="bodyMd">
                    Loading events…
                  </Text>
                </InlineStack>
              )}

              {!eventsQuery.isLoading && !runEvents.length && (
                <Text as="p" variant="bodySm" tone="subdued">
                  No events recorded for this run.
                </Text>
              )}

              {!eventsQuery.isLoading &&
                runEvents.length > 0 &&
                runEvents.map((ev) => (
                  <Box
                    key={ev.id}
                    padding="200"
                    borderColor="border-subdued"
                    borderWidth="025"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge
                          tone={
                            ev.kind === "ERROR"
                              ? "critical"
                              : ev.kind === "WARNING"
                              ? "attention"
                              : "subdued"
                          }
                        >
                          {ev.kind}
                        </Badge>
                        <Text as="span" variant="bodySm">
                          {ev.message || "—"}
                        </Text>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {new Date(ev.createdAt).toLocaleString()}
                      </Text>
                    </InlineStack>
                  </Box>
                ))}

              {eventsQuery.hasNextPage && (
                <InlineStack align="center" blockAlign="center">
                  <button
                    type="button"
                    onClick={() => eventsQuery.fetchNextPage()}
                    disabled={eventsQuery.isFetchingNextPage}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "var(--p-radius-200)",
                      border: "1px solid var(--p-color-border-subdued)",
                      background: "white",
                      cursor: eventsQuery.isFetchingNextPage
                        ? "default"
                        : "pointer",
                    }}
                  >
                    {eventsQuery.isFetchingNextPage
                      ? "Loading…"
                      : "Load more events"}
                  </button>
                </InlineStack>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
