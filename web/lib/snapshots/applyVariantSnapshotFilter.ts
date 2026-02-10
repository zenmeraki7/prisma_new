import { prisma } from "../../db/prisma.js";

export type VariantFilter = {
    key: string;
    op: string;
    value: any;
    value2?: any;
};

/**
 * Deterministic planHash from filters so snapshotFilter and trigger use the same run.
 */
export function computePlanHashFromFilters(filters: VariantFilter[]): string {
    if (!filters?.length) return "pf_0";
    const clauses = [...filters]
        .filter((f) => f && typeof f.key === "string")
        .map((f) => ({ key: f.key, op: f.op, value: f.value }))
        .sort((a, b) => a.key.localeCompare(b.key));
    const ast = { op: "and" as const, clauses, groups: [] as any[] };
    const json = JSON.stringify(ast);
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
        const chr = json.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0;
    }
    return `pf_${(hash >>> 0).toString(16)}`;
}

export async function applyVariantSnapshotFilter({
    planHash: planHashParam,
    shopId,
    filters,
}: {
    planHash?: string;
    shopId: string;
    filters: VariantFilter[];
}): Promise<string[]> {
    const planHash =
        planHashParam && typeof planHashParam === "string"
            ? planHashParam
            : computePlanHashFromFilters(filters ?? []);

    if (!prisma) throw new Error("Prisma client not initialized");

    // 1. Find successful run (scoped by shop)
    const run = await prisma.snapshotRun.findFirst({
        where: {
            planHash,
            shopId,
            state: "SUCCEEDED",
        },
        orderBy: { createdAt: "desc" },
    });

    if (!run) {
        return [];
    }

    // 2. Get products
    const snapshotProducts = await prisma.snapshotProduct.findMany({
        where: { snapshotRunId: run.id },
        select: { productId: true },
    });

    return snapshotProducts.map((p) => p.productId);
}
