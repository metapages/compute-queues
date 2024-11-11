terraform {
  required_version = "~> 1.9.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.10"
    }
  }
}

provider "google" {
  region = "us-central1"
}

provider "google-beta" {
  region = "us-central1"
}
