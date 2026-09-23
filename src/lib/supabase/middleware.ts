import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TZ_COOKIE } from "@/lib/time";

// Matched by whole path segment: "/w" covers "/w" and "/w/anything", never "/walk".
const PUBLIC_PREFIXES = ["/login", "/signup", "/join", "/auth", "/w", "/sw.js", "/manifest.webmanifest", "/icons"];

export function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * First visit to an app page without the time-zone cookie: answer with a
 * tiny page that sets it from the browser and reloads, so the real page's
 * first render already shows local times (the server runs in UTC).
 */
function needsTimeZone(request: NextRequest) {
  return (
    request.method === "GET" &&
    !request.cookies.get(TZ_COOKIE) &&
    !isPublic(request.nextUrl.pathname) &&
    (request.headers.get("accept") ?? "").includes("text/html") &&
    !request.headers.get("rsc") &&
    !request.headers.get("next-router-prefetch")
  );
}

const SET_TZ_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Walker App</title></head><body><script>
try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { tz = "UTC"; }
document.cookie = "${TZ_COOKIE}=" + encodeURIComponent(tz) + "; path=/; max-age=31536000; samesite=lax";
location.replace(location.href);
</script><noscript>This app needs JavaScript.</noscript></body></html>`;

export async function updateSession(request: NextRequest) {
  if (needsTimeZone(request)) {
    return new NextResponse(SET_TZ_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
