import { redirect } from 'next/navigation'

// The domain root opens the landing page (English). German is /nalie-de.
export default function Home() {
  redirect('/nalie')
}
