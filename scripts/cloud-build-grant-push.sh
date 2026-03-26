#!/usr/bin/env bash
# Cloud Build のデフォルト SA に Artifact Registry Writer を付与する
# 使い方: ./scripts/cloud-build-grant-push.sh
set -e

PROJECT_ID="${PROJECT_ID:-kbeauty-ai}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "Project: ${PROJECT_ID}"
echo "Cloud Build SA: ${SA}"
echo "Granting roles/artifactregistry.writer ..."

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA}" \
  --role="roles/artifactregistry.writer"

echo "Done. Run Cloud Build again and push should succeed."
