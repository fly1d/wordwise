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
    });
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
});
