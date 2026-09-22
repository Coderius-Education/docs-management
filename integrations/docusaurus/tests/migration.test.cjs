const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sites=['algorithms','ctf','didactiek','dvwa','editor','embedded','fullstack','godot','ide','play','python','robotica','web'];
test('all 13 known courses have editable MDX and one thin root route',()=>{
 for(const site of sites){
  const base=path.join(root,'files/sites',site);
  assert.ok(fs.existsSync(path.join(base,'src/content/homepage.mdx')),`${site} content missing`);
  const extension=site==='dvwa'?'js':'tsx';
  const wrapper=fs.readFileSync(path.join(base,`src/pages/index.${extension}`),'utf8');
  assert.match(wrapper,/import Content,\s*\{\s*frontMatter\s*\}\s+from '\.\.\/content\/homepage\.mdx'/);
  assert.match(wrapper,/<ManagedHomepage Content=\{Content\} frontMatter=\{frontMatter\}/);
  assert.equal(fs.existsSync(path.join(base,'src/pages/index.mdx')),false);
 }
});
test('migration preserves every string from all original hero/features data and layout metadata',()=>{
 for(const site of sites.filter(s=>!['algorithms','didactiek','ide'].includes(s))){
  const extension=site==='dvwa'?'js':'tsx';
  const old=fs.readFileSync(path.join(root,`originals/${site}.${extension}`),'utf8');
  const mdx=fs.readFileSync(path.join(root,`files/sites/${site}/src/content/homepage.mdx`),'utf8');
  const data=old.slice(old.indexOf('const ctas'),old.indexOf('export default'));
  for(const match of data.matchAll(/(?:title|description|link|info|label|to):\s*'([^']*)'/g)) assert.ok(mdx.includes(match[1].replaceAll('&','&amp;')),`${site}: missing ${match[1]}`);
  for(const match of old.matchAll(/(?:title|description|heading|subheading)="([^"]*)"/g)) assert.ok(mdx.includes(match[1]),`${site}: missing ${match[1]}`);
 }
});
test('interactive apps and IDE layout are preserved',()=>{
 for(const [site,name] of [['algorithms','AlgorithmGrid'],['didactiek','TipZoeker'],['ide','ProjectEditor']]){
  const mdx=fs.readFileSync(path.join(root,`files/sites/${site}/src/content/homepage.mdx`),'utf8');
  assert.match(mdx,new RegExp(`import ${name} from`));assert.match(mdx,new RegExp(`<${name}[ /]`));
  if(site==='ide'){assert.match(mdx,/fullscreen: true/);assert.match(mdx,/noFooter: true/);assert.match(mdx,/<ProjectEditor height="100%"/);}
 }
});
