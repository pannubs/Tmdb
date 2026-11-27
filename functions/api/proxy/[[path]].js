const TARGET_ORIGIN = "https://streamrip.fun";

const AD_HOST_PATTERNS = [
  "googlesyndication",
  "doubleclick",
  "adsterra",
  "popads",
  "popcash",
  "propellerads",
  "exoclick",
  "juicyads",
  "hilltopads",
  "monetag",
  "clickadu",
  "adskeeper",
  "mgid",
  "taboola",
  "outbrain",
  "onclick",
  "acscdn",
  "histats",
  "disable-devtool",
  "alwingulla",
  "effectivegatecpm",
  "highperformanceformat",
];

const INLINE_AD_PATTERNS = [
  /popunder/i,
  /window\.open\s*\(/i,
  /atOptions\s*=/i,
  /adsterra/i,
  /disableDevtool/i,
  /top\.location/i,
  /parent\.location/i,
];

const isAdUrl = (rawUrl) => {
  if (!rawUrl) return false;
  const lower = rawUrl.toLowerCase();
  return AD_HOST_PATTERNS.some((p) => lower.includes(p));
};

const AD_BLOCK_INJECTION = `
<style>
  [class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="ads-"],
  .ads, .ad-banner, .ad-container, .popup-overlay, .pop-ad, ins.adsbygoogle {
    display: none !important;
    pointer-events: none !important;
  }
</style>
<script>
  (() => {
    const blocked = ${JSON.stringify(AD_HOST_PATTERNS)};
    window.open = () => null;
    const origCreate = document.createElement.bind(document);
    document.createElement = function(tag, opts) {
      const el = origCreate(tag, opts);
      const t = String(tag).toLowerCase();
      if (t === "script" || t === "iframe") {
        const origSetAttr = el.setAttribute.bind(el);
        el.setAttribute = function(k, v) {
          if (k.toLowerCase() === "src" && blocked.some(p => String(v).toLowerCase().includes(p))) {
            return;
          }
          return origSetAttr(k, v);
        };
      }
      return el;
    };
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a && a.target === "_blank") {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  })();
</script>
`;

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const pathSegments = context.params.path || [];
  const upstreamPath = "/" + (Array.isArray(pathSegments) ? pathSegments.join("/") : pathSegments);
  const targetUrl = `${TARGET_ORIGIN}${upstreamPath}${reqUrl.search}`;

  const upstreamRes = await fetch(targetUrl, {
    method: context.request.method,
    headers: {
      "User-Agent":
        context.request.headers.get("User-Agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Referer": `${TARGET_ORIGIN}/`,
      "Origin": TARGET_ORIGIN,
      "Accept": context.request.headers.get("Accept") || "*/*",
    },
    redirect: "follow",
  });

  const contentType = upstreamRes.headers.get("content-type") || "";
  const headers = new Headers(upstreamRes.headers);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.delete("x-frame-options");

  if (!contentType.includes("text/html")) {
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  }

  let inlineBuffer = "";
  let inspectingInline = false;

  const rewriter = new HTMLRewriter()
    .on("head", {
      element(el) {
        el.prepend(AD_BLOCK_INJECTION, { html: true });
      },
    })
    .on("script", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && isAdUrl(src)) {
          el.remove();
          return;
        }
        if (!src) {
          inlineBuffer = "";
          inspectingInline = true;
          el.onEndTag(() => {
            inspectingInline = false;
          });
        }
      },
      text(chunk) {
        if (!inspectingInline) return;
        inlineBuffer += chunk.text;
        if (INLINE_AD_PATTERNS.some((re) => re.test(inlineBuffer))) {
          chunk.replace("");
        }
      },
    })
    .on("iframe", {
      element(el) {
        const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
        if (!src || isAdUrl(src)) {
          el.remove();
        }
      },
    })
    .on('ins.adsbygoogle, [class*="ad-banner"], [class*="ad-box"], [id*="ad-wrapper"]', {
      element(el) {
        el.remove();
      },
    })
    .on("a[href]", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          if (href.startsWith(TARGET_ORIGIN)) {
            el.setAttribute("href", href.replace(TARGET_ORIGIN, "/proxy"));
          } else if (href.startsWith("/") && !href.startsWith("//")) {
            el.setAttribute("href", `/proxy${href}`);
          }
        }
        el.removeAttribute("onclick");
        if (el.getAttribute("target") === "_blank") {
          el.removeAttribute("target");
        }
      },
    })
    .on("img[src], link[href], script[src]", {
      element(el) {
        const attr = el.tagName === "link" ? "href" : "src";
        const val = el.getAttribute(attr);
        if (val && val.startsWith("/") && !val.startsWith("//")) {
          el.setAttribute(attr, `${TARGET_ORIGIN}${val}`);
        }
      },
    });

  return rewriter.transform(
    new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    })
  );
}
