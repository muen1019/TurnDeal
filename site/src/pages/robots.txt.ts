import { base, siteUrl } from '../content/links';
export const GET = () => new Response('User-agent: *\nAllow: /\nSitemap: ' + siteUrl + base + 'sitemap.xml\n', { headers: { 'Content-Type': 'text/plain' } });
