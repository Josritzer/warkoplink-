export function renderMemberMentions(value, onOpenMention) {
  const text = String(value ?? '');
  const pattern = /(^|[^a-z0-9_])(@[a-z0-9_]{3,20})(?![a-z0-9_-])/gi;
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    const start = match.index;
    const mentionStart = start + match[1].length;
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (match[1]) parts.push(match[1]);
    const username = match[2].slice(1).toLowerCase();
    parts.push(<button key={`member-${username}-${start}`} type="button" className="member-mention" onClick={() => onOpenMention?.(username)}>@{username}</button>);
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}
