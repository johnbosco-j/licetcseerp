import { Landing } from "@/components/site/landing"
import { SiteSections } from "@/components/site/site-sections"

// Public homepage: department content for everyone; "Sign in" opens the login dialog.
export default function HomePage() {
  return (
    <Landing>
      <SiteSections />
    </Landing>
  )
}
