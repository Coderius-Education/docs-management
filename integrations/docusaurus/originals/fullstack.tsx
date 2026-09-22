import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [{ label: 'Begin met FastAPI', to: '/docs/FastAPI/installatie' }];

const features: FeatureItem[] = [
  {
    title: 'Je eerste endpoint',
    description: 'Bouw je eerste API-route met FastAPI.',
    link: '/docs/FastAPI/eerste_endpoint',
  },
  {
    title: 'Database',
    description: 'Sla gegevens op en haal ze weer op met SQLite.',
    link: '/docs/FastAPI/database',
  },
  {
    title: 'Cheatsheet',
    description: 'Snel terugvinden hoe een route, form of template werkt.',
    link: '/docs/cheatsheet',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHero title="Coderius Fullstack" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
