// FILE: web/repositories/bulkEdit.repository.js

import { prisma } from "../db/prisma.js";

export async function createBulkEditJob({
  shopId,
  scope,
  action,
  fieldKey,
  filterExprJson,
  rawFilterExprJson,
  compiledWhereJson,
  selectionMode,
  editPayloadJson,
  idempotencyKey,
  mutationName,
}) {
  const existing =
    idempotencyKey &&
    (await prisma.bulkEditJob.findFirst({
      where: {
        shopId,
        idempotencyKey,
      },
    }));

  if (existing) return existing;

  return prisma.bulkEditJob.create({
    data: {
      shopId,
      scope,
      action,
      fieldKey,
      filterExprJson: filterExprJson ?? null,
      rawFilterExprJson: rawFilterExprJson ?? null,
      compiledWhereJson: compiledWhereJson ?? null,
      selectionMode: selectionMode ?? null,
      editPayloadJson,
      idempotencyKey,
      mutationName,
      status: "QUEUED",
    },
  });
}

export async function getBulkEditJobById({ shopId, jobId }) {
  return prisma.bulkEditJob.findFirst({
    where: {
      id: jobId,
      shopId,
    },
    include: {
      items: {
        take: 200,
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function getBulkEditJobInternalById(jobId) {
  return prisma.bulkEditJob.findUnique({
    where: { id: jobId },
  });
}

export async function updateBulkEditJob({
  jobId,
  data,
}) {
  return prisma.bulkEditJob.update({
    where: { id: jobId },
    data,
  });
}

export async function createBulkEditJobItems({
  jobId,
  shopId,
  items,
}) {
  if (!Array.isArray(items) || items.length === 0) return { count: 0 };

  return prisma.bulkEditJobItem.createMany({
    data: items.map((item) => ({
      jobId,
      shopId,
      inputLineNumber: item.inputLineNumber ?? null,
      productId: item.productId ?? null,
      productGid: item.productGid ?? null,
      variantId: item.variantId ?? null,
      variantGid: item.variantGid ?? null,
      inputJson: item.inputJson ?? null,
      resultJson: item.resultJson ?? null,
      userErrorsJson: item.userErrorsJson ?? null,
      success: item.success ?? null,
      errorMessage: item.errorMessage ?? null,
    })),
  });
}

export async function updateBulkEditJobItemsForLine({
  jobId,
  inputLineNumber,
  data,
}) {
  return prisma.bulkEditJobItem.updateMany({
    where: {
      jobId,
      inputLineNumber,
    },
    data,
  });
}

export async function listBulkEditJobItems({
  jobId,
  shopId,
  success,
  take = 100,
}) {
  return prisma.bulkEditJobItem.findMany({
    where: {
      jobId,
      shopId,
      ...(typeof success === "boolean" ? { success } : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
    take,
  });
}

export async function listAllFailedBulkEditJobItems({
  jobId,
  shopId,
}) {
  return prisma.bulkEditJobItem.findMany({
    where: {
      jobId,
      shopId,
      success: false,
    },
    orderBy: [
      { inputLineNumber: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export async function findBulkEditJobByBulkOperationId({
  shopId,
  bulkOperationId,
}) {
  return prisma.bulkEditJob.findFirst({
    where: {
      shopId,
      bulkOperationId,
    },
  });
}

export async function markBulkEditJobFailed({
  jobId,
  errorMessage,
}) {
  return prisma.bulkEditJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      errorMessage: errorMessage?.slice(0, 5000) ?? "Unknown error",
      completedAt: new Date(),
    },
  });
}

export async function listBulkEditJobs({
  shopId,
  take = 20,
}) {
  return prisma.bulkEditJob.findMany({
    where: {
      shopId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take,
    include: {
      items: {
        take: 20,
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}