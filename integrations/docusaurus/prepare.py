#!/usr/bin/env python3
"""Regenerate the reviewed homepage conversions from bundled, immutable originals.

This is deliberately NOT an arbitrary React parser. apply.py checks exact old
file hashes before making any changes to the docs checkout.
"""
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
WRAPPER = """import ManagedHomepage from '@coderius/shared/components/ManagedHomepage';
import Content, {frontMatter} from '../content/homepage.mdx';

export default function Home() {
  return <ManagedHomepage Content={Content} frontMatter={frontMatter} />;
}
"""
EMPTY = {'version': 1, 'site': {}, 'themeConfig': {}, 'tokens': {}, 'docs': {}}
CAPABILITIES = {'version': 1, 'framework': 'docusaurus', 'framework_version': '3.10.1', 'managed_homepage': True, 'settings_runtime': True, 'mermaid': False, 'math': False, 'homepage_fields': ['title', 'description', 'keywords', 'image', 'slug', 'wrapperClassName', 'noFooter', 'fullscreen']}

def attr(value):
    return html.escape(value, quote=True)

def objects(source, name):
    block = re.search(rf'const {name}(?:: [^=]+)? = \[(.*?)\];', source, re.S).group(1)
    return [dict(re.findall(r"(\w+):\s*'([^']*)'", item)) for item in re.findall(r'\{(.*?)\}', block, re.S)]

def prepare():
    for original in sorted((ROOT/'originals').iterdir()):
        site = original.stem
        source = original.read_text()
        layout = re.search(r'<Layout\s+(.*?)>', source, re.S).group(1)
        meta = dict(re.findall(r'(title|description)="([^"]*)"',layout))
        if site == 'ide': meta.update(noFooter=True, fullscreen=True)
        mdx = '---\n' + ''.join(f'{key}: {json.dumps(value, ensure_ascii=False)}\n' for key,value in meta.items()) + '---\n\n'
        if site == 'ide':
            mdx += "import ProjectEditor from '@coderius/editor/ProjectEditor';\n\n<ProjectEditor height=\"100%\" />\n"
        elif site in ['algorithms','didactiek']:
            component = 'AlgorithmGrid' if site=='algorithms' else 'TipZoeker'
            mdx += f"import {{Hero}} from '@coderius/shared/components/HomepageSections';\nimport {component} from '@site/src/components/{component}';\n\n"
            if site == 'algorithms': mdx += '<Hero title="Coderius Algoritmes" variant="compact" />\n'
            else: mdx += '<Hero title="Tips uit onderzoek" tagline="Zoek hieronder een didactische tip en lees op de detailpagina welk onderzoek erachter zit." variant="plain" />\n'
            mdx += f'\n<main>\n  <{component} />\n</main>\n'
        else:
            title = re.search(r'<HomepageHero title="([^"]+)"',source).group(1)
            mdx += "import {Hero, Section, Columns, Card, Buttons, Button} from '@coderius/shared/components/HomepageSections';\n\n"
            mdx += f'<Hero title="{attr(title)}">\n  <Buttons>\n'
            for cta in objects(source,'ctas'): mdx += f'    <Button href="{attr(cta["to"])}">{attr(cta["label"])}</Button>\n'
            mdx += '  </Buttons>\n</Hero>\n\n'
            props = dict(re.findall(r'(heading|subheading)="([^"]*)"',source))
            mdx += '<Section'+''.join(f' {"title" if key=="heading" else "subtitle"}="{attr(value)}"' for key,value in props.items())+'>\n  <Columns count={3}>\n'
            for feature in objects(source,'features'):
                mdx += '    <Card'+''.join(f' {"href" if key=="link" else key}="{attr(value)}"' for key,value in feature.items() if key!='description')+'>\n\n'
                mdx += '      '+attr(feature['description'])+'\n\n    </Card>\n'
            mdx += '  </Columns>\n</Section>\n'
        base=ROOT/'files'/'sites'/site
        files={'src/content/homepage.mdx':mdx,f'src/pages/index{original.suffix}':WRAPPER,'site-settings.json':json.dumps(EMPTY,indent=2)+'\n','authoring-capabilities.json':json.dumps(CAPABILITIES,indent=2)+'\n','src/css/managed-theme.css':'/* Generated from site-settings.json. */\n'}
        for relative,content in files.items():
            destination=base/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(content)

if __name__ == '__main__': prepare()
