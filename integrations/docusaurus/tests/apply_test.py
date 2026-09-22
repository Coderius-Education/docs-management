import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('apply_managed',ROOT/'apply.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class GuardTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root=Path(self.directory.name)
        shutil.copytree(ROOT/'files',self.root,dirs_exist_ok=True)

    def test_reapply_is_idempotent(self):
        module.validate(self.root)

    def test_changed_homepage_is_not_overwritten(self):
        page=self.root/'sites/python/src/pages/index.tsx'
        page.write_text('// independently changed\n')
        with self.assertRaisesRegex(SystemExit,'changed/unrecognized'):
            module.validate(self.root)
        self.assertEqual(page.read_text(),'// independently changed\n')

    def test_duplicate_root_route_is_rejected(self):
        page=self.root/'sites/python/src/pages/index.mdx'
        page.write_text('# second homepage\n')
        with self.assertRaisesRegex(SystemExit,'duplicate homepage'):
            module.validate(self.root)

if __name__=='__main__':unittest.main()
