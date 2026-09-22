#!/usr/bin/env python3
"""Prove settings affect production artifacts, then restore and rebuild inheritance."""
import json
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
site=root/'sites/python'
settings=site/'site-settings.json'
css=site/'src/css/managed-theme.css'
original=settings.read_bytes()
original_css=css.read_bytes()

def build():
    subprocess.run(['pnpm','--filter','@coderius/python-docs','build'],cwd=root,check=True)

def manifest():
    return json.loads((site/'build/effective-settings.json').read_text())

before=manifest()
try:
    value={'version':1,'site':{'title':'Managed build verification','tagline':'Managed tagline','keywords':['managed','verification'],'image':'img/logo.svg'},'themeConfig':{'navbar':{'title':'Managed navbar'},'colorMode':{'defaultMode':'dark'},'prism':{'theme':'github','darkTheme':'dracula'}},'tokens':{'light':{'--ifm-color-primary':'#123456','--ifm-font-size-base':'18px'},'dark':{'--ifm-color-primary':'#abcdef'}},'docs':{'breadcrumbs':False}}
    settings.write_text(json.dumps(value,indent=2)+'\n')
    build()
    effective=manifest()['settings']
    assert effective['site']['title']=='Managed build verification'
    assert effective['site']['keywords']=='managed, verification'
    assert effective['themeConfig']['image']=='img/logo.svg'
    assert effective['themeConfig']['navbar']['title']=='Managed navbar'
    assert effective['themeConfig']['colorMode']['defaultMode']=='dark'
    assert effective['docs']['breadcrumbs'] is False
    assert len([x for x in effective['themeConfig']['navbar']['items'] if x.get('to')=='/docenten'])==1
    html=(site/'build/index.html').read_text()
    assert 'Managed build verification' in html and 'Managed navbar' in html
    generated='\n'.join(p.read_text() for p in (site/'build/assets/css').glob('*.css'))
    assert '#123456' in generated and '#abcdef' in generated and '--ifm-font-size-base:18px' in generated
    assert '--ifm-color-primary-dark:' in css.read_text()
    print('Managed metadata, navigation, Prism, docs options, light/dark CSS and derived shades: passed')
finally:
    settings.write_bytes(original)
    css.write_bytes(original_css)
    build()
after=manifest()
assert before['settings']==after['settings'], 'Reset must restore inherited settings'
print('Reset to inherited settings: passed')
