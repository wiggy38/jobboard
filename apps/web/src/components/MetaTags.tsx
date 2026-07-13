import { useEffect } from 'react'

type Props = {
  title: string
  description: string
  url: string
}

export default function MetaTags({ title, description, url }: Props) {
  useEffect(() => {
    document.title = title

    function setMeta(property: string, content: string) {
      let el =
        document.querySelector(`meta[property="${property}"]`) ??
        document.querySelector(`meta[name="${property}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(
          property.startsWith('og:') ? 'property' : 'name',
          property
        )
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('og:title', title)
    setMeta('og:description', description)
    setMeta('og:url', url)
    setMeta('og:type', 'website')
    setMeta('og:site_name', 'Tumaa')
    setMeta('twitter:card', 'summary')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
  }, [title, description, url])

  return null
}
