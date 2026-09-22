import HomepageFeatures, { type FeatureItem } from '@coderius/shared/components/HomepageFeatures';
import HomepageHero, { type HeroCta } from '@coderius/shared/components/HomepageHero';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const ctas: HeroCta[] = [
  { label: 'Start met je eerste LED →', to: '/docs/introductie/wat-is-embedded' },
];

const features: FeatureItem[] = [
  {
    title: 'Begin hier',
    description: 'Je eerste knipperende LED in de Arduino IDE',
    link: '/docs/introductie/wat-is-embedded',
    info: 'Start hier als je nog nooit een microcontroller hebt geprogrammeerd. Je hebt geen hardware nodig: alles werkt in de simulator.',
  },
  {
    title: 'Naar de STM32',
    description: 'Van Arduino IDE via PlatformIO naar een echte STM32',
    link: '/docs/platformio/waarom-platformio',
    info: 'Klaar met de basis? Stap over op PlatformIO en leer IO en interfaces configureren op een STM32 Blue Pill.',
  },
  {
    title: 'Cheatsheet',
    description: 'Snel iets opzoeken: functies, pinnen en commando’s',
    link: '/cheatsheet',
    info: 'Gebruik de cheatsheet als naslagwerk voor syntax, pin-namen en veelgebruikte commando’s.',
  },
];

export default function Home(): ReactNode {
  return (
    <Layout
      title="Embedded programmeren"
      description="Leer embedded programmeren: van een blink-LED in de Arduino IDE tot IO en interfaces op een STM32."
    >
      <HomepageHero title="Coderius Embedded" ctas={ctas} />
      <HomepageFeatures
        heading="Waar wil je mee aan de slag?"
        subheading="Kies hieronder een startpunt"
        features={features}
      />
    </Layout>
  );
}
