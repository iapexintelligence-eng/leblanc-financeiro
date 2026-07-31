import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'

export default forwardRef(function SignaturePad(_, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#14110f'
    const pos = (e) => {
      const rect = c.getBoundingClientRect()
      const t = e.touches ? e.touches[0] : e
      return { x: (t.clientX - rect.left) * (c.width / rect.width), y: (t.clientY - rect.top) * (c.height / rect.height) }
    }
    const start = (e) => { drawing.current = true; dirty.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault() }
    const move = (e) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault() }
    const end = () => { drawing.current = false }
    c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end)
    c.addEventListener('touchstart', start, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', end)
    return () => { c.removeEventListener('mousedown', start); c.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); c.removeEventListener('touchstart', start); c.removeEventListener('touchmove', move); c.removeEventListener('touchend', end) }
  }, [])

  useImperativeHandle(ref, () => ({
    limpar() { const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false },
    isEmpty() { return !dirty.current },
    blob() { return new Promise((res) => canvasRef.current.toBlob(res, 'image/png')) },
  }))

  return <canvas ref={canvasRef} width={560} height={170} style={{ border: '1px solid var(--line-strong)', borderRadius: 8, width: '100%', touchAction: 'none', background: '#fff', cursor: 'crosshair' }} />
})
