import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * 입장 링크 QR (10.23 팀 결정 Q16 — 시연 마지막에 화면에 띄워 심사위원·청중이 폰으로 바로 들어오게).
 * 그림은 브라우저에서 만든다 — 링크가 외부 서버로 가지 않는다.
 */
export default function QrView({ url, title, code, onClose }: { url: string; title: string; code: string; onClose: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => { void QRCode.toDataURL(url, { width: 520, margin: 1 }).then(setSrc) }, [url])
  return (
    <div role="dialog" aria-label={`${title} 입장 QR`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(43,42,51,0.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 24, padding: '28px 32px', textAlign: 'center', maxWidth: 440, width: '100%' }}>
        <p className="meta" style={{ margin: 0 }}>{title}</p>
        <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 14px' }}>폰 카메라로 찍으면 바로 열려요</p>
        {src ? <img src={src} alt={`입장 링크 QR — ${url}`} style={{ width: '100%', maxWidth: 360, imageRendering: 'pixelated' }} /> : <p className="note">QR 만드는 중…</p>}
        <p style={{ fontSize: 28, letterSpacing: '0.2em', fontWeight: 700, margin: '10px 0 2px' }}>{code}</p>
        <p className="meta" style={{ wordBreak: 'break-all' }}>{url}</p>
        <button className="btn btn-quiet btn-small" style={{ marginTop: 14 }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
