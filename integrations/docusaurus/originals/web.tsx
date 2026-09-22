import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [{ label: 'Begin de cursus', to: '/docs/html-css/intro-html' }];

const features: FeatureItem[] = [
  {
    title: 'HTML & CSS',
    description: 'Bouw en style je eerste webpagina.',
    link: '/docs/html-css/intro-html',
  },
  {
    title: 'JavaScript',
    description: 'Maak je pagina interactief met JavaScript.',
    link: '/js',
  },
  {
    title: 'Jouw website',
    description: 'Zet alles samen in je eigen project.',
    link: '/jouw-website',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHero title="Coderius Web" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
