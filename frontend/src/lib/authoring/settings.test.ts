import { expect, it } from 'vitest';
import { readSetting, changeSetting, parseSettings } from './settings';
it('changes one nested override without replacing sibling settings',()=>{
 const original={version:1,site:{},themeConfig:{navbar:{title:'A',items:[{to:'/docs'}]}},tokens:{},docs:{}};
 const next=changeSetting(original,'themeConfig.navbar.title','B');
 expect(readSetting(next,'themeConfig.navbar.items')).toEqual([{to:'/docs'}]);
 expect(readSetting(original,'themeConfig.navbar.title')).toBe('A');
 expect(readSetting(changeSetting(next,'themeConfig.navbar.title',undefined),'themeConfig.navbar.title')).toBeUndefined();
});
it('preserves false and rejects arrays or unsupported schema versions',()=>{
 expect(readSetting(changeSetting(parseSettings('{"version":1}'),'themeConfig.colorMode.disableSwitch',false),'themeConfig.colorMode.disableSwitch')).toBe(false);
 expect(()=>parseSettings('[]')).toThrow();expect(()=>parseSettings('{"version":2}')).toThrow();
});
