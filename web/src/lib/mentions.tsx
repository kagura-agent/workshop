import type { Agent } from '../types';

/**
 * Parse message content and render @mentions as highlighted spans.
 * Matches @word tokens against known agent names and IDs (case-insensitive).
 */
export function renderMessageContent(
  content: string,
  agents: Agent[]
): React.ReactNode[] {
  if (!content) return [];

  // Build lookup: lowercase name/id → true
  const knownNames = new Set<string>();
  for (const agent of agents) {
    knownNames.add(agent.name.toLowerCase());
    knownNames.add(agent.id.toLowerCase());
  }

  const mentionPattern = /@(\w[\w-]*)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    const word = match[1];
    const isAgent = knownNames.has(word.toLowerCase());

    // Push text before this match
    if (match.index > lastIndex) {
      result.push(content.slice(lastIndex, match.index));
    }

    if (isAgent) {
      result.push(
        <span
          key={match.index}
          className="mention text-discord-accent bg-discord-accent/15 rounded px-0.5 hover:bg-discord-accent/25 cursor-pointer"
        >
          {match[0]}
        </span>
      );
    } else {
      // Not a known agent — render as plain text
      result.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text after last match
  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex));
  }

  return result;
}
