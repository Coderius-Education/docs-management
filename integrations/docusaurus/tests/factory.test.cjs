// Runs against the installed docs runtime, after applying the reviewed patch.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.env.DOCS_CHECKOUT || '../docs');
process.chdir(path.join(root,'sites/python'));
const {createConfig}=require(path.join(root,'packages/shared/config'));
const {applySettings}=require(path.join(root,'packages/shared/config/managed-settings'));
const empty={version:1,site:{},themeConfig:{},tokens:{},docs:{}};
const base={title:'Course',url:'https://python.coderius.nl',presets:[['classic',{docs:{},blog:false}]]};

test('partial managed TOC minimum retains a valid inherited course maximum',()=>{
 const course={...base,themeConfig:{tableOfContents:{maxHeadingLevel:6}}};
 const merged=applySettings(course,{...empty,themeConfig:{tableOfContents:{minHeadingLevel:4}}},process.cwd());
 assert.deepEqual(createConfig(merged).themeConfig.tableOfContents,{minHeadingLevel:4,maxHeadingLevel:6});
});

test('partial managed TOC minimum cannot exceed the effective shared maximum',()=>{
 const merged=applySettings(base,{...empty,themeConfig:{tableOfContents:{minHeadingLevel:3}}},process.cwd());
 assert.throws(()=>createConfig(merged),/tableOfContents.*minHeadingLevel.*3.*maxHeadingLevel.*2/);
});

test('effective TOC bounds must be integers between 2 and 6',()=>{
 for(const toc of [{minHeadingLevel:1},{maxHeadingLevel:7},{minHeadingLevel:2.5}]) {
  assert.throws(()=>createConfig({...base,themeConfig:{tableOfContents:toc}}),/tableOfContents.*integers.*2.*6/);
 }
});
