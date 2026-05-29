// Throwaway file to smoke-test the Claude review workflow under OAuth.
// Safe to delete — not imported anywhere.
export function parseWindowDays(input: string): number {
  const re = /^(\d+)d$/;
  const m = (input as any).match(re);
  return m ? Number(m[1]) : 0;
}
