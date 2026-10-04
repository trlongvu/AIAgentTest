// Cắt tài liệu thành các đoạn ~800 ký tự, ưu tiên cắt theo đoạn văn.
// Đoạn quá dài thì cắt cứng, có phần gối đầu (overlap) để không mất ngữ cảnh ở chỗ cắt.
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

export function chunkText(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (`${current}\n\n${paragraph}`.length <= CHUNK_SIZE) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length > CHUNK_SIZE) {
      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE));
      }
      current = '';
    } else {
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
