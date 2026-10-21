export default function Avatar({ url, name, size = 36 }) {
  const style = { width: size, height: size };
  if (url) return <img src={url} alt="" className="avatar" style={style} />;
  return (
    <span className="avatar avatar-fallback" style={style} aria-hidden="true">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
