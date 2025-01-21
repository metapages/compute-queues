terraform {
  required_version = "~> 1.9.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.7.0"
    }
  }
}

provider "google" {
  region = "us-central1"
}
