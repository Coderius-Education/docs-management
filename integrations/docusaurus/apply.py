#!/usr/bin/env python3
"""Preview/apply the reviewed runtime patch. Refuse changed source before writing.

Use --apply only on a feature branch. This tool does not commit, push or merge.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parent

def validate(target):
    expected=json.loads((ROOT/'baseline.json').read_text())
    for relative, sha in expected['files'].items():
        source=target/relative
        actual=hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else None
        new=ROOT/'files'/relative
        if actual!=sha and not (new.exists() and source.exists() and source.read_bytes()==new.read_bytes()):
            raise SystemExit(f'Refusing changed/unrecognized source: {relative}')
    for site in (ROOT/'files/sites').iterdir():
        known='index.js' if site.name=='dvwa' else 'index.tsx'
        for filename in ['index.js','index.jsx','index.tsx','index.md','index.mdx']:
            if filename!=known and (target/'sites'/site.name/'src/pages'/filename).exists():
                raise SystemExit(f'Refusing duplicate homepage route: {site.name}/{filename}')
    return expected

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout',type=Path)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    target=args.checkout.resolve()
    expected=validate(target)
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=target,text=True).strip()
    if args.apply and (not branch or branch in ['main','master']): raise SystemExit('Apply requires a feature branch')
    files=sorted((ROOT/'files').rglob('*'))
    for source in files:
        if not source.is_file(): continue
        relative=source.relative_to(ROOT/'files')
        print(relative)
        if args.apply:
            destination=target/relative
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,destination)
    print('Applied.' if args.apply else 'Validated; no files changed. Use --apply on a feature branch.')

if __name__=='__main__': main()
