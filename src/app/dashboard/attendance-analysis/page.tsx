import { redirect } from "next/navigation"

// The old part-wise analysis is replaced by Insights (hour-wise register).
export default function AttendanceAnalysis() {
  redirect("/dashboard/insights")
}
