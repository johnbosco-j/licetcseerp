import { Landing } from "@/components/site/landing"
import { SiteSections } from "@/components/site/site-sections"

// Same homepage with the sign-in dialog already open.
export default function LoginPage() {
  return (
    <Landing openLogin>
      <SiteSections />
    </Landing>
  )
}
