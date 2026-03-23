import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import {
  ROUTE_META,
  DEFAULT_META,
  SITE_URL,
  SITE_NAME,
  OG_IMAGE,
} from '../seoConfig';

/**
 * Dynamically sets <title>, <meta description>, <link rel="canonical">,
 * Open Graph and Twitter Card tags based on the current route.
 *
 * Place once inside <App /> — it reacts to route changes automatically.
 */
export default function PageMeta() {
  const { pathname } = useLocation();
  const meta = ROUTE_META[pathname] ?? DEFAULT_META;
  const canonicalUrl = `${SITE_URL}${meta.path}`;

  return (
    <Helmet>
      {/* Core SEO */}
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="ru_RU" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Helmet>
  );
}
