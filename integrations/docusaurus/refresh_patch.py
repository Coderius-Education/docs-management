#!/usr/bin/env python3
"""Regenerate patch against the recorded source commit, never the working tree."""
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parent
repo=Path(sys.argv[1]).resolve()
baseline=json.loads((ROOT/'baseline.json').read_text())
patch=[]
for new in sorted((ROOT/'files').rglob('*')):
    if not new.is_file(): continue
    relative=str(new.relative_to(ROOT/'files'))
    old=subprocess.run(['git','show',f'{baseline["commit"]}:{relative}'],cwd=repo,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    content=old.stdout if old.returncode==0 else None
    digest=hashlib.sha256(content).hexdigest() if content is not None else None
    if relative in baseline['files'] and baseline['files'][relative]!=digest:
        raise SystemExit(f'Baseline mismatch for {relative}')
    baseline['files'][relative]=digest
    patch.extend(difflib.unified_diff(content.decode().splitlines(keepends=True) if content is not None else [],new.read_text().splitlines(keepends=True),fromfile='a/'+relative if content is not None else '/dev/null',tofile='b/'+relative))
(ROOT/'baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
(ROOT/'docs-authoring.patch').write_text(''.join(patch))
