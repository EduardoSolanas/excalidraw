locals {
  custom_domain_enabled = var.cdn_domain != null && trimspace(var.cdn_domain) != ""
}

resource "cloudflare_r2_bucket" "releases" {
  account_id    = var.account_id
  name          = var.bucket_name
  storage_class = "Standard"

  # Releases are addressed by immutable version paths. Terraform must not
  # destroy the bucket (and its release history) during ordinary changes.
  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket_cors" "distribution" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.releases.name

  rules = [{
    id = "public-distribution-read"

    allowed = {
      methods = ["GET", "HEAD"]
      origins = ["*"]
    }

    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]
}

resource "cloudflare_r2_custom_domain" "distribution" {
  count = local.custom_domain_enabled ? 1 : 0

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.releases.name
  domain      = var.cdn_domain
  enabled     = true
  min_tls     = "1.2"
  zone_id     = coalesce(var.zone_id, "")

  lifecycle {
    precondition {
      condition     = var.zone_id != null && trimspace(var.zone_id) != ""
      error_message = "zone_id is required when cdn_domain is configured."
    }
  }
}
