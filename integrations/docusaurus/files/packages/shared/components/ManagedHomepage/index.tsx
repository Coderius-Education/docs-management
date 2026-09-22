/// <reference path="./mdx.d.ts" />

import Head from '@docusaurus/Head';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import MDXContent from '@theme/MDXContent';
import type { ComponentType, ReactNode } from 'react';
import styles from './styles.module.css';

type FrontMatter = {
  title?: string;
  description?: string;
  image?: string;
  keywords?: string[];
  wrapperClassName?: string;
  noFooter?: boolean;
  fullscreen?: boolean;
  slug?: string;
};
/** Content lives outside src/pages so there remains exactly one root route. */
export default function ManagedHomepage({
  Content,
  frontMatter = {},
}: {
  Content: ComponentType;
  frontMatter?: FrontMatter;
}): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const image = useBaseUrl(frontMatter.image || '', { absolute: true });
  if (frontMatter.slug && frontMatter.slug !== '/') throw new Error('Homepage slug must be /');
  return (
    <Layout
      title={frontMatter.title ?? siteConfig.title}
      description={frontMatter.description ?? siteConfig.tagline}
      noFooter={frontMatter.noFooter}
      wrapperClassName={frontMatter.wrapperClassName}
    >
      <Head>
        {frontMatter.image && <meta property="og:image" content={image} />}
        {frontMatter.image && <meta name="twitter:image" content={image} />}
        {frontMatter.keywords && <meta name="keywords" content={frontMatter.keywords.join(', ')} />}
      </Head>
      <div className={frontMatter.fullscreen ? styles.fullscreen : undefined}>
        <MDXContent>
          <Content />
        </MDXContent>
      </div>
    </Layout>
  );
}
