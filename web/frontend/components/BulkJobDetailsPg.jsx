import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  DataTable,
  Banner,
  InlineStack,
  ProgressBar,
  Box,
  BlockStack,
  Thumbnail,
  EmptyState,
  Icon,
  Spinner,
  Button,
} from "@shopify/polaris";
import {
  ClockIcon,
  PlayIcon,
  CheckIcon,
  XIcon,
} from "@shopify/polaris-icons";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";

const BulkJobDetailsPg = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [job, setJob] = useState(null);
  const [isLoadingJob, setIsLoadingJob] = useState(true);
  const [jobError, setJobError] = useState(null);

  const [changes, setChanges] = useState([]);
  const [isLoadingChanges, setIsLoadingChanges] = useState(true);
  const [changesError, setChangesError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalChanges, setTotalChanges] = useState(0);

  const itemsPerPage = 10;

  /* ──────────────────────────────────────────────────────────────
   * Helpers
   * ─────────────────────────────────────────────────────────── */

  const handleBack = useCallback(() => navigate("/history"), [navigate]);

  function formatDurationMs(startedAt, finishedAt) {
    if (!startedAt || !finishedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    const ms = end - start;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  const jobStatus = job?.status?.toLowerCase();

  const jobStatusMeta = useMemo(() => {
    if (!jobStatus) return { tone: "subdued", label: "Unknown", icon: ClockIcon };

    if (jobStatus === "completed") {
      return { tone: "success", label: t("Completed") || "Completed", icon: CheckIcon };
    }
    if (jobStatus === "failed") {
      return { tone: "critical", label: t("Failed") || "Failed", icon: XIcon };
    }
    if (jobStatus === "running") {
      return { tone: "info", label: t("Processing") || "Processing", icon: PlayIcon };
    }
    if (jobStatus === "pending" || jobStatus === "queued") {
      return { tone: "attention", label: t("Pending") || "Pending", icon: ClockIcon };
    }

    if (jobStatus === "canceled") {
      return { tone: "subdued", label: t("Canceled") || "Canceled", icon: XIcon };
    }

    return { tone: "subdued", label: job?.status || "Unknown", icon: ClockIcon };
  }, [jobStatus, job, t]);

  const canDownload = jobStatus === "completed" && changes.length > 0;

  /* ──────────────────────────────────────────────────────────────
   * Fetch job details
   * ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const fetchJob = async () => {
      if (!id) {
        setJobError("No job ID provided");
        setIsLoadingJob(false);
        return;
      }

      try {
        setIsLoadingJob(true);
        setJobError(null);
        const res = await fetch(`/api/pg/bulk/jobs/${id}`);
        if (!res.ok) throw new Error(`Failed to fetch bulk job`);
        const data = await res.json();
        setJob(data);
      } catch (err) {
        setJobError(err.message || "Unknown error");
      } finally {
        setIsLoadingJob(false);
      }
    };

    fetchJob();
  }, [id]);

  /* ──────────────────────────────────────────────────────────────
   * Fetch changes (edit_history rows aggregated per field)
   * ─────────────────────────────────────────────────────────── */

  const fetchChanges = useCallback(
    async (page = 1) => {
      if (!id) return;

      try {
        setChangesError(null);
        setIsLoadingChanges(true);

        const res = await fetch(
          `/api/pg/edit-history/by-bulk/${id}?page=${page}&limit=${itemsPerPage}`,
        );
        if (!res.ok) throw new Error("Failed to fetch changes");

        const data = await res.json();
        setChanges(data.items || []);
        setTotalPages(data.totalPages || 1);
        setTotalChanges(data.totalCount || 0);
        setCurrentPage(page);
      } catch (err) {
        setChangesError(err.message || "Unknown error");
      } finally {
        setIsLoadingChanges(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchChanges(1);
  }, [id, fetchChanges]);

  /* ──────────────────────────────────────────────────────────────
   * Polling for job progress
   * ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!job) return;
    const activeStatuses = ["pending", "queued", "running"];
    const isActive = activeStatuses.includes(jobStatus);
    if (!isActive) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pg/bulk/jobs/${id}`);
        if (!res.ok) {
          console.warn("Bulk job polling failed, but continuing...");
          return;
        }
        const data = await res.json();
        setJob(data);

        const newStatus = data.status?.toLowerCase();
        const stillActive = activeStatuses.includes(newStatus);

        // If job just completed/failed/canceled, refresh changes.
        if (!stillActive) {
          fetchChanges(currentPage);
          clearInterval(interval);
        }
      } catch (err) {
        console.warn("Bulk job polling error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [job, jobStatus, id, currentPage, fetchChanges]);

  /* ──────────────────────────────────────────────────────────────
   * Download logs as CSV
   * ─────────────────────────────────────────────────────────── */

  const handleDownloadLogs = useCallback(() => {
    if (!job || changes.length === 0) return;

    const csvData = changes.map((change) => ({
      ProductTitle: change.productTitle || "",
      ProductID: change.productId || "",
      VariantTitle: change.variantTitle || "",
      VariantID: change.variantId || "",
      Scope: change.scope || "PRODUCT",
      Field: change.field || "",
      OldValue: change.oldValue ?? "",
      NewValue: change.newValue ?? "",
      BulkJobID: job.id,
      ShopID: job.shop_id,
      JobType: job.job_type,
      Status: job.status,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bulk-job-${job.id}-changes-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [job, changes]);

  /* ──────────────────────────────────────────────────────────────
   * Loading / error
   * ─────────────────────────────────────────────────────────── */

  if (isLoadingJob) {
    return (
      <Page
        fullWidth
        title={t("LoadingDetails") || "Loading Details..."}
        backAction={{ content: t("History") || "History", onAction: handleBack }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="500">
                <InlineStack align="center" gap="300">
                  <Spinner size="large" />
                  <Text tone="subdued">
                    {t("Loadingbulkjobdetails") || "Loading job details..."}
                  </Text>
                </InlineStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (jobError) {
    return (
      <Page
        fullWidth
        title={t("Error") || "Error"}
        backAction={{ content: t("History") || "History", onAction: handleBack }}
      >
        <Banner tone="critical">{jobError}</Banner>
      </Page>
    );
  }

  if (!job) return null;

  /* ──────────────────────────────────────────────────────────────
   * Progress / stats
   * ─────────────────────────────────────────────────────────── */

  const stats = job.stats || {};
  const processed = stats.processed ?? stats.succeeded ?? 0;
  const total =
    stats.total ??
    stats.expected ??
    stats.succeeded ??
    stats.processed ??
    0;

  const completion = total ? Math.round((processed / total) * 100) : 0;

  const durationText = formatDurationMs(job.started_at, job.finished_at);

  /* ──────────────────────────────────────────────────────────────
   * Table rows
   * ─────────────────────────────────────────────────────────── */

  const rows = (changes || []).map((item, index) => {
    const image =
      item.productImage ||
      "https://www.otithee.com/img/fallback/fallback-2.png";

    const title =
      item.scope === "VARIANT" && item.variantTitle
        ? `${item.productTitle || ""} - ${item.variantTitle}`
        : item.productTitle || "";

    return [
      <InlineStack key={index} gap="300" wrap={false}>
        <Thumbnail source={image} alt="product" size="small" />
        <BlockStack inlineAlign="start">
          <div style={{ maxWidth: "220px" }}>
            <Text truncate fontWeight="semibold">
              {title || t("Untitledproduct") || "Untitled product"}
            </Text>
          </div>
          <Text tone="subdued" variant="bodySm">
            {item.scope === "VARIANT"
              ? t("scope.variant") || "Variant"
              : t("scope.product") || "Product"}
          </Text>
        </BlockStack>
      </InlineStack>,
      <Text fontWeight="semibold">{item.field || "N/A"}</Text>,
      <BlockStack>
        <Text variant="bodyMd" tone="subdued" as="span">
          <s>{item.oldValue != null ? String(item.oldValue) : "N/A"}</s>
        </Text>
        <Text>
          {item.newValue != null ? String(item.newValue) : "N/A"}
        </Text>
      </BlockStack>,
    ];
  });

  /* ──────────────────────────────────────────────────────────────
   * Render
   * ─────────────────────────────────────────────────────────── */

  const jobTitle =
    job.input_payload?.title ||
    job.job_type ||
    t("BulkEditJob") ||
    "Bulk Edit Job";

  return (
    <Page
      fullWidth
      title={jobTitle}
      backAction={{ content: t("History") || "History", onAction: handleBack }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={jobStatusMeta.tone} icon={jobStatusMeta.icon}>
            {jobStatusMeta.label}
          </Badge>
        </InlineStack>
      }
      secondaryActions={[
        {
          content: t("DownloadLogs") || "Download Logs",
          onAction: handleDownloadLogs,
          disabled: !canDownload,
        },
      ]}
    >
      <Layout>
        {/* Main Job Progress */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={jobStatusMeta.icon} />
                    <Text variant="headingMd">
                      {t("EditProgress") || "Edit Progress"}
                    </Text>
                  </InlineStack>
                  <Badge tone={jobStatusMeta.tone}>
                    {jobStatusMeta.label}
                  </Badge>
                </InlineStack>

                <ProgressBar
                  progress={completion}
                  animated={jobStatus === "running"}
                  size="small"
                  tone="primary"
                />

                <InlineStack align="space-between">
                  <Text tone="subdued">
                    {t("itemsProcessed", {
                      actual: processed,
                      totalItems: total,
                    }) ||
                      `${processed} / ${total} items processed`}
                  </Text>
                  {durationText && (
                    <Text tone="subdued">
                      {(t("Duration") || "Duration") + ": "} {durationText}
                    </Text>
                  )}
                </InlineStack>

                {job.error_summary && (
                  <Banner tone="critical">
                    <Text>{job.error_summary}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Changes */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd">
                    {t("ProductChanges") || "Product changes"}
                  </Text>
                  <Text tone="subdued">
                    {(t("Showing") || "Showing") + " "}
                    {(currentPage - 1) * itemsPerPage + 1}-
                    {Math.min(currentPage * itemsPerPage, totalChanges)}{" "}
                    {t("of") || "of"} {totalChanges}
                  </Text>
                </InlineStack>
              </BlockStack>
            </Box>

            {isLoadingChanges ? (
              <Box padding="400">
                <InlineStack gap="200">
                  <Spinner size="small" />
                  <Text tone="subdued">
                    {t("Loadingchanges") || "Loading changes..."}
                  </Text>
                </InlineStack>
              </Box>
            ) : changesError ? (
              <Box padding="400">
                <Banner tone="critical">{changesError}</Banner>
              </Box>
            ) : rows.length > 0 ? (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={[
                    t("Product") || "Product",
                    t("Field") || "Field",
                    t("Change") || "Change",
                  ]}
                  rows={rows}
                />

                {totalPages > 1 && (
                  <Box padding="400">
                    <InlineStack align="center" gap="300">
                      <Button
                        disabled={currentPage === 1}
                        onClick={() => fetchChanges(currentPage - 1)}
                      >
                        {t("Previous") || "Previous"}
                      </Button>

                      <Text>
                        {(t("Page") || "Page") + " "}
                        {currentPage} {t("of") || "of"} {totalPages}
                      </Text>

                      <Button
                        disabled={currentPage === totalPages}
                        onClick={() => fetchChanges(currentPage + 1)}
                      >
                        {t("Next") || "Next"}
                      </Button>
                    </InlineStack>
                  </Box>
                )}
              </>
            ) : (
              <EmptyState
                heading={t("Noproductschanged") || "No products changed"}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default BulkJobDetailsPg;