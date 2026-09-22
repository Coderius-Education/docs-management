import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [{ label: 'Klik hier om te beginnen!', to: '/docs/eerste-keer-python/IA' }];

const features: FeatureItem[] = [
  {
    title: 'Begin bij het begin',
    description: 'Je allereerste Python-programma, stap voor stap.',
    link: '/docs/eerste-keer-python/IA',
  },
  {
    title: 'Speeltuin',
    description: 'Speel met kant-en-klare voorbeelden en pas ze direct aan.',
    link: '/speeltuin',
  },
  {
    title: 'Cheatsheet',
    description: 'Snel iets opzoeken: vormen, fysica, acties en gebeurtenissen.',
    link: '/docs/cheatsheet',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHero title="Coderius Play" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
