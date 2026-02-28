// web/config/dataPlaneConfig.js
const mode = process.env.DATA_PLANE_MODE || "mongo_only"; 
// "mongo_only" | "dual_write" | "pg_only"

export function isDualWrite() { return mode === "dual_write"; }
export function isPgOnly() { return mode === "pg_only"; }
export function isMongoOnly() { return mode === "mongo_only"; }