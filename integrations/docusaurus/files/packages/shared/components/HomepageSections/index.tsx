import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Heading from '@theme/Heading';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import featureStyles from '../HomepageFeatures/styles.module.css';
import heroStyles from '../HomepageHero/styles.module.css';
import styles from './styles.module.css';

type Common = {
  children?: ReactNode;
  width?: 'full' | 'wide' | 'normal' | 'narrow';
  spacing?: 'none' | 'small' | 'normal' | 'large';
  align?: 'left' | 'center' | 'right';
  background?: 'transparent' | 'muted' | 'primary';
};
function classes(props: Common) {
  return clsx(
    props.width && styles[props.width],
    props.spacing && styles[`spacing_${props.spacing}`],
    props.align && styles[`align_${props.align}`],
    props.background && styles[`background_${props.background}`],
  );
}
export function Hero({
  title,
  tagline,
  variant = 'default',
  children,
  ...props
}: Common & { title?: string; tagline?: string; variant?: 'default' | 'compact' | 'plain' }) {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header
      className={clsx(
        variant === 'plain' ? styles.plain : ['hero hero--primary', heroStyles.heroBanner],
        variant === 'compact' && styles.compact,
        classes(props),
      )}
    >
      <div className={clsx('container', variant === 'plain' && styles.plainInner)}>
        <Heading as="h1" className={variant === 'plain' ? undefined : 'hero__title'}>
          {title ?? siteConfig.title}
        </Heading>
        <p className={variant === 'plain' ? styles.plainTagline : 'hero__subtitle'}>
          {tagline ?? siteConfig.tagline}
        </p>
        {children}
      </div>
    </header>
  );
}
export function Section({
  title,
  subtitle,
  children,
  ...props
}: Common & { title?: string; subtitle?: string }) {
  return (
    <section className={clsx(featureStyles.features, classes(props))}>
      <div className="container">
        {(title || subtitle) && (
          <div className={featureStyles.featuresHeader}>
            {title && <Heading as="h2">{title}</Heading>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
export function Columns({ count = 3, children, ...props }: Common & { count?: number }) {
  return (
    <div
      className={clsx(styles.columns, classes(props))}
      style={{ '--homepage-columns': Math.max(1, Math.min(4, count)) } as CSSProperties}
    >
      {children}
    </div>
  );
}
export function Card({
  title,
  href,
  info,
  children,
  ...props
}: Common & { title?: string; href?: string; info?: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const body = (
    <>
      {title && <Heading as="h3">{title}</Heading>}
      {children}
    </>
  );
  return (
    <div className={clsx(featureStyles.featureCard, classes(props))}>
      {href ? (
        <Link to={href} className={featureStyles.featureLink}>
          {body}
        </Link>
      ) : (
        <div className={featureStyles.featureLink}>{body}</div>
      )}
      {info && (
        <div className={featureStyles.infoButtonWrapper}>
          <button
            type="button"
            className={featureStyles.infoButton}
            onClick={() => setShowInfo(!showInfo)}
            aria-label="Meer informatie"
            aria-expanded={showInfo}
          >
            i
          </button>
          {showInfo && (
            <div className={featureStyles.infoTooltip}>
              <div className={featureStyles.infoTooltipArrow} />
              {info}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export function Buttons({ children, ...props }: Common) {
  return <div className={clsx(heroStyles.buttons, classes(props))}>{children}</div>;
}
export function Button({
  href,
  variant = 'secondary',
  size = 'lg',
  children,
}: { href: string; variant?: 'primary' | 'secondary'; size?: 'sm' | 'lg'; children?: ReactNode }) {
  return (
    <Link to={href} className={clsx('button', `button--${variant}`, `button--${size}`)}>
      {children}
    </Link>
  );
}
export function Picture({
  src,
  alt,
  caption,
  ...props
}: Common & { src: string; alt: string; caption?: string }) {
  const url = useBaseUrl(src);
  return (
    <figure className={classes(props)}>
      <img src={url} alt={alt} loading="lazy" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
export function Divider(props: Common) {
  return <hr className={classes(props)} />;
}
