# Cloud Build: イメージ push 権限の設定

ビルドは通るが **push だけ失敗**する場合、Cloud Build のデフォルトサービスアカウントに Artifact Registry への書き込み権限が不足していることが多いです。

## 1) Cloud Build のサービスアカウントを特定

通常は次の形式です：

```
PROJECT_NUMBER@cloudbuild.gserviceaccount.com
```

`PROJECT_NUMBER` の取得：

```bash
gcloud projects describe kbeauty-ai --format="value(projectNumber)"
```

## 2) そのサービスアカウントに push 権限を付与

Artifact Registry Writer を付与すると、`uploadArtifacts` が通るようになります。

```bash
PROJECT_ID="kbeauty-ai"
PROJECT_NUMBER="$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA}" \
  --role="roles/artifactregistry.writer"
```

**「ビルドは通るが push だけ失敗」の多くはこれで解消します。**

---

## 追加でハマりやすい分岐

### A) リポジトリが存在しない場合

Artifact Registry のリポジトリを先に作成します（例: Docker 形式 `kbeauty`）：

```bash
gcloud artifacts repositories create kbeauty \
  --repository-format=docker \
  --location=asia-northeast1 \
  --project=kbeauty-ai
```

その後、イメージの tag を **Artifact Registry 形式**にします：

```bash
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/kbeauty-ai/kbeauty/kbeauty-oy-rankings:latest .
```

`cloudbuild.yaml` で `images` や `tags` を指定している場合も、上記の `asia-northeast1-docker.pkg.dev/...` 形式に合わせてください。

### B) gcr.io をそのまま使いたい場合（非推奨）

Container Registry が無効または権限不足だと失敗します。**Artifact Registry（A の方式）に寄せる**のが安全です。
