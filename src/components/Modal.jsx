export default function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={wide ? { maxWidth: 720 } : null} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="close-x" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  )
}
