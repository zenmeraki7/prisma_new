import { decompressSnapshot } from "../../lib/compression/snapshotCompression";

const rows = await prisma.snapshotProduct.findMany({
  where: {
    snapshotRunId: plan.snapshotRunId,
    ...plan.where,
  },
  orderBy: plan.orderBy,
  take: first + 1,
  cursor: after ? { id: after } : undefined,
  skip: after ? 1 : 0,
});

const items = rows.map((r) => {
  const buf = decompressSnapshot(
    Buffer.from(r.dataCompressed),
    r.compression as any,
  );
  return JSON.parse(buf.toString("utf8"));
});
