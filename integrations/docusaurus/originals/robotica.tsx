import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [{ label: 'Start met de Lego-auto', to: '/lego_auto/frame' }];

const features: FeatureItem[] = [
  {
    title: 'Lego-auto',
    description: 'Bouw stap voor stap je eigen rijdende robot.',
    link: '/lego_auto/frame',
  },
  {
    title: 'Editor',
    description: 'Schrijf en upload code naar je microcontroller.',
    link: '/editor',
  },
  {
    title: 'Cheatsheet',
    description: 'Pin-aansluitingen en code-snippets snel opzoeken.',
    link: '/cheatsheet',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHero title="Coderius Robotica" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
