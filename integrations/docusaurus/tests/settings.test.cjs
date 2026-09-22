const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = '../files/packages/shared/config/managed-settings.js';
test('managed settings runtime exists', () => assert.ok(fs.existsSync(path.join(__dirname, runtime))));
test('recursive merge inherits absent properties, replaces arrays and retains false/null', () => {
  const {deepMerge} = require(runtime);
  const baseline = {navbar:{title:'Course',items:[{label:'Old'}]}, enabled:true, value:5};
  assert.deepEqual(deepMerge(baseline,{navbar:{items:[]},enabled:false,value:null}),{navbar:{title:'Course',items:[]},enabled:false,value:null});
  assert.deepEqual(deepMerge(baseline,{}),baseline);
  assert.equal(baseline.navbar.items.length,1);
});
test('CSS validates tokens and preserves light/dark selectors', () => {
  const {renderCss} = require(runtime);
  assert.match(renderCss({light:{'--ifm-color-primary':'#369'},dark:{'--ifm-font-size-base':'18px'}}),/:root[\s\S]*#369[\s\S]*\[data-theme="dark"\][\s\S]*18px/);
  for(const tokens of [{light:{'--bad':'red'}},{light:{'--ifm-color-primary':'red; } body { display:none'}},{light:{'--ifm-font-size-base':'url(https://evil)'}}]) assert.throws(()=>renderCss(tokens));
});
test('settings apply after course configuration and managed CSS is last', () => {
  const {applySettings} = require(runtime);
  const base={title:'Original',themeConfig:{navbar:{title:'Original',items:[{label:'Keep'}]}},presets:[['classic',{docs:{sidebarPath:'./sidebars.ts'},theme:{customCss:['shared.css','course.css']}}]]};
  const result=applySettings(base,{version:1,site:{title:'Edited'},themeConfig:{navbar:{title:'Edited'}},tokens:{},docs:{breadcrumbs:false}},'/site');
  assert.equal(result.title,'Edited');
  assert.equal(result.themeConfig.navbar.items[0].label,'Keep');
  assert.equal(result.presets[0][1].docs.breadcrumbs,false);
  assert.deepEqual(result.presets[0][1].theme.customCss,['shared.css','course.css','/site/src/css/managed-theme.css']);
  assert.equal(applySettings(base,{version:1,site:{},themeConfig:{},tokens:{},docs:{}},'/site').title,'Original');
});
test('site image becomes theme SEO image and keywords become a meta string',()=>{
 const {applySettings}=require(runtime);
 const output=applySettings({presets:[]},{version:1,site:{image:'/img/social.png',keywords:['course','python']},themeConfig:{},tokens:{light:{'--ifm-global-radius':'.5rem'}},docs:{}},'/site');
 assert.equal(output.themeConfig.image,'/img/social.png');
 assert.equal(output.image,undefined);
 assert.equal(output.keywords,'course, python');
});
test('primary shades derive deterministically without replacing explicit overrides',()=>{
 const {renderCss}=require(runtime);
 const css=renderCss({light:{'--ifm-color-primary':'#808080','--ifm-color-primary-darkest':'#123456'}});
 assert.match(css,/--ifm-color-primary-dark: #737373/);
 assert.match(css,/--ifm-color-primary-light: #8d8d8d/);
 assert.match(css,/--ifm-color-primary-darkest: #123456/);
 assert.doesNotMatch(renderCss({}),/--ifm-color-primary/);
});
