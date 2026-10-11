export function addYears(d: Date, years: number): Date {
  const r = new Date(d)
  r.setFullYear(r.getFullYear() + years)
  return r
}
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + months)
  return r
}
export function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}
export const ymd = (d: Date) => d.toISOString().slice(0, 10)
