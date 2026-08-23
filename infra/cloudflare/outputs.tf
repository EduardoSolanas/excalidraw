output "bucket_name" {
  description = "R2 bucket containing the distribution objects."
  value       = cloudflare_r2_bucket.releases.name
}

output "bucket_id" {
  description = "Cloudflare identifier for the R2 bucket."
  value       = cloudflare_r2_bucket.releases.id
}

output "custom_domain" {
  description = "Configured custom distribution hostname, or null when disabled."
  value       = try(cloudflare_r2_custom_domain.distribution[0].domain, null)
}

output "distribution_base_url" {
  description = "HTTPS base URL for release objects, or null when no custom domain is configured."
  value       = try("https://${cloudflare_r2_custom_domain.distribution[0].domain}", null)
}
