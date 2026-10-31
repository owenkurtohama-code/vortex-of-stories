import { Link } from 'react-router-dom';

// Shows message text, turning every @username into a link to that member's profile.
export default function MessageText({ text }) {
  const pattern = /@([A-Za-z0-9_]{3,20})/g;
  const parts = [];
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={`${match.index}-${match[1]}`} to={`/author/${match[1]}`} className="mention">
        @{match[1]}
      </Link>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
