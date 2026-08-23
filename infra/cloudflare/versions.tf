terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# The provider reads CLOUDFLARE_API_TOKEN from the environment. Keep credentials
# outside Terraform configuration and state.
provider "cloudflare" {}
