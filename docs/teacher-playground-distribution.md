# Teacher Playground Excalidraw distribution

This fork publishes versioned package bundles and browser distribution files from a Cloudflare R2 bucket. The Terraform in `infra/cloudflare` creates the bucket, read-only GET/HEAD CORS policy, and—when configured—a Cloudflare R2 custom domain. It does not configure remote state, store credentials, or claim that a live deployment has happened.

## Provision the R2 distribution

Run Terraform from the infrastructure directory. The provider reads the `CLOUDFLARE_API_TOKEN` environment variable; use a token with R2 Storage Write and, when using `cdn_domain`, the permissions required by the R2 custom-domain resource.

```sh
cd infra/cloudflare
export CLOUDFLARE_API_TOKEN='set-this-in-your-shell-or-ci-secret-store'
terraform init
terraform plan \
  -var='account_id=YOUR_CLOUDFLARE_ACCOUNT_ID' \
  -var='zone_id=YOUR_CLOUDFLARE_ZONE_ID' \
  -var='cdn_domain=cdn.example.com'
terraform apply \
  -var='account_id=YOUR_CLOUDFLARE_ACCOUNT_ID' \
  -var='zone_id=YOUR_CLOUDFLARE_ZONE_ID' \
  -var='cdn_domain=cdn.example.com'
```

`zone_id` and `cdn_domain` are optional together. Omit both to provision only the bucket and its CORS policy. `bucket_name` defaults to `teacher-playground-excalidraw`; pass `-var='bucket_name=...'` when a different name is required. Review the plan before applying it. The bucket has `prevent_destroy` enabled, and there is no object-expiration rule: immutable release objects are retained until an intentional, separately reviewed retention process is chosen.

## GitHub configuration

The fork repository is `EduardoSolanas/excalidraw`. Its release branch is `teacher-playground/release-v0.18.1`; `upstream` remains the original Excalidraw repository and `origin` is the Teacher Playground fork. Push the verified branch, then push the exact annotated tag to start the release workflow:

```sh
git push origin teacher-playground/release-v0.18.1
git push origin teacher-playground-v0.18.1-tp.2
```

The workflow validates the package identity, release assembly, types, lint, formatting, and production package build. A matching tag creates a GitHub Release containing the package tarball, checksums, manifest, and `latest.json`.

The release job uses the existing playground CI contract: it runs in the `prod` environment and uploads through Cloudflare's authenticated R2 REST API. Configure these exact GitHub environment values:

- secret `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with permission to write R2 objects.
- variable `CLOUDFLARE_ACCOUNT_ID` — the account that owns the R2 bucket.

The uploader targets the fixed Terraform bucket `teacher-playground-excalidraw`; no S3 access-key or secret-key pair is required. A missing token or account variable fails the tagged release job clearly after the GitHub Release assets are created, so the bundle remains downloadable while the CDN status is visibly red. Terraform provisioning uses the same `CLOUDFLARE_API_TOKEN` locally or in a separately authorized infrastructure workflow. Do not commit token values or a Terraform state file.

If GitHub Release creation succeeded but the R2 upload failed, add the missing environment credential and run the workflow's upload-only recovery path. It checks out the existing annotated tag, verifies the GitHub Release, rebuilds the exact bundle, and uploads it without creating or deleting a release:

```sh
gh workflow run teacher-playground-release.yml \
  --repo EduardoSolanas/excalidraw \
  --ref teacher-playground/release-v0.18.1 \
  -f version=0.18.1-tp.2
```

The version input must match `x.y.z-tp.n`; arbitrary refs and paths are rejected.

## Release layout and tag

The current fork release uses the tag convention:

```text
teacher-playground-v0.18.1-tp.2
```

For a configured HTTPS custom domain, publish each release without overwriting older version paths:

```text
https://cdn.example.com/releases/<version>/package.tgz
https://cdn.example.com/releases/<version>/dist/...
https://cdn.example.com/latest.json
```

`latest.json` may move to identify the current release; the `/releases/<version>/` tarball and distribution files remain immutable. Replace `cdn.example.com` with the `distribution_base_url` Terraform output.

## Local bundle expectation

Use Node 22 with Corepack and the locked Yarn dependencies. The release command builds the package, creates the npm tarball, copies the full browser distribution, and writes `manifest.json`, `SHA256SUMS`, and `latest.json`:

```sh
corepack enable
yarn install --frozen-lockfile --non-interactive
yarn release:teacher-playground --tag teacher-playground-v0.18.1-tp.2
```

The output is written below `release/cdn`. The GitHub Actions tag job uploads the same tree as a workflow artifact and GitHub Release, then `scripts/teacher-playground-r2-upload.mjs` publishes every versioned object through the Cloudflare R2 Upload Object API with immutable cache headers and updates only `latest.json` with no-cache headers. The uploader preserves nested object paths and limits concurrent requests.

## Install an immutable fork tarball

Consumers that need this exact build can install the versioned tarball directly instead of a moving latest pointer:

```sh
npm install https://cdn.example.com/releases/0.18.1-tp.2/package.tgz
```

Use the URL for the chosen version and record it in the parent project’s lock file. Do not use `/latest.json` as an install URL; it is a release pointer, not a package archive.

## Parent-project migration

1. Keep the parent project’s current Excalidraw dependency and production build working while this fork is staged.
2. Choose a published immutable `package.tgz` URL and install it in a branch.
3. Update the parent lockfile and any import paths only after the fork API has been checked against the parent integration.
4. Run the parent unit, worker, typecheck, lint, build, and browser suites.
5. Compare the collaboration and export behavior with the current dependency, then merge the migration separately from distribution provisioning.

These are migration instructions only; they do not verify that Cloudflare has been provisioned or that any URL is live.
