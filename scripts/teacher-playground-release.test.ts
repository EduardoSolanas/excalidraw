import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureDistPresent,
  prepareReleaseBundle,
  validatePackageIdentity,
  validateReleaseTag,
} from "./teacher-playground-release.mjs";
import { createSassLogger } from "./sassLogger.js";
import { shouldSuppressYarnInstallWarning } from "./yarn-install-quiet.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("teacher-playground Excalidraw release", () => {
  it("keeps inherited CI workflows on immutable current actions and quiet installs", async () => {
    const workflowDirectory = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.github/workflows",
    );
    const workflowFiles = [
      "autorelease-excalidraw.yml",
      "autorelease-preview.yml",
      "build-docker.yml",
      "cancel.yml",
      "lint.yml",
      "locales-coverage.yml",
      "publish-docker.yml",
      "sentry-production.yml",
      "semantic-pr-title.yml",
      "size-limit.yml",
      "test-coverage-pr.yml",
      "test.yml",
    ];
    const workflows = await Promise.all(
      workflowFiles.map(async (file) => ({
        file,
        source: await readFile(path.join(workflowDirectory, file), "utf8"),
      })),
    );

    for (const { file, source } of workflows) {
      expect(source, file).not.toMatch(/node-version:\s*["']?18(?:\.x)?/);
      expect(source, file).not.toMatch(
        /uses:\s*[\w.-]+\/[\w.-]+@(?:v\d|\d+\.)/,
      );
      expect(source, file).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}/);
      expect(source, file).not.toMatch(/\bcorepack\b/);
      expect(source, file).not.toMatch(/\byarn install\b/);
      expect(source, file).not.toMatch(/\byarn --frozen-lockfile\b/);
    }
  });

  it("filters only Yarn peer warnings through the checked install wrapper", () => {
    expect(
      shouldSuppressYarnInstallWarning(
        'warning "foo@1.0.0" has unmet peer dependency "bar@^1.0.0".',
      ),
    ).toBe(true);
    expect(
      shouldSuppressYarnInstallWarning(
        'warning "foo@1.0.0" has incorrect peer dependency "bar@^1.0.0".',
      ),
    ).toBe(true);
    expect(
      shouldSuppressYarnInstallWarning(
        "warning left-pad@1.3.0: Use String.prototype.padStart()",
      ),
    ).toBe(false);
    expect(
      shouldSuppressYarnInstallWarning(
        "error Command failed with exit code 1.",
      ),
    ).toBe(false);
    expect(
      shouldSuppressYarnInstallWarning(
        'warning vscode-languageclient@7.0.0: The engine "vscode" appears to be invalid.',
      ),
    ).toBe(true);
    expect(
      shouldSuppressYarnInstallWarning(
        'warning unrelated-package@1.0.0: The engine "vscode" appears to be invalid.',
      ),
    ).toBe(false);
  });

  it("separates branch validation from tagged release and R2 publishing", async () => {
    const workflowDirectory = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.github/workflows",
    );
    const releaseWorkflow = await readFile(
      path.join(workflowDirectory, "teacher-playground-release.yml"),
      "utf8",
    );
    const validateWorkflow = await readFile(
      path.join(workflowDirectory, "teacher-playground-validate.yml"),
      "utf8",
    );
    const releaseJobStart = releaseWorkflow.indexOf("\n  release:\n");
    const publishJobStart = releaseWorkflow.indexOf("\n  publish-r2:\n");
    const recoverJobStart = releaseWorkflow.indexOf("\n  recover-r2:\n");
    const validateJobStart = releaseWorkflow.indexOf("\n  validate:\n");
    const validateJob = releaseWorkflow.slice(
      validateJobStart,
      releaseJobStart,
    );
    const releaseJob = releaseWorkflow.slice(releaseJobStart, publishJobStart);
    const publishJob = releaseWorkflow.slice(publishJobStart, recoverJobStart);
    const recoverJob = releaseWorkflow.slice(recoverJobStart);

    expect(releaseWorkflow).toMatch(
      /push:\s*\n\s+tags:\s*\n\s+- "teacher-playground-v\*"/,
    );
    expect(releaseWorkflow).not.toMatch(/pull_request:/);
    expect(releaseWorkflow).not.toMatch(/branches:/);
    expect(validateWorkflow).toMatch(/pull_request:/);
    expect(validateWorkflow).toMatch(/push:\s*\n\s+branches:\s*\n\s+- "\*\*"/);
    expect(validateWorkflow).toMatch(/yarn test:typecheck/);
    expect(validateWorkflow).toMatch(/yarn test:code/);
    expect(validateWorkflow).toMatch(/yarn test:other/);
    expect(validateWorkflow).toMatch(/yarn test:teacher-playground-release/);
    expect(validateWorkflow).toMatch(/yarn build:package/);

    for (const workflow of [releaseWorkflow, validateWorkflow]) {
      expect(workflow).toMatch(
        /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,
      );
      expect(workflow).toMatch(
        /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/,
      );
      expect(workflow).not.toMatch(
        /actions\/checkout@v4|actions\/setup-node@v4/,
      );
      expect(workflow).toMatch(/node-version:\s+22\.x/);
      expect(workflow).toMatch(/Install Yarn 1\.22\.22/);
      expect(workflow).toMatch(/npm install --global yarn@1\.22\.22/);
      expect(workflow).toMatch(
        /scripts\/yarn-install-quiet\.mjs install --silent --frozen-lockfile --non-interactive/,
      );
      expect(workflow).not.toMatch(/corepack enable/);
    }
    expect(releaseWorkflow).toMatch(
      /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
    );
    expect(releaseWorkflow).toMatch(
      /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/,
    );
    expect(releaseWorkflow).not.toMatch(
      /actions\/upload-artifact@v4|actions\/download-artifact@v4/,
    );
    const packageJson = await readFile(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../package.json",
      ),
      "utf8",
    );
    expect(packageJson).not.toMatch(/"strip-ansi"\s*:\s*"6\.0\.1"/);
    const lockfile = await readFile(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../yarn.lock",
      ),
      "utf8",
    );
    expect(lockfile).toMatch(/strip-ansi@\^7\.0\.1:[\s\S]*?version "7\./);
    expect(lockfile).toMatch(
      /strip-ansi@\^6\.0\.0, strip-ansi@\^6\.0\.1:[\s\S]*?version "6\./,
    );

    expect(validateJob).toMatch(/yarn test:typecheck/);
    expect(validateJob).toMatch(/yarn test:code/);
    expect(validateJob).toMatch(/yarn test:other/);
    expect(validateJob).toMatch(/yarn test:teacher-playground-release/);
    expect(validateJob).toMatch(/yarn build:package/);
    expect(releaseJob).toMatch(/needs:\s+validate/);
    expect(releaseJob).toMatch(/Upload release bundle artifact/);
    expect(releaseJob).toMatch(/gh release create/);
    expect(releaseJob).not.toMatch(/teacher-playground-r2-upload/);
    expect(publishJob).toMatch(/needs:\s+release/);
    expect(publishJob).toMatch(
      /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,
    );
    expect(publishJob).toMatch(
      /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/,
    );
    expect(publishJob).toMatch(/teacher-playground-r2-upload\.mjs/);
    expect(recoverJob).toMatch(/needs:\s+validate/);
  });

  it("defines a validated upload-only recovery workflow for an existing release", async () => {
    const workflow = await readFile(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../.github/workflows/teacher-playground-release.yml",
      ),
      "utf8",
    );

    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/version:\s*\n\s+description:/);
    expect(workflow).toMatch(/required:\s+true/);
    expect(workflow).toMatch(
      /release_tag="teacher-playground-v\$VERSION"[\s\S]*outputs\.release_tag/,
    );
    expect(workflow).toMatch(
      /uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1[\s\S]*ref: \$\{\{ steps\.validate\.outputs\.release_tag \}\}/,
    );
    expect(workflow).toMatch(
      /yarn release:teacher-playground --tag "\$RELEASE_TAG"[\s\S]*node scripts\/teacher-playground-r2-upload\.mjs/,
    );
    expect(workflow).not.toMatch(/recover-r2:[\s\S]*gh release create/);
  });

  it("accepts only the package's exact release tag", () => {
    expect(() =>
      validateReleaseTag("teacher-playground-v0.18.1-tp.2", "0.18.1-tp.2"),
    ).not.toThrow();
    expect(() =>
      validateReleaseTag("teacher-playground-v0.18.1", "0.18.1-tp.2"),
    ).toThrow(/teacher-playground-v0\.18\.1-tp\.2/);
  });

  it("filters only Sass deprecations in CI and forwards other warnings", () => {
    const warnings: Array<{ message: string; options?: unknown }> = [];
    const logger = createSassLogger({
      ci: true,
      warn: (message, options) => warnings.push({ message, options }),
    });
    logger.warn("deprecated", { deprecation: true });
    logger.warn(
      "125 repetitive deprecation warnings omitted.\nRun in verbose mode to see all warnings.",
      {
        deprecation: false,
      },
    );
    logger.warn("ordinary", { deprecation: false });
    expect(warnings).toEqual([
      { message: "ordinary", options: { deprecation: false } },
    ]);

    const localWarnings: string[] = [];
    createSassLogger({
      ci: false,
      warn: (message) => localWarnings.push(message),
    }).warn("deprecated", { deprecation: true });
    expect(localWarnings).toEqual(["deprecated"]);
  });

  it("accepts semver Teacher Playground fork versions", () => {
    expect(() =>
      validatePackageIdentity({
        name: "@teacher-playground/excalidraw",
        version: "0.18.1-tp.2",
      }),
    ).not.toThrow();
    expect(() =>
      validatePackageIdentity({
        name: "@teacher-playground/excalidraw",
        version: "0.18.1",
      }),
    ).toThrow(/semver Teacher Playground fork version/);
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
      "teacher-playground-excalidraw-0.18.1-tp.2.tgz",
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
      version: "0.18.1-tp.2",
    });
    const second = await prepareReleaseBundle({
      packageDirectory,
      releaseCdnDirectory: path.join(workspace, "second", "release", "cdn"),
      packageName: "@teacher-playground/excalidraw",
      tarballPath,
      version: "0.18.1-tp.2",
    });

    expect(first.releaseDirectory).toMatch(
      /release[\\/]cdn[\\/]releases[\\/]0\.18\.1-tp\.2$/,
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
      version: "0.18.1-tp.2",
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
      version: "0.18.1-tp.2",
      release: "releases/0.18.1-tp.2",
      dist: "releases/0.18.1-tp.2/dist",
      package: "releases/0.18.1-tp.2/package.tgz",
      manifest: "releases/0.18.1-tp.2/manifest.json",
      checksums: "releases/0.18.1-tp.2/SHA256SUMS",
    });
  });
});
