import { pages, route, siteUrl } from '../content/links';
export const GET = () => new Response(
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  (['en', 'zh'] as const).flatMap(lang => pages.map(page => '<url><loc>' + siteUrl + route(lang, page) + '</loc></url>')).join('') +
  '</urlset>', { headers: { 'Content-Type': 'application/xml' } },
);
