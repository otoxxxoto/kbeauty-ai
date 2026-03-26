FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# まず全部コピー（workspaceを完全に認識させる）
COPY . .

# workspace install（dev含む）
RUN pnpm install --frozen-lockfile

# tsx が存在するかビルド時に確認（超重要）
RUN cd apps/crawler && pnpm exec tsx --version

WORKDIR /repo/apps/crawler
# デフォルト: JOB_TYPE で分岐（未設定→ランキング / fill-*→補完ジョブのみ）。kbeauty-oy-fill-images は Dockerfile.fill-image を参照
# fill-review 等: env JOB_TYPE=fill-review-summary-ja 等を渡す。command は上書き不要。
# 補完統合: JOB_TYPE=fill-products-enrich（in-process）。brand_rankings の brandJa: JOB_TYPE=fill-brand-ja（in-process）。
# timeout は REVIEW_SUMMARY_JA_LIMIT 等で調整。
CMD ["pnpm","run","oliveyoung:job"]