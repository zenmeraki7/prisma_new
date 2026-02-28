// FILE: web/controllers/bulkService/bulkEditMetaController.pg.js

import {
  getBulkEditFieldDefsForFrontend,
} from "../../services/bulkService/bulkEditRegistry.server.js";

export function getBulkEditFieldDefsController(req, res) {
  const defs = getBulkEditFieldDefsForFrontend();
  res.json({ fields: defs });
}