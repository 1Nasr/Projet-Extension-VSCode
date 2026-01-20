import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMermaid from 'remark-mermaid';
import remarkHtml from 'remark-html';

export async function renderMarkdown(markdown) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMermaid, { simple: true })  
    .use(remarkHtml, { sanitize: false })
    .process(markdown);

  return String(file);
}
