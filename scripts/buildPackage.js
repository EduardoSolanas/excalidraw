const path = require("path");
const { readdir, rm } = require("fs/promises");
const { build } = require("esbuild");
const { sassPlugin } = require("esbuild-sass-plugin");
const { createSassPluginOptions } = require("./sassLogger");
const { parseEnvVariables } = require("../packages/excalidraw/env.cjs");

const ENV_VARS = {
  development: {
    ...parseEnvVariables(`${__dirname}/../.env.development`),
    DEV: true,
  },
  production: {
    ...parseEnvVariables(`${__dirname}/../.env.production`),
    PROD: true,
  },
};

// excludes all external dependencies and bundles only the source code
const getConfig = (outdir) => ({
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  packages: "external",
  plugins: [sassPlugin(createSassPluginOptions())],
  target: "es2020",
  assetNames: "[dir]/[name]",
  chunkNames: "[dir]/[name]-[hash]",
  alias: {
    "@excalidraw/excalidraw": path.resolve(__dirname, "../packages/excalidraw"),
    "@excalidraw/utils": path.resolve(__dirname, "../packages/utils"),
    "@excalidraw/math": path.resolve(__dirname, "../packages/math"),
  },
  loader: {
    ".woff2": "file",
  },
});

function buildDev(config) {
  return build({
    ...config,
    sourcemap: true,
    define: {
      "import.meta.env": JSON.stringify(ENV_VARS.development),
    },
  });
}

function buildProd(config) {
  return build({
    ...config,
    minify: true,
    define: {
      "import.meta.env": JSON.stringify(ENV_VARS.production),
    },
  });
}

const createESMRawBuild = async () => {
  const chunksConfig = {
    entryPoints: ["index.tsx", "**/*.chunk.ts"],
    entryNames: "[name]",
  };

  // development unminified build with source maps
  await buildDev({
    ...getConfig("dist/dev"),
    ...chunksConfig,
  });

  // production minified buld without sourcemaps
  await buildProd({
    ...getConfig("dist/prod"),
    ...chunksConfig,
  });

  await Promise.all([
    pruneChineseAssets("dist/dev"),
    pruneChineseAssets("dist/prod"),
  ]);
};

const pruneChineseAssets = async (outdir) => {
  const localesDirectory = path.join(outdir, "locales");
  const localeFiles = await readdir(localesDirectory);
  await Promise.all(
    localeFiles
      .filter((file) => /^zh-(?:CN|HK|TW)-/.test(file))
      .map((file) => rm(path.join(localesDirectory, file), { force: true })),
  );
  await rm(path.join(outdir, "fonts", "Xiaolai"), {
    recursive: true,
    force: true,
  });
};

(async () => {
  await createESMRawBuild();
})();
