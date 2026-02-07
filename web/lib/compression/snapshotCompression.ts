import zstd from "node-zstandard"; // or @mongodb-js/zstd
import lz4 from "lz4";

export type CompressionAlgo = "zstd" | "lz4";

export function compressSnapshot(
  input: Buffer,
  algo: CompressionAlgo,
): Buffer {
  switch (algo) {
    case "zstd":
      return zstd.compress(input, 3); // level 3 = good balance
    case "lz4":
      return lz4.encode(input);
    default:
      throw new Error(`Unsupported compression: ${algo}`);
  }
}

export function decompressSnapshot(
  input: Buffer,
  algo: CompressionAlgo,
): Buffer {
  switch (algo) {
    case "zstd":
      return zstd.decompress(input);
    case "lz4":
      return lz4.decode(input);
    default:
      throw new Error(`Unsupported compression: ${algo}`);
  }
}
