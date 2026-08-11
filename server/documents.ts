import mammoth from "mammoth";
import pdf from "pdf-parse";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const documentUploadLimits = { fileSize: MAX_FILE_BYTES };

export async function extractDocumentText(file: Express.Multer.File) {
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  let text = "";

  if (extension === "txt" || extension === "md") {
    text = file.buffer.toString("utf8");
  } else if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value;
  } else if (extension === "pdf") {
    const result = await pdf(file.buffer);
    text = result.text;
  } else {
    throw new Error("暂不支持该文件格式，请上传 TXT、MD、DOCX 或 PDF");
  }

  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) throw new Error("没有从文档中提取到可翻译的文字");

  return {
    fileName: file.originalname,
    text: cleaned,
    charCount: cleaned.length,
  };
}
