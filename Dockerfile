FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# 1) まず workspace 定義・lock・ルート tsconfig をコピー
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./

# 2) 各 workspace の package.json をコピー
COPY apps/crawler/package.json apps/crawler/package.json
COPY packages/core/package.json packages/core/package.json

# 3) ★ここが肝：workspace の実体も先にコピー（core の data/ は dict.ts の JSON 用）
COPY packages/core packages/core
COPY packages/core/data packages/core/data
COPY apps/crawler apps/crawler

# 4) 依存インストール
RUN pnpm -C apps/crawler install

# 5) ★ core をビルドして dist を作る（これが必須）
RUN pnpm -C packages/core build

WORKDIR /repo/apps/crawler
CMD ["pnpm","run","oliveyoung:rankings","--","--limit=100"]