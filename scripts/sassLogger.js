const isCi = process.env.CI === "true";

function createSassLogger({ ci = isCi, warn = console.warn } = {}) {
  return {
    warn(message, options) {
      const isDeprecationSummary =
        /repetitive deprecation warnings omitted/i.test(message);
      if (ci && (options?.deprecation === true || isDeprecationSummary)) {
        return;
      }
      warn(message, options);
    },
  };
}

function createSassPluginOptions(options) {
  return { logger: createSassLogger(options) };
}

module.exports = { createSassLogger, createSassPluginOptions };
