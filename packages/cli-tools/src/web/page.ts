import { createHash } from 'node:crypto'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { parseWebUrl, requestWeb, WebError, type WebRequestOptions } from './http'

export interface WebPage {
  requestedUrl: string
  url: string
  title: string
  content: string
  contentType: string
  retrievedAt: string
  contentHash: string
  bytes: number
  truncated: boolean
  links: string[]
}

/** Parse inert HTML; scripts never execute and resources are never loaded. */
export function extractPage(
  body: string,
  contentType: string,
  url: string,
): { title: string; content: string; links: string[] } {
  const mime = contentType.split(';')[0]!.trim().toLowerCase()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') {
    const { document } = parseHTML(body)
    const links = new Set<string>()
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
      try {
        links.add(parseWebUrl(new URL(anchor.getAttribute('href')!, url).href).href)
      } catch {
        /* non-web link */
      }
      if (links.size >= 500) break
    }
    for (const node of Array.from(document.querySelectorAll('script,style,noscript,iframe,svg,form,nav,footer,header')))
      node.remove()
    // linkedom is DOM-compatible with Readability; the cast bridges its narrower TS DOM declarations.
    const article = new Readability(document.cloneNode(true) as unknown as Document).parse()
    const readable = article?.content ? parseHTML(`<html><body>${article.content}</body></html>`).document : document
    for (const node of Array.from(readable.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr,br'))) {
      node.prepend(readable.createTextNode('\n'))
      node.append(readable.createTextNode('\n'))
    }
    for (const node of Array.from(readable.querySelectorAll('td,th'))) node.append(readable.createTextNode('\t'))
    const content = readable.querySelector('main,article')?.textContent || readable.body?.textContent || ''
    return {
      title: article?.title || document.title || url,
      content: content
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim(),
      links: Array.from(links),
    }
  }
  if (!(
    mime.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/javascript'].includes(mime) ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  )) {
    throw new WebError(
      'unsupported_content',
      `Unsupported content type: ${mime || '(missing)'}. Use a file or browser tool for binary documents.`,
    )
  }
  return { title: url, content: body, links: [] }
}

export async function fetchPage(
  url: string,
  options: WebRequestOptions & { maxLength?: number } = {},
): Promise<WebPage> {
  const response = await requestWeb(url, options)
  if (response.status < 200 || response.status >= 300)
    throw new WebError(
      response.status === 429 ? 'rate_limited' : 'http_error',
      `HTTP ${response.status} while fetching ${response.url}`,
    )
  const page = extractPage(response.body, response.contentType, response.url)
  const maxLength = options.maxLength ?? 30_000
  return {
    requestedUrl: url,
    url: response.url,
    title: page.title,
    content: page.content.slice(0, maxLength),
    contentType: response.contentType,
    retrievedAt: new Date().toISOString(),
    bytes: response.bytes,
    contentHash: createHash('sha256').update(page.content).digest('hex'),
    truncated: page.content.length > maxLength,
    links: page.links,
  }
}
