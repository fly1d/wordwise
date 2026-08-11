import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function extractFileText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";

  if (extension === "txt" || extension === "md") {
    text = await file.text();
  } else if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ("str" in item && typeof item.str === "string" ? [item.str] : []))
          .join(" "),
      );
    }
    text = pages.join("\n\n");
  } else {
    throw new Error("暂不支持该文件格式，请上传 TXT、MD、DOCX 或 PDF");
  }

  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) throw new Error("没有从文档中提取到可翻译的文字");
  if (cleaned.length > 20_000) throw new Error("文档超过 20,000 个字符，请先拆分后翻译");

  return { fileName: file.name, text: cleaned };
}
