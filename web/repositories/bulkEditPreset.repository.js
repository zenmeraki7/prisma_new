// FILE: web/repositories/bulkEditPreset.repository.js

import { prisma } from "../db/prisma.js";

export async function listBulkEditPresets({
  shopId,
  take = 50,
  includeArchived = false,
}) {
  return prisma.bulkEditPreset.findMany({
    where: {
      shopId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [
      { isFavorite: "desc" },
      { updatedAt: "desc" },
    ],
    take,
  });
}

export async function getBulkEditPresetById({
  shopId,
  presetId,
}) {
  return prisma.bulkEditPreset.findFirst({
    where: {
      id: presetId,
      shopId,
    },
  });
}

export async function createBulkEditPreset({
  shopId,
  name,
  description,
  scope,
  fieldKey,
  action,
  valueJson,
  filterExprJson,
  isFavorite = false,
}) {
  return prisma.bulkEditPreset.create({
    data: {
      shopId,
      name,
      description: description ?? null,
      scope,
      fieldKey,
      action,
      valueJson,
      filterExprJson,
      isFavorite,
    },
  });
}

export async function updateBulkEditPreset({
  shopId,
  presetId,
  data,
}) {
  return prisma.bulkEditPreset.updateMany({
    where: {
      id: presetId,
      shopId,
    },
    data,
  });
}

export async function archiveBulkEditPreset({
  shopId,
  presetId,
}) {
  return prisma.bulkEditPreset.updateMany({
    where: {
      id: presetId,
      shopId,
    },
    data: {
      isArchived: true,
    },
  });
}