import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [
  { label: 'Klik hier om te beginnen met VS Code', to: '/installatie-vscode' },
];

const features: FeatureItem[] = [
  {
    title: 'Website in VS Code',
    description: 'Maak en bewerk je webproject in de editor.',
    link: '/web',
  },
  {
    title: 'Python in VS Code',
    description: 'Schrijf en run Python-scripts lokaal.',
    link: '/python',
  },
  {
    title: 'Git & GitHub',
    description: 'Versiebeheer: commits, branches en pull requests.',
    link: '/git',
  },
];

export default function Home(): ReactNode {
  return (
    <Layout title="Home" description="Leer hoe je kunt werken met een code editor">
      <HomepageHero title="Coderius Editor" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
