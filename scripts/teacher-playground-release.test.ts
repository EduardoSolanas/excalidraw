import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ensureDistPresent,
  prepareReleaseBundle,
  validateReleaseTag,
} from "./teacher-playground-release.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("teacher-playground Excalidraw release", () => {
  it("accepts only the package's exact release tag", () => {
    expect(() =>
      validateReleaseTag("teacher-playground-v0.18.1-tp.1", "0.18.1-tp.1"),
    ).not.toThrow();
    expect(() =>
      validateReleaseTag("teacher-playground-v0.18.1", "0.18.1-tp.1"),
    ).toThrow(/teacher-playground-v0\.18\.1-tp\.1/);
  });

  it("rejects skip-build when the package dist is absent", async () => {
    const workspace = await mkdtemp(
      path.join(tmpdir(), "teacher-playground-release-"),
    );
    temporaryDirectories.push(workspace);

    await expect(ensureDistPresent(workspace)).rejects.toThrow(
      /--skip-build requires packages\/excalidraw\/dist/,
    );
  });

  it("creates a deterministic CDN bundle and manifest from real files", async () => {
    const workspace = await mkdtemp(
      path.join(tmpdir(), "teacher-playground-release-"),
    );
    temporaryDirectories.push(workspace);

    const packageDirectory = path.join(workspace, "package");
    const tarballPath = path.join(
      workspace,
      "teacher-playground-excalidraw-0.18.1-tp.1.tgz",
    );
    await mkdir(path.join(packageDirectory, "dist", "prod"), {
      recursive: true,
    });
    await mkdir(path.join(packageDirectory, "dist", "types"), {
      recursive: true,
    });
    await writeFile(
      path.join(packageDirectory, "dist", "prod", "index.js"),
      "export const release = true;\n",
    );
    await writeFile(
      path.join(packageDirectory, "dist", "types", "index.d.ts"),
      "export declare const release: boolean;\n",
    );
    await writeFile(tarballPath, "real package bytes\n");

    const first = await prepareReleaseBundle({
      packageDirectory,
      releaseCdnDirectory: path.join(workspace, "first", "release", "cdn"),
      packageName: "@teacher-playground/excalidraw",
      tarballPath,
      version: "0.18.1-tp.1",
    });
    const second = await prepareReleaseBundle({
      packageDirectory,
      releaseCdnDirectory: path.join(workspace, "second", "release", "cdn"),
      packageName: "@teacher-playground/excalidraw",
      tarballPath,
      version: "0.18.1-tp.1",
    });

    expect(first.releaseDirectory).toMatch(
      /release[\\/]cdn[\\/]releases[\\/]0\.18\.1-tp\.1$/,
    );
    expect(first.tarballName).toBe("package.tgz");
    expect(
      await readFile(
        path.join(first.releaseDirectory, "dist", "prod", "index.js"),
        "utf8",
      ),
    ).toBe("export const release = true;\n");
    expect(
      await readFile(path.join(first.releaseDirectory, first.tarballName)),
    ).toEqual(await readFile(tarballPath));

    const firstManifest = await readFile(first.manifestPath, "utf8");
    const secondManifest = await readFile(second.manifestPath, "utf8");
    const firstChecksums = await readFile(first.checksumsPath, "utf8");
    const secondChecksums = await readFile(second.checksumsPath, "utf8");
    const firstLatest = await readFile(first.latestPath, "utf8");
    const secondLatest = await readFile(second.latestPath, "utf8");

    expect(firstManifest).toBe(secondManifest);
    expect(firstChecksums).toBe(secondChecksums);
    expect(firstLatest).toBe(secondLatest);
    const expectedIndexHash = createHash("sha256")
      .update(
        await readFile(
          path.join(first.releaseDirectory, "dist", "prod", "index.js"),
        ),
      )
      .digest("hex");
    expect(firstChecksums).toContain(
      `${expectedIndexHash}  dist/prod/index.js`,
    );
    expect(JSON.parse(firstManifest)).toMatchObject({
      name: "@teacher-playground/excalidraw",
      version: "0.18.1-tp.1",
      files: [
        { path: "dist/prod/index.js" },
        { path: "dist/types/index.d.ts" },
        { path: "package.tgz" },
      ],
    });
    expect(
      JSON.parse(firstManifest).files.find(
        (file: { path: string }) => file.path === "dist/prod/index.js",
      ).sha256,
    ).toBe(expectedIndexHash);
    expect(JSON.parse(firstLatest)).toEqual({
      name: "@teacher-playground/excalidraw",
      version: "0.18.1-tp.1",
      release: "releases/0.18.1-tp.1",
      dist: "releases/0.18.1-tp.1/dist",
      package: "releases/0.18.1-tp.1/package.tgz",
      manifest: "releases/0.18.1-tp.1/manifest.json",
      checksums: "releases/0.18.1-tp.1/SHA256SUMS",
    });
  });
});
