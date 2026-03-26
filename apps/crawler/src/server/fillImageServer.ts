/**
 * fill-image ジョブ用 HTTP サーバ
 * Cloud Run Service としてデプロイし、Scheduler から POST で実行
 *
 * 起動: pnpm run serve:fill-image
 * エンドポイント: POST /api/jobs/fill-images
 * 環境変数: PORT (デフォルト 8080), LIMIT (デフォルト 20)
 * Body (JSON, 任意): { "limit": 20 }
 */
import { createServer, IncomingMessage, ServerResponse } from "http";
import { runFillMissingImage } from "../jobs/fillMissingImageJob";

const PORT = Number(process.env.PORT || 8080);
const DEFAULT_LIMIT = 20;

function parseLimitFromBody(body: string): number {
  try {
    const j = JSON.parse(body);
    const n = typeof j?.limit === "number" ? j.limit : parseInt(String(j?.limit), 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : DEFAULT_LIMIT;
  } catch {
    return DEFAULT_LIMIT;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = "";
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "body read failed" }));
    return;
  }
  const limit = body.trim() ? parseLimitFromBody(body) : Number(process.env.LIMIT || DEFAULT_LIMIT);
  const effectiveLimit = Math.max(1, Math.min(500, limit));
  try {
    await runFillMissingImage(effectiveLimit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, limit: effectiveLimit }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[FILL_IMAGE_HTTP_ERROR]", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/jobs/fill-images") {
    await handlePost(req, res);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[FILL_IMAGE_SERVER] Listening on port ${PORT}`);
});
