export default function MemberAvatar({ name = '', color = '#6366f1', size = 'md', showTooltip = false }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: color }}
      title={showTooltip ? name : undefined}
    >
      {initials}
    </div>
  );
}
