import ProjectEditor from '@coderius/editor/ProjectEditor';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';
import styles from './index.module.css';

export default function Home(): ReactNode {
  return (
    <Layout title="Editor" description="Schrijf en draai code direct in je browser" noFooter>
      <div className={styles.fullscreen}>
        <ProjectEditor height="100%" />
      </div>
    </Layout>
  );
}
