import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import AlgorithmGrid from '@site/src/components/AlgorithmGrid';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className={clsx('hero__title', styles.heroTitle)}>
          Coderius Algoritmes
        </Heading>
        <p className={clsx('hero__subtitle', styles.heroSubtitle)}>{siteConfig.tagline}</p>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Leer algoritmes door ze zelf uit te voeren in de browser."
    >
      <HomepageHeader />
      <main>
        <AlgorithmGrid />
      </main>
    </Layout>
  );
}
