import ManagedHomepage from '@coderius/shared/components/ManagedHomepage';
import Content, {frontMatter} from '../content/homepage.mdx';

export default function Home() {
  return <ManagedHomepage Content={Content} frontMatter={frontMatter} />;
}
