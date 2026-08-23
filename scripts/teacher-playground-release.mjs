import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, "..");
const packageDirectory = path.join(
  repositoryDirectory,
  "packages",
  "excalidraw",
);
const PACKAGE_ASSET_NAME = "package.tgz";

const toPosixPath = (value) => value.split(path.sep).join("/");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function listFiles(directory, prefix = "") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

const sha256 = async (filePath) =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

export function validateReleaseTag(tag, version) {
  const expectedTag = `teacher-playground-v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`Release tag must be ${expectedTag}; received ${tag}`);
  }
  return true;
}

export async function ensureDistPresent(sourcePackageDirectory) {
  const distDirectory = path.join(sourcePackageDirectory, "dist");
  try {
    const distStat = await stat(distDirectory);
    if (!distStat.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new Error(
      "--skip-build requires packages/excalidraw/dist; run the Node 22 package build first",
    );
  }
}

export async function prepareReleaseBundle({
  packageDirectory: sourcePackageDirectory,
  releaseCdnDirectory,
  packageName,
  tarballPath,
  version,
}) {
  const releaseDirectory = path.join(releaseCdnDirectory, "releases", version);
  await rm(releaseDirectory, { recursive: true, force: true });
  await mkdir(releaseDirectory, { recursive: true });
  await cp(
    path.join(sourcePackageDirectory, "dist"),
    path.join(releaseDirectory, "dist"),
    { recursive: true },
  );

  await cp(tarballPath, path.join(releaseDirectory, PACKAGE_ASSET_NAME));

  const distFiles = await listFiles(path.join(releaseDirectory, "dist"));
  const payloadPaths = [
    ...distFiles.map((file) => toPosixPath(path.join("dist", file))),
    PACKAGE_ASSET_NAME,
  ].sort();
  const files = await Promise.all(
    payloadPaths.map(async (relativePath) => {
      const absolutePath = path.join(releaseDirectory, relativePath);
      const fileStat = await stat(absolutePath);
      return {
        path: relativePath,
        size: fileStat.size,
        sha256: await sha256(absolutePath),
      };
    }),
  );

  const manifestPath = path.join(releaseDirectory, "manifest.json");
  const checksumsPath = path.join(releaseDirectory, "SHA256SUMS");
  const manifest = { name: packageName, version, files };
  const checksums = `${files
    .map((file) => `${file.sha256}  ${file.path}`)
    .join("\n")}\n`;
  await writeFile(manifestPath, stableJson(manifest));
  await writeFile(checksumsPath, checksums);

  const latestPath = path.join(releaseCdnDirectory, "latest.json");
  await mkdir(releaseCdnDirectory, { recursive: true });
  await writeFile(
    latestPath,
    stableJson({
      name: packageName,
      version,
      release: `releases/${version}`,
      dist: `releases/${version}/dist`,
      package: `releases/${version}/${PACKAGE_ASSET_NAME}`,
      manifest: `releases/${version}/manifest.json`,
      checksums: `releases/${version}/SHA256SUMS`,
    }),
  );

  return {
    checksumsPath,
    latestPath,
    manifestPath,
    releaseDirectory,
    tarballName: PACKAGE_ASSET_NAME,
  };
}

const runCommand = (name, args, options) =>
  execFileSync(
    process.platform === "win32" ? "cmd.exe" : name,
    process.platform === "win32" ? ["/d", "/c", name, ...args] : args,
    options,
  );

const run = async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );
  if (
    packageJson.name !== "@teacher-playground/excalidraw" ||
    packageJson.version !== "0.18.1-tp.1"
  ) {
    throw new Error(
      "packages/excalidraw/package.json must identify @teacher-playground/excalidraw@0.18.1-tp.1",
    );
  }

  const args = process.argv.slice(2);
  const tagArgumentIndex = args.indexOf("--tag");
  const tag =
    tagArgumentIndex >= 0
      ? args[tagArgumentIndex + 1]
      : process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
  if (tag) {
    validateReleaseTag(tag, packageJson.version);
  }
  const outputArgumentIndex = args.indexOf("--output");
  // Internal verification option: reuse a previously completed Node 22 build.
  const skipBuild = args.includes("--skip-build");
  const releaseCdnDirectory =
    outputArgumentIndex >= 0
      ? path.resolve(args[outputArgumentIndex + 1])
      : path.join(repositoryDirectory, "release", "cdn");
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "teacher-playground-excalidraw-release-"),
  );

  try {
    if (skipBuild) {
      await ensureDistPresent(packageDirectory);
    } else {
      runCommand(
        "corepack",
        [
          "yarn",
          ...(process.platform === "win32" ? ["--ignore-engines"] : []),
          "build:package",
        ],
        {
          cwd: repositoryDirectory,
          stdio: "inherit",
        },
      );
    }
    const packed = runCommand(
      "npm",
      ["pack", "--json", "--pack-destination", temporaryDirectory],
      {
        cwd: packageDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    const packResult = JSON.parse(packed);
    const tarballPath = path.join(temporaryDirectory, packResult[0].filename);
    const bundle = await prepareReleaseBundle({
      packageDirectory,
      releaseCdnDirectory,
      packageName: packageJson.name,
      tarballPath,
      version: packageJson.version,
    });
    process.stdout.write(`Prepared ${bundle.releaseDirectory}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await run();
}
