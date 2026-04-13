import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Agent } from '../types';

interface MessageContentProps {
  content: string;
  agents: Agent[];
}

const mentionPattern = /@(\w[\w-]*)/g;

/**
 * Split content into segments: plain text segments and @mention segments.
 * Then render plain text through ReactMarkdown and mentions as highlighted spans.
 */
export function MessageContent({ content, agents }: MessageContentProps) {
  if (!content) return null;

  // Build lookup for known agent names/IDs
  const knownNames = new Set<string>();
  for (const agent of agents) {
    knownNames.add(agent.name.toLowerCase());
    knownNames.add(agent.id.toLowerCase());
  }

  // Split content on @mention boundaries
  type Segment = { type: 'text'; value: string } | { type: 'mention'; value: string };
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  mentionPattern.lastIndex = 0;

  while ((match = mentionPattern.exec(content)) !== null) {
    const word = match[1];
    const isAgent = knownNames.has(word.toLowerCase());

    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    if (isAgent) {
      segments.push({ type: 'mention', value: match[0] });
    } else {
      segments.push({ type: 'text', value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  // Merge adjacent text segments
  const merged: Segment[] = [];
  for (const seg of segments) {
    if (seg.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
      merged[merged.length - 1].value += seg.value;
    } else {
      merged.push({ ...seg });
    }
  }

  return (
    <div className="text-sm text-muted-foreground leading-relaxed break-words message-content">
      {merged.map((seg, i) =>
        seg.type === 'mention' ? (
          <span
            key={i}
            className="mention text-discord-accent bg-discord-accent/15 rounded px-0.5 hover:bg-discord-accent/25 cursor-pointer"
          >
            {seg.value}
          </span>
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            components={{
              // Inline code
              code: ({ children, className }) => {
                // If it has a language className, it's a fenced code block (rendered inside <pre>)
                if (className) {
                  return <code className={className}>{children}</code>;
                }
                return (
                  <code className="bg-zinc-900 text-zinc-200 rounded px-1 py-0.5 text-xs font-mono">
                    {children}
                  </code>
                );
              },
              // Code blocks
              pre: ({ children }) => (
                <pre className="bg-zinc-900 text-zinc-200 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono">
                  {children}
                </pre>
              ),
              // Links
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-discord-accent underline hover:text-discord-accent/80"
                >
                  {children}
                </a>
              ),
              // Images
              img: ({ src, alt }) => (
                <img
                  src={src}
                  alt={alt ?? ''}
                  className="max-w-sm max-h-64 rounded my-1"
                />
              ),
              // Paragraphs - render inline to avoid extra spacing
              p: ({ children }) => <span>{children}</span>,
              // Tables
              table: ({ children }) => (
                <table className="border-collapse border border-border my-2 text-xs">
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th className="border border-border px-2 py-1 bg-zinc-900 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-2 py-1">{children}</td>
              ),
              // Lists
              ul: ({ children }) => <ul className="list-disc ml-4 my-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal ml-4 my-1">{children}</ol>,
              li: ({ children }) => <li className="my-0.5">{children}</li>,
              // Blockquote
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-discord-accent/50 pl-3 my-1 italic text-muted-foreground/80">
                  {children}
                </blockquote>
              ),
              // Headings
              h1: ({ children }) => <div className="text-base font-bold my-1">{children}</div>,
              h2: ({ children }) => <div className="text-sm font-bold my-1">{children}</div>,
              h3: ({ children }) => <div className="text-sm font-semibold my-1">{children}</div>,
            }}
          >
            {seg.value}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}
