export const WARFRAME_MARKET_API_DOCS_URL = 'https://warframe.market/api_docs';

export function warframeMarketItemSellUrl(slug: string): string {
  return `https://warframe.market/items/${encodeURIComponent(slug)}?type=sell`;
}

export function warframeMarketSellHrefUsesPrimeOnlyItemSlug(href: string | null): boolean {
  if (!href) return false;
  const m = /\/items\/([^/?]+)/.exec(href);
  if (!m) return false;
  const slug = m[1].toLowerCase();
  return /(^|_)prime(_|$)/.test(slug);
}
