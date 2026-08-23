import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { uploadReleaseToR2 } from "./teacher-playground-r2-upload.mjs";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The local R2 test server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}/client/v4`;
};

describe("teacher-playground Cloudflare R2 upload", () => {
  it("uploads release files and latest metadata through the authenticated R2 API", async () => {
    const workspace = await mkdtemp(
      path.join(tmpdir(), "teacher-playground-r2-upload-"),
    );
    temporaryDirectories.push(workspace);
    const version = "0.18.1-tp.2";
    const releaseDirectory = path.join(
      workspace,
      "releases",
      version,
      "dist",
      "nested",
    );
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(path.join(releaseDirectory, "main.js"), "release bytes\n");
    await writeFile(
      path.join(workspace, "latest.json"),
      JSON.stringify({ version }),
    );

    const requests: Array<{
      body: Buffer;
      cacheControl: string | undefined;
      path: string;
      token: string | undefined;
    }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({
          body: Buffer.concat(chunks),
          cacheControl: request.headers["cache-control"],
          path: request.url ?? "",
          token: request.headers.authorization,
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"success":true}');
      });
    });
    servers.push(server);
    const endpoint = await listen(server);

    await uploadReleaseToR2({
      accountId: "account-123",
      apiToken: "token-456",
      endpoint,
      releaseCdnDirectory: workspace,
      version,
    });

    expect(requests).toHaveLength(2);
    const releaseRequest = requests.find((request) =>
      request.path.includes(
        `/buckets/teacher-playground-excalidraw/objects/releases/${version}/dist/nested/main.js`,
      ),
    );
    expect(releaseRequest).toMatchObject({
      cacheControl: "public,max-age=31536000,immutable",
      token: "Bearer token-456",
    });
    expect(releaseRequest?.body).toEqual(Buffer.from("release bytes\n"));
    const latestRequest = requests.find((request) =>
      request.path.includes(
        "/buckets/teacher-playground-excalidraw/objects/latest.json",
      ),
    );
    expect(latestRequest).toMatchObject({
      cacheControl: "no-cache,no-store,must-revalidate",
      token: "Bearer token-456",
    });
    expect(latestRequest?.body).toEqual(
      await readFile(path.join(workspace, "latest.json")),
    );
  });

  it("rejects missing account or API token configuration before making requests", async () => {
    const workspace = await mkdtemp(
      path.join(tmpdir(), "teacher-playground-r2-upload-"),
    );
    temporaryDirectories.push(workspace);

    await expect(
      uploadReleaseToR2({
        accountId: "",
        apiToken: "",
        releaseCdnDirectory: workspace,
        version: "0.18.1-tp.2",
      }),
    ).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN/);
  });

  it("rejects a successful HTTP response with a failed Cloudflare API envelope", async () => {
    const workspace = await mkdtemp(
      path.join(tmpdir(), "teacher-playground-r2-upload-"),
    );
    temporaryDirectories.push(workspace);
    const version = "0.18.1-tp.2";
    await mkdir(path.join(workspace, "releases", version), { recursive: true });
    await writeFile(
      path.join(workspace, "releases", version, "package.tgz"),
      "release bytes\n",
    );
    await writeFile(path.join(workspace, "latest.json"), "{}\n");

    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          '{"success":false,"errors":[{"message":"quota exceeded"}]}',
        );
      });
    });
    servers.push(server);
    const endpoint = await listen(server);

    await expect(
      uploadReleaseToR2({
        accountId: "account-123",
        apiToken: "token-456",
        endpoint,
        releaseCdnDirectory: workspace,
        version,
      }),
    ).rejects.toThrow(/Cloudflare R2 upload failed.*quota exceeded/);
  });
});
