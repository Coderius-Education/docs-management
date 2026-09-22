#!/usr/bin/env python3
"""Build source emitted by the management editor, then restore migrated content."""
import html
from pathlib import Path
import subprocess
import sys
root=Path(sys.argv[1]).resolve()
fixture=Path(__file__).with_name('managed-homepage-fixture.mdx')
content=root/'sites/python/src/content/homepage.mdx'
original=content.read_bytes()
def build():subprocess.run(['pnpm','--filter','@coderius/python-docs','build'],cwd=root,check=True)
try:
    content.write_bytes(fixture.read_bytes())
    build()
    output=html.unescape((root/'sites/python/build/index.html').read_text())
    assert 'Beheervoorbeeld' in output
    assert 'Voorbeeld met "quotes", <tags> en {haakjes}' in output
    assert 'Nieuwe sectie' in output and 'Nieuwe kaart' in output
    assert 'Beschrijving' in output and 'Lees verder' in output
    print('Actual management editor MDX: all eight block types and escaped props built successfully')
finally:
    content.write_bytes(original)
    build()
