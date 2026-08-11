declare module "pdf-parse" {
  type PdfResult = { text: string; numpages: number; info: unknown };
  export default function pdf(buffer: Buffer): Promise<PdfResult>;
}
