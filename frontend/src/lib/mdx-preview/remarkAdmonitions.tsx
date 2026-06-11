import type { Node } from 'unist';
import { visit } from 'unist-util-visit';

interface DirectiveNode extends Node {
  type: 'containerDirective' | 'leafDirective' | 'textDirective';
  name: string;
  children?: Node[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

const ADMONITION_TYPES = ['info', 'tip', 'note', 'caution', 'warning', 'danger'];

/**
 * Zet Docusaurus-admonitions (:::info … :::) om naar een <div> met klasse,
 * zodat de preview ze als gekleurd blok kan stylen.
 */
export function remarkAdmonitions() {
  return (tree: Node) => {
    visit(tree, 'containerDirective', (node: DirectiveNode) => {
      if (!ADMONITION_TYPES.includes(node.name)) return;
      node.data = node.data ?? {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: `admonition admonition-${node.name}`,
        'data-admonition': node.name,
      };
    });
  };
}
