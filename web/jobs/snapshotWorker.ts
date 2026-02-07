import { compressSnapshot } from "../lib/compression/snapshotCompression";

const COMPRESSION: "zstd" = "zstd";

let productCount = 0;
let approxBytes = 0n;

for await (const product of bulkOpStream) {
  const json = Buffer.from(JSON.stringify(product), "utf8");

  const compressed = compressSnapshot(json, COMPRESSION);

  productCount++;
  approxBytes += BigInt(compressed.length);

  await prisma.snapshotProduct.create({
    data: {
      id: product.id,
      shopId,
      snapshotRunId,
      productId: product.id,
      dataCompressed: compressed,
      compression: COMPRESSION,
    },
  });
}

await prisma.snapshotRun.update({
  where: { id: snapshotRunId },
  data: {
    productCount,
    approxBytes,
    state: "SUCCEEDED",
    completedAt: new Date(),
    expiresAt: computeSnapshotExpiresAt({ productCount, approxBytes }),
  },
});
