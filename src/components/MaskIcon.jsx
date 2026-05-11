export default function MaskIcon({ className = '', style }) {
  return (
    <img
      src="/mask2.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{
        width: '1em',
        height: '1em',
        display: 'inline-block',
        objectFit: 'contain',
        verticalAlign: '-0.15em',
        ...style,
      }}
    />
  )
}
