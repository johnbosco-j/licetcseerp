export function getCurrentSemParity(): "odd" | "even" {
  const m = new Date().getMonth() + 1
  return m >= 6 ? "odd" : "even"
}

export function getActiveSemester(section: string): number {
  const parity = getCurrentSemParity()
  const semMap: Record<string, [number, number]> = {
    "I CSE-A":   [1, 2], "I CSE-B":   [1, 2],
    "II CSE-A":  [3, 4], "II CSE-B":  [3, 4],
    "III CSE-A": [5, 6], "III CSE-B": [5, 6],
    "IV CSE-A":  [7, 8], "IV CSE-B":  [7, 8],
  }
  const [odd, even] = semMap[section] ?? [1, 2]
  return parity === "odd" ? odd : even
}
