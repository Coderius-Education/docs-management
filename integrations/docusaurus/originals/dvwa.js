import HomepageFeatures from '@coderius/shared/components/HomepageFeatures';
import HomepageHero from '@coderius/shared/components/HomepageHero';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

const ctas = [{ label: 'Begin met de labs', to: '/docs/dvwa_tutorial' }];

const features = [
  {
    title: 'Challenges',
    description: 'Begin meteen in je browser: SQL-injectie, XSS, command injection en meer.',
    link: '/docs/dvwa_tutorial',
  },
  {
    title: 'Naslag',
    description: 'Terminal, HTTP en databases uitgelegd — plus de cheatsheet.',
    link: '/docs/linux_leren',
  },
  {
    title: 'Lokaal installeren',
    description: 'Nodig voor de zwaardere challenges met lokaal gereedschap.',
    link: '/docs/dvwa_installatie',
  },
];

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHero title="Coderius DVWA" ctas={ctas} />
      <HomepageFeatures heading="Waar wil je mee aan de slag?" features={features} />
    </Layout>
  );
}
