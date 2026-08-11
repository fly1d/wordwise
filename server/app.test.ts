import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp({ serveStatic: false });

describe("translation API", () => {
  it("reports provider availability", async () => {
    const response = await request(app).get("/api/status").expect(200);
    expect(response.body).toMatchObject({
      ollama: { available: expect.any(Boolean), models: expect.any(Array) },
      openaiConfigured: expect.any(Boolean),
      customEndpointsAllowed: false,
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("validates empty input", async () => {
    const response = await request(app).post("/api/translate").send({ text: "" }).expect(400);
    expect(response.body.error).toContain("请输入");
  });

  it("returns one segment per token in dictionary mode", async () => {
    const response = await request(app)
      .post("/api/translate")
      .send({ text: "Hello, developers!", settings: { provider: "dictionary" } })
      .expect(200);

    expect(response.body.engine).toBe("极速词典");
    expect(response.body.segments.map((segment: { source: string }) => segment.source)).toEqual([
      "Hello",
      ",",
      "developers",
      "!",
    ]);
  });

  it("rejects model endpoints that are not configured by the server", async () => {
    const response = await request(app)
      .post("/api/translate")
      .send({
        text: "Hello",
        settings: {
          provider: "openai",
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://api.openai.com.example.test/v1",
        },
      })
      .expect(500);

    expect(response.body.error).toContain("服务端环境变量");
  });

  it("extracts text documents", async () => {
    const response = await request(app)
      .post("/api/documents/extract")
      .attach("file", Buffer.from("Selected text from a document."), "selection.txt")
      .expect(200);

    expect(response.body).toMatchObject({
      fileName: "selection.txt",
      text: "Selected text from a document.",
      charCount: 30,
    });
  });

  it("rate-limits document extraction", async () => {
    const limitedApp = createApp({ serveStatic: false, documentRequestLimit: 1 });
    await request(limitedApp)
      .post("/api/documents/extract")
      .attach("file", Buffer.from("First document."), "first.txt")
      .expect(200);

    const response = await request(limitedApp)
      .post("/api/documents/extract")
      .attach("file", Buffer.from("Second document."), "second.txt")
      .expect(429);

    expect(response.body.error).toContain("过于频繁");
  });
});
