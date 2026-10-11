import { addYears, addMonths } from './dates'

/** 혼인·출산 증여재산공제: 혼인신고일 전후 2년 이내 (상증세법 — 조문 L1 확인 예정) */
export function marriageGiftWindow(marriageDate: Date) {
  return { from: addYears(marriageDate, -2), to: addYears(marriageDate, 2) }
}

/** 신생아 특례: 대출 접수일이 출생일 + 2년 이내여야 함 */
export function newbornLoanDeadline(birthDate: Date) {
  return addYears(birthDate, 2)
}

/** 전세 만기 = 계약일 + 24개월 */
export function leaseExpiry(leaseStart: Date, months = 24) {
  return addMonths(leaseStart, months)
}

/**
 * 출산일을 고정하고 매수 시점을 고를 때, 신생아 특례를 쓰려면 매수(접수)가
 * [출생일, 출생일+2년] 안에 있어야 한다. 그 구간을 돌려준다.
 */
export function purchaseWindowForNewborn(birthDate: Date) {
  return { from: birthDate, to: newbornLoanDeadline(birthDate) }
}
