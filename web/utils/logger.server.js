// FILE: web/utils/logger.server.js

const isProd = process.env.NODE_ENV === "production";

function format(level, message, meta) {
  const timestamp = new Date().toISOString();
  return {
    timestamp,
    level,
    message,
    ...(meta || {}),
  };
}

export default {
  info(message, meta) {
    console.log(JSON.stringify(format("info", message, meta)));
  },

  warn(message, meta) {
    console.warn(JSON.stringify(format("warn", message, meta)));
  },

  error(message, meta) {
    console.error(JSON.stringify(format("error", message, meta)));
  },

  debug(message, meta) {
    if (!isProd) {
      console.debug(JSON.stringify(format("debug", message, meta)));
    }
  },
};