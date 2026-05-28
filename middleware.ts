/**
 * Anti-clone / anti-scraping — Vercel Edge Middleware (framework-agnostic).
 *
 * Bloque copyweb, HTTrack, wget, scrapy & co. SANS casser :
 *  - Googlebot / Bing / autres vrais crawlers → toujours laissés passer (SEO intact)
 *  - Assets statiques (js/css/img/fonts/api) → exemptés via le matcher
 *  - Vrais visiteurs → la limite est large, jamais touchée en navigation humaine
 *
 * Zéro dépendance npm. Posé tel quel à la racine du projet Vercel.
 * État en mémoire : best-effort sans KV — capture très bien les rafales
 * (cas typique d'un aspirateur qui martèle la même instance edge en quelques secondes).
 */

const SITE_ID = process.env.ANTICLONE_SITE_ID || "site"
const PAGE_LIMIT = Number(process.env.ANTICLONE_PAGE_LIMIT || 40)
const WINDOW_MS = Number(process.env.ANTICLONE_WINDOW_MS || 10_000)
const BAN_MS = Number(process.env.ANTICLONE_BAN_MS || 10 * 60_000)
const HONEYPOT = "/_internal/anticlone-trap"

const BAD_UA = [
  "httrack", "wget", "curl/", "libcurl", "scrapy", "python-requests",
  "python-urllib", "go-http-client", "java/", "okhttp", "node-fetch",
  "axios/", "phantomjs", "headlesschrome", "puppeteer", "playwright",
  "httpclient", "winhttp", "wininet", "offline explorer", "webcopier",
  "webzip", "teleport", "getright", "copier", "siteripper", "sitesucker",
  "website downloader", "copyweb", "import.io", "datacha0s", "masscan",
]

const GOOD_BOTS = [
  "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
  "yandexbot", "applebot", "facebookexternalhit", "twitterbot",
  "linkedinbot", "google-inspectiontool", "ahrefsbot", "semrushbot",
]

const hits = new Map<string, number[]>()
const bans = new Map<string, number>()

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return req.headers.get("x-real-ip") || "unknown"
}

function isBanned(ip: string): boolean {
  const until = bans.get(ip)
  if (!until) return false
  if (Date.now() > until) { bans.delete(ip); return false }
  return true
}

function deny(status: number, msg: string): Response {
  return new Response(msg, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain" },
  })
}

export default function middleware(req: Request): Response | void {
  const ua = (req.headers.get("user-agent") || "").toLowerCase()
  const ip = clientIp(req)
  const path = new URL(req.url).pathname

  // 1. Vrais moteurs → SEO intact, jamais bloqués.
  if (GOOD_BOTS.some((b) => ua.includes(b))) return

  // 2. IP déjà bannie (mauvais bot ou honeypot précédent) → 403 sec.
  if (isBanned(ip)) return deny(403, "Forbidden")

  // 3. Honeypot suivi → ban immédiat (un humain ne va jamais sur ce chemin).
  if (path === HONEYPOT) {
    bans.set(ip, Date.now() + BAN_MS)
    return deny(403, "Forbidden")
  }

  // 4. User-agent d'outil de copie connu → 403.
  if (!ua || BAD_UA.some((b) => ua.includes(b))) return deny(403, "Forbidden")

  // 5. Rate-limit des navigations (le matcher exclut déjà les assets statiques).
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  if (arr.length > PAGE_LIMIT) {
    bans.set(ip, now + BAN_MS)
    return deny(429, "Too Many Requests")
  }

  // Watermark de traçabilité (header — récupérable par un crawler honnête,
  // et présent dans tout proxy/copy qui re-sert nos réponses).
  // Le matcher ne nous laisse passer que les pages — pas les assets.
  // Note : on continue sans renvoyer de Response → la requête suit son cours,
  // les headers ajoutés ici n'apparaîtront pas (pas de next() sans helper).
  // Pour ne pas ajouter @vercel/functions, on s'arrête là (les 4 couches précédentes
  // sont déjà la majorité du gain).
  return
}

export const config = {
  // Exclut : assets statiques (.css/.js/.png…), API, _vercel, _next, favicon.
  // Inclut : toutes les navigations de pages, y compris les .html (pour les sites multi-pages).
  matcher: [
    "/((?!_next/|_vercel|api/|favicon\\.ico|.*\\.(css|js|mjs|json|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|eot|map|xml|txt|pdf|mp4|webm|mp3|wav)).*)",
  ],
}

// Identifiant exportable pour la traçabilité côté logs (utile en cas de litige).
export const __anticloneSiteId = SITE_ID
