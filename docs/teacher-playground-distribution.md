# Teacher Playground Excalidraw distribution

This fork publishes versioned package bundles and browser distribution files from a Cloudflare R2 bucket. The Terraform in `infra/cloudflare` creates the bucket, read-only GET/HEAD CORS policy, and—when configured—a Cloudflare R2 custom domain. The current tp.7 release is live and verified; Terraform still does not configure remote state or store credentials.

## Prerequisite: R2 must be enabled on the account

R2 is an opt-in service. Until it is activated in the Cloudflare Dashboard, every R2 API call fails before Terraform can create anything, and the error names the cause rather than a permission problem:

```text
A request to the Cloudflare API (/accounts/{account_id}/r2/buckets) failed.
Please enable R2 through the Cloudflare Dashboard. [code: 10042]
```

Activation is a dashboard action by an account owner and requires a payment method on file, even though the first 10 GB per month are free. R2 is enabled for the account used by the verified tp.7 release. Confirm the target account before running Terraform or dispatching another release workflow:

```sh
CLOUDFLARE_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID npx wrangler r2 bucket list
```

The public tp.7 package tarball is 9,448,795 bytes; storage is not the reason to prune, and there is deliberately no expiration rule.

## Provision the R2 distribution

Run Terraform from the infrastructure directory. The provider reads the `CLOUDFLARE_API_TOKEN` environment variable. Use a token with R2 Storage Read/Write and R2 custom-domain Read/Write permissions. The default custom domain also performs a `cloudflare_zone` lookup, so the token must include Zone Zone Read for the configured account; R2 Storage Write alone is insufficient.

```sh
cd infra/cloudflare
export CLOUDFLARE_API_TOKEN='set-this-in-your-shell-or-ci-secret-store'
terraform init
terraform plan \
  -var='account_id=YOUR_CLOUDFLARE_ACCOUNT_ID' \
  -var='zone_name=example.com' \
  -var='cdn_domain=cdn.example.com'
terraform apply \
  -var='account_id=YOUR_CLOUDFLARE_ACCOUNT_ID' \
  -var='zone_name=example.com' \
  -var='cdn_domain=cdn.example.com'
```

The defaults are `zone_name=sen-tutor.co.uk` and `cdn_domain=excalidraw-assets.sen-tutor.co.uk`; Terraform looks up the zone ID from the account and needs no separate zone-ID credential. Override both values for another zone/domain, or pass `-var='cdn_domain=null'` for bucket-only provisioning. `bucket_name` defaults to `teacher-playground-excalidraw`; pass `-var='bucket_name=...'` when a different name is required. Review the plan before applying it. The bucket has `prevent_destroy` enabled, and there is no object-expiration rule: immutable release objects are retained until an intentional, separately reviewed retention process is chosen.

## One bucket, one owner

This fork is the sole owner of the bucket, CORS policy, custom domain, and release objects:

| Writer | Location | Mechanism |
| --- | --- | --- |
| This fork | `infra/cloudflare` (here) | Terraform, `cdn_domain` optional |
| The parent app | consumer configuration only | installs the immutable package/distribution URL; it must not provision or upload this bucket |

The parent application must not carry a second Terraform stack or an imperative `reconcile`/upload path for this bucket. Its deploy only consumes the published immutable URL. This prevents competing state, overwrites under `releases/<version>/`, and conflicting root `latest.json` metadata. The fork-owned resources and current tp.7 release are live and verified, including the increment API changes.

## GitHub configuration

The fork repository is `EduardoSolanas/excalidraw`. `upstream` remains the original Excalidraw repository and `origin` is the Teacher Playground fork. For a new release, update the package version on the verified release branch, create an annotated tag matching `teacher-playground-v<version>`, and push that tag to start the release workflow. The historical `0.18.1-tp.2` tag already exists; do not force-push or reuse it:

```sh
git push origin teacher-playground/release-v0.18.1
git tag -a teacher-playground-v<VERSION> -m "Teacher Playground Excalidraw <VERSION>"
git push origin teacher-playground-v<VERSION>
```

Branch and pull-request pushes run the validation workflow only. The tag workflow repeats the package identity, release assembly, type, lint, formatting, and production package-build gates before creating a GitHub Release containing the package tarball, checksums, manifest, and `latest.json`. Cloudflare publishing runs afterwards as the separate `publish-r2` job, so an R2 failure remains visible without making the completed GitHub Release job appear skipped or failed.

The `publish-r2` job uses the existing playground CI contract: it runs in the `prod` environment and uploads through Cloudflare's authenticated R2 REST API. Configure these exact GitHub environment values:

- secret `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with permission to write R2 objects. Terraform provisioning additionally requires R2 custom-domain Read/Write and Zone Zone Read for the configured zone lookup.
- variable `CLOUDFLARE_ACCOUNT_ID` — the account that owns the R2 bucket.

The uploader targets the fixed Terraform bucket `teacher-playground-excalidraw`; no S3 access-key or secret-key pair is required. A missing token or account variable fails the tagged release job clearly after the GitHub Release assets are created, so the bundle remains downloadable while the CDN status is visibly red. Terraform provisioning uses the same `CLOUDFLARE_API_TOKEN` locally or in a separately authorized infrastructure workflow. Do not commit token values or a Terraform state file.

GitHub Actions run `33213074035` completed successfully: the validation, GitHub Release, and `publish-r2` jobs all passed for `0.18.1-tp.10`. `latest.json` currently points to 0.18.1-tp.10, and the public `package.tgz` is 9,448,795 bytes. The release manifest has zero paths matching zh-CN, zh-HK, zh-TW, or Xiaolai; Japanese and Korean assets are retained.

For a future recovery, run the upload-only path with the fork `prod` environment configured. The secret value cannot be copied or read by this repository; coordinate its configuration without exposing it. The path checks out the existing annotated tag, verifies the GitHub Release, rebuilds the exact bundle, and uploads it without creating or deleting a release. This command is for an existing version only; it does not create a release:

For the current `0.18.1-tp.10` release:

```sh
gh workflow run teacher-playground-release.yml \
  --repo EduardoSolanas/excalidraw \
  --ref teacher-playground/release-v0.18.1 \
  -f version=0.18.1-tp.10
```

The version input must match `x.y.z-tp.n`; arbitrary refs and paths are rejected.

## Release layout and tag

The current fork release uses the tag convention:

```text
teacher-playground-v0.18.1-tp.10
```

The current increment API build is tagged `teacher-playground-v0.18.1-tp.10`.

For a configured HTTPS custom domain, publish each release without overwriting older version paths:

```text
https://cdn.example.com/releases/<version>/package.tgz
https://cdn.example.com/releases/<version>/dist/...
https://cdn.example.com/latest.json
```

`latest.json` may move to identify the current release; the `/releases/<version>/` tarball and distribution files remain immutable. Replace `cdn.example.com` with the `distribution_base_url` Terraform output.

## Local bundle expectation

Use Node 22 with Yarn 1.22.22 and the locked dependencies. The release command builds the package, creates the npm tarball, copies the full browser distribution, and writes `manifest.json`, `SHA256SUMS`, and `latest.json`:

```sh
npm install --global yarn@1.22.22 --no-fund --no-audit
node scripts/yarn-install-quiet.mjs install --silent --frozen-lockfile --non-interactive
yarn release:teacher-playground --tag teacher-playground-v0.18.1-tp.10
```

The output is written below `release/cdn`. The GitHub Actions tag job uploads the same tree as a workflow artifact and GitHub Release, then `scripts/teacher-playground-r2-upload.mjs` publishes every versioned object through the Cloudflare R2 Upload Object API with immutable cache headers and updates only `latest.json` with no-cache headers. The uploader preserves nested object paths and limits concurrent requests.

## Install an immutable fork tarball

Consumers that need this exact build can install the versioned tarball directly instead of a moving latest pointer:

```sh
npm install https://cdn.example.com/releases/0.18.1-tp.10/package.tgz
```

Use the URL for the chosen version and record it in the parent project’s lock file. Do not use `/latest.json` as an install URL; it is a release pointer, not a package archive.

## Parent-project migration

1. Keep the parent project’s current Excalidraw dependency and production build working while this fork is staged.
2. Choose a published immutable `package.tgz` URL and install it in a branch.
3. Update the parent lockfile and any import paths only after the fork API has been checked against the parent integration.
4. Run the parent unit, worker, typecheck, lint, build, and browser suites.
5. Compare the collaboration and export behavior with the current dependency, then merge the migration separately from distribution provisioning.

The immutable tp.7 package and distribution URL are published and live; these steps describe how to migrate the parent project to that verified release.
