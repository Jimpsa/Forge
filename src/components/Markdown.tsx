import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/** Minimal, safe Markdown: paragraphs, "- " / "1. " lists, headings, **bold**. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={out.length} style={{ margin: '4px 0', paddingLeft: 20 }}>{list}</ul>); list = []; } };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { list.push(<li key={i}>{inline(li[1])}</li>); return; }
    flush();
    if (!line.trim()) return;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? <p key={i} style={{ marginTop: 8 }}><strong>{inline(h[1])}</strong></p> : <p key={i}>{inline(line)}</p>);
  });
  flush();
  return <div className="md">{out}</div>;
}

