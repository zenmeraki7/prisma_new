// FILE: web/frontend/pages/SnapshotRunsPage.tsx

import React, { useState, useCallback } from "react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  InlineStack,
  Button,
  Pagination,
  Select,
  BlockStack,
} from "@shopify/polaris";
import { useSnapshotRuns, type SnapshotRunStatus } from "../queries/snapshotRuns";

function statusTone(status: SnapshotRunStatus): "attention" | "success" | "critical" | "subdued" {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
    case "INGESTING":
      return "attention";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "critical";
    default:
      return "subdued";
  }
}

function formatDate(dt: string | null | undefined): string {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString();
}

export default function SnapshotRunsPage() {
  const [statusFilter, setStatusFilter] = useState<SnapshotRunStatus | "ALL">(
    "ALL",
  );
  const [after, setAfter] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useSnapshotRuns({
    first: 20,
    after,
    status: statusFilter,
  });

  const runs = data?.edges ?? [];

  const handleStatusChange = useCallback(
    (val: string) => {
      setStatusFilter(val as SnapshotRunStatus | "ALL");
      setAfter(null); // reset pagination when filter changes
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (data?.pageInfo.hasNextPage && data.pageInfo.endCursor) {
      setAfter(data.pageInfo.endCursor);
    }
  }, [data]);

  const handlePrevious = useCallback(() => {
    // Simple backwards strategy: just reset for now
    // (If you want real backwards cursoring, you can store a stack of cursors)
    setAfter(null);
  }, []);

  const resourceName = {
    singular: "snapshot run",
    plural: "snapshot runs",
  };

  const statusOptions = [
    { label: "All statuses", value: "ALL" },
    { label: "Queued", value: "QUEUED" },
    { label: "Running", value: "RUNNING" },
    { label: "Ingesting", value: "INGESTING" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
  ];

  return (
    <Page title="Snapshot Runs">
      <BlockStack gap="400">
        {isError && (
          <Text as="p" tone="critical">
            {String((error as any)?.message ?? "Failed to load snapshot runs")}
          </Text>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                History
              </Text>

              <InlineStack gap="200" blockAlign="center">
                <Select
                  label="Status"
                  labelHidden
                  options={statusOptions}
                  value={statusFilter}
                  onChange={handleStatusChange}
                />
                {data && (
                  <Text as="span" tone="subdued">
                    Total: {data.totalCount}
                  </Text>
                )}
              </InlineStack>
            </InlineStack>

            <IndexTable
              resourceName={resourceName}
              itemCount={runs.length}
              selectable={false}
              headings={[
                { title: "Status" },
                { title: "Created at" },
                { title: "Candidate count" },
                { title: "Bulk op status" },
                { title: "Error" },
                { title: "Actions" },
              ]}
              loading={isLoading}
            >
              {runs.map(({ node }, index) => (
                <IndexTable.Row id={node.id} key={node.id} position={index}>
                  <IndexTable.Cell>
                    <Badge tone={statusTone(node.status)}>{node.status}</Badge>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">{formatDate(node.createdAt)}</Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">
                      {node.candidateCount ?? "-"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">
                      {node.bulkOperationStatus ?? "-"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" tone="critical" truncate>
                      {node.errorMessage ?? ""}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <InlineStack gap="100">
                      {node.bulkOperationUrl && (
                        <Button
                          variant="tertiary"
                          url={node.bulkOperationUrl}
                          target="_blank"
                        >
                          Download JSONL
                        </Button>
                      )}
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}

              {runs.length === 0 && !isLoading && (
                <IndexTable.Row id="empty" position={0}>
                  <IndexTable.Cell colSpan={6}>
                    <Text as="p" tone="subdued">
                      No snapshot runs yet. Run an SEO snapshot from the Products page.
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              )}
            </IndexTable>

            {data && (
              <InlineStack align="center" blockAlign="center">
                <Pagination
                  hasPrevious={Boolean(after)}
                  hasNext={data.pageInfo.hasNextPage}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                />
              </InlineStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
