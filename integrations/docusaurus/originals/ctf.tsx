import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [{ label: 'Start de challenges', to: '/docs/intro' }];

const features: FeatureItem[] = [
  {
    title: 'Challenges',
    description: 'Begin met de eerste Capture the Flag-opdrachten.',
    link: '/docs/intro',
  },
  {
    title: 'Toolbox',
    description: 'De tools die je nodig hebt om challenges te kraken.',
    link: '/toolbox',
  },
  {
    title: 'Woordenlijst',
    description: 'Snel de cybersecurity-termen opzoeken.',
    link: '/woordenlijst',
  },
];

export default function Home(): ReactNode {
  return (
    <Layout
      title="Home"
      description="Leer cybersecurity door Capture the Flag challenges op te lossen"
    >
      <HomepageHero title="Coderius CTF" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
