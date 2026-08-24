variable "account_id" {
  description = "Cloudflare account that owns the R2 bucket."
  type        = string

  validation {
    condition     = trimspace(var.account_id) != ""
    error_message = "account_id must not be empty."
  }
}

variable "zone_name" {
  description = "Cloudflare zone containing the R2 custom domain."
  type        = string
  default     = "sen-tutor.co.uk"

  validation {
    condition     = trimspace(var.zone_name) != ""
    error_message = "zone_name must not be empty."
  }
}

variable "bucket_name" {
  description = "Name of the R2 bucket holding immutable distribution files."
  type        = string
  default     = "teacher-playground-excalidraw"

  validation {
    condition     = trimspace(var.bucket_name) != ""
    error_message = "bucket_name must not be empty."
  }
}

variable "cdn_domain" {
  description = "Optional custom hostname for the public R2 distribution."
  type        = string
  default     = "excalidraw-assets.sen-tutor.co.uk"
  nullable    = true

  validation {
    condition     = var.cdn_domain == null || trimspace(var.cdn_domain) != ""
    error_message = "cdn_domain must not be empty when supplied."
  }
}
