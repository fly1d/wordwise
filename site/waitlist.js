(() => {
  const sourcePattern = /^[a-z0-9][a-z0-9-]{0,31}$/;
  const querySource = new URLSearchParams(window.location.search).get("source");

  const referrerSource = (() => {
    if (!document.referrer) return null;

    try {
      const hostname = new URL(document.referrer).hostname.toLowerCase();
      if (hostname === "dev.to" || hostname.endsWith(".dev.to")) return "dev";
      if (
        hostname === "hashnode.com" ||
        hostname.endsWith(".hashnode.com") ||
        hostname === "hashnode.dev" ||
        hostname.endsWith(".hashnode.dev")
      ) {
        return "hashnode";
      }
      if (hostname === "github.com" || hostname.endsWith(".github.com")) return "github";
    } catch {
      return null;
    }

    return null;
  })();

  const source = sourcePattern.test(querySource ?? "") ? querySource : referrerSource;

  if (!source) return;

  for (const link of document.querySelectorAll("a[data-waitlist-link], a[data-preserve-source]")) {
    const url = new URL(link.href);
    url.searchParams.set("source", source);
    link.href = url.toString();
  }
})();
