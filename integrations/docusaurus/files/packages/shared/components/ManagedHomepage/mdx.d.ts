// The Docusaurus MDX loader exports frontMatter alongside the default component.
// Its generic '*.mdx' declaration only describes the default export.
declare module '*.mdx' {
  export const frontMatter: {
    title?: string; description?: string; image?: string; keywords?: string[];
    wrapperClassName?: string; noFooter?: boolean; fullscreen?: boolean;
    slug?: string;
  };
}
