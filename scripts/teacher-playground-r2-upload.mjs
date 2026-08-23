import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BUCKET_NAME = "teacher-playground-excalidraw";
const DEFAULT_ENDPOINT = "https://api.cloudflare.com/client/v4";
const RELEASE_CACHE_CONTROL = "public,max-age=31536000,immutable";
const LATEST_CACHE_CONTROL = "no-cache,no-store,must-revalidate";

const listFiles = async (directory, prefix = "") => {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
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
};

const encodeObjectKey = (key) =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const mapWithConcurrency = async (items, concurrency, worker) => {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(workers);
};

const uploadObject = async ({
  accountId,
  apiToken,
  bucketName,
  endpoint,
  filePath,
  key,
  cacheControl,
}) => {
  const url = `${endpoint.replace(/\/$/, "")}/accounts/${encodeURIComponent(
    accountId,
  )}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeObjectKey(
    key,
  )}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Cache-Control": cacheControl,
      "Content-Type": key.endsWith(".json")
        ? "application/json"
        : "application/octet-stream",
    },
    body: await readFile(filePath),
  });
  const responseText = (await response.text()).trim();
  let responsePayload;
  try {
    responsePayload = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    responsePayload = undefined;
  }
  if (!response.ok || responsePayload?.success === false) {
    const message = [
      ...(responsePayload?.errors || []).map(
        (error) => error.message || error.code,
      ),
      responseText,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Cloudflare R2 upload failed for ${key}: ${response.status} ${
        response.statusText
      }${message ? ` - ${message}` : ""}`,
    );
  }
};

export async function uploadReleaseToR2({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  bucketName = DEFAULT_BUCKET_NAME,
  concurrency = 4,
  endpoint = process.env.CLOUDFLARE_R2_API_BASE_URL || DEFAULT_ENDPOINT,
  releaseCdnDirectory,
  version,
}) {
  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for the R2 upload",
    );
  }
  if (!releaseCdnDirectory || !version) {
    throw new Error(
      "releaseCdnDirectory and version are required for the R2 upload",
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("R2 upload concurrency must be a positive integer");
  }

  const releaseDirectory = path.join(releaseCdnDirectory, "releases", version);
  const releaseFiles = await listFiles(releaseDirectory);
  const objects = [
    ...releaseFiles.map((relativePath) => ({
      filePath: path.join(releaseDirectory, relativePath),
      key: path.posix.join(
        "releases",
        version,
        relativePath.split(path.sep).join("/"),
      ),
      cacheControl: RELEASE_CACHE_CONTROL,
    })),
    {
      filePath: path.join(releaseCdnDirectory, "latest.json"),
      key: "latest.json",
      cacheControl: LATEST_CACHE_CONTROL,
    },
  ];

  await stat(objects[objects.length - 1].filePath);
  await mapWithConcurrency(objects, concurrency, (object) =>
    uploadObject({
      ...object,
      accountId,
      apiToken,
      bucketName,
      endpoint,
    }),
  );
  return { bucketName, count: objects.length };
}

const readArgument = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const run = async () => {
  const args = process.argv.slice(2);
  const releaseCdnDirectory = readArgument(args, "--directory");
  const version = readArgument(args, "--version");
  if (!releaseCdnDirectory || !version) {
    throw new Error(
      "Usage: node scripts/teacher-playground-r2-upload.mjs --directory release/cdn --version VERSION",
    );
  }
  const result = await uploadReleaseToR2({
    releaseCdnDirectory: path.resolve(releaseCdnDirectory),
    version,
  });
  process.stdout.write(
    `Uploaded ${result.count} objects to ${result.bucketName}\n`,
  );
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await run();
}
