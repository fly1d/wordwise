(() => {
  const source = new URLSearchParams(window.location.search).get("source");

  if (!source || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(source)) return;

  for (const link of document.querySelectorAll("a[data-waitlist-link], a[data-preserve-source]")) {
    const url = new URL(link.href);
    url.searchParams.set("source", source);
    link.href = url.toString();
  }
})();
