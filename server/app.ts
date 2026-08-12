import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { documentUploadLimits, extractDocumentText } from "./documents.js";
import { configuredApiKey, getOllamaModels, providerDefaults, translate } from "./providers.js";
import { tokenize } from "./tokenize.js";
import type { Provider, TranslateOptions } from "./types.js";

const VALID_PROVIDERS = new Set<Provider>(["auto", "ollama", "openai", "dictionary"]);

export function createApp(options: { serveStatic?: boolean; documentRequestLimit?: number } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: documentUploadLimits });
  const documentLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.documentRequestLimit ?? 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "文档处理请求过于频繁，请稍后再试" },
  });

  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", async (_request, response) => {
    const models = await getOllamaModels();
    response.json({
      ollama: { available: models.length > 0, models },
      openaiConfigured: Boolean(configuredApiKey(process.env.OPENAI_API_KEY)),
      customEndpointsAllowed: false,
      defaults: providerDefaults,
    });
  });

  app.post("/api/translate", async (request, response) => {
    const startedAt = performance.now();
    try {
      const text = typeof request.body.text === "string" ? request.body.text.trim() : "";
      const rawProvider = request.body.settings?.provider;
      const provider: Provider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : "auto";
      if (!text) return response.status(400).json({ error: "请输入需要翻译的英文" });
      if (text.length > 20_000) {
        return response.status(400).json({ error: "单次最多翻译 20,000 个字符，请分段处理长文档" });
      }

      const tokens = tokenize(text);
      if (!tokens.length) return response.status(400).json({ error: "没有识别到可翻译内容" });

      const settings = (request.body.settings ?? {}) as TranslateOptions;
      const result = await translate(text, tokens, { ...settings, provider });
      return response.json({
        ...result.payload,
        engine: result.engine,
        warning: result.warning,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "翻译失败";
      return response.status(500).json({ error: message });
    }
  });

  app.post(
    "/api/documents/extract",
    documentLimiter,
    upload.single("file"),
    async (request, response) => {
      try {
        if (!request.file) return response.status(400).json({ error: "请选择文档" });
        return response.json(await extractDocumentText(request.file));
      } catch (error) {
        const message = error instanceof Error ? error.message : "文档读取失败";
        return response.status(400).json({ error: message });
      }
    },
  );

  if (options.serveStatic !== false) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const distDir = resolve(currentDir, "../dist");
    if (existsSync(distDir)) {
      const pageLimiter = rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: "页面请求过于频繁，请稍后再试",
      });
      app.use(express.static(distDir));
      app.get("/{*path}", pageLimiter, (_request, response) =>
        response.sendFile(resolve(distDir, "index.html")),
      );
    }
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({ error: "文档不能超过 15 MB" });
    }
    const message = error instanceof Error ? error.message : "服务器错误";
    return response.status(500).json({ error: message });
  });

  return app;
}
