import TipZoeker from '@site/src/components/TipZoeker';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';
import styles from './index.module.css';

export default function Home(): ReactNode {
  return (
    <Layout
      title="Didactiek"
      description="De didactische tips achter het Coderius-lesmateriaal en het onderzoek waarop ze rusten."
    >
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroInner}>
            <Heading as="h1">Tips uit onderzoek</Heading>
            <p className={styles.tagline}>
              Zoek hieronder een didactische tip en lees op de detailpagina welk onderzoek erachter
              zit.
            </p>
          </div>
        </div>
      </header>
      <main>
        <TipZoeker />
      </main>
    </Layout>
  );
}
