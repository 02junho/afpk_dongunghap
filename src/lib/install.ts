import { useEffect, useState } from 'react'

/**
 * "홈 화면에 추가" 안내용. 앱스토어 없이 앱처럼 쓰는 방법 (PWA).
 * - 이미 홈 화면 앱으로 열렸으면(standalone) 안내하지 않는다.
 * - 컴퓨터(설계사 콘솔)에서는 안내하지 않는다.
 * - 안드로이드 크롬은 설치 창을 직접 띄울 수 있다(beforeinstallprompt). 아이폰은 사파리 공유 메뉴로만 된다.
 */
export type Platform = 'ios' | 'android' | 'desktop'

export function platform(): Platform {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ 는 맥으로 자신을 소개한다 — 터치가 되면 아이패드로 본다
  if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** 안드로이드 크롬의 설치 창. 브라우저가 이벤트를 주지 않으면 null (아이폰·이미 설치됨·조건 미달) */
let deferred: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent })
}

export function useInstallPrompt() {
  const [ready, setReady] = useState(!!deferred)
  useEffect(() => {
    const on = () => setReady(true)
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  async function install() {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    setReady(false)
    return outcome === 'accepted'
  }
  return { canInstall: ready, install }
}

/**
 * 설계사가 카톡으로 보내는 안내문. 링크 + 홈 화면 추가 + 코드 입력 순서.
 * 아이폰은 홈 화면 앱과 사파리가 저장 공간을 따로 써서, 브라우저에서 먼저 입장하면 앱에서 코드를 한 번 더 넣어야 한다 —
 * 그래서 "추가 먼저, 입장은 아이콘에서" 순서로 쓴다.
 */
export function inviteMessage(o: { label: string; code: string; url: string }): string {
  return [
    `[돈궁합] ${o.label} 님, 입장 안내드립니다.`,
    '',
    '1. 아래 링크를 휴대폰에서 열어 주세요.',
    o.url,
    '',
    '2. 홈 화면에 추가해 주세요. 다음부터 앱처럼 열립니다.',
    '   · 아이폰: 사파리 아래 공유 버튼(네모에 위 화살표) → "홈 화면에 추가"',
    '   · 안드로이드: 크롬 오른쪽 위 ⋮ → "홈 화면에 추가" 또는 "앱 설치"',
    '',
    `3. 홈 화면의 돈궁합 아이콘으로 열고, 입장 코드 ${o.code} 를 넣은 뒤 본인(남편/아내)을 골라 주세요.`,
    '',
    '두 분이 각자 휴대폰으로 따로 답해 주세요. 서로의 답은 보이지 않고 설계사만 봅니다.',
  ].join('\n')
}
