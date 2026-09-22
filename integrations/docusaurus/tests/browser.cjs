/** Real production build smoke checks; run with DOCS_CHECKOUT=/path/to/docs. */
const {chromium}=require('../../../frontend/node_modules/@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(process.env.DOCS_CHECKOUT || '../docs');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try {
  for(const site of ['algorithms','didactiek','ide','embedded']){
   const build=path.join(root,'sites',site,'build');
   const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=path.join(build,name);
    if(!file.startsWith(build+path.sep) && file!==build){res.writeHead(403).end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{
    const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    if(site==='algorithms'){assert.match(await page.locator('h1').innerText(),/Coderius Algoritmes/);assert.ok(await page.locator('main h3').count()>3);}
    if(site==='didactiek'){
     const search=page.getByRole('searchbox',{name:'Zoek een didactische tip'});await search.fill('zzzznomatch');await page.getByText('Geen tip gevonden voor').waitFor();await search.fill('cognitive');await page.waitForFunction(()=>!document.body.innerText.includes('Geen tip gevonden voor'));assert.ok(await page.locator('main li').count()>0);
    }
    if(site==='ide'){
     assert.equal(await page.locator('footer').count(),0);
     await page.waitForFunction(()=>document.body.innerText.includes('project') || document.body.innerText.includes('Project'));
     const fullscreen=page.locator('[class*="fullscreen"]');assert.equal(await fullscreen.count(),1);
     const box=await fullscreen.boundingBox();assert.ok(box.height>500);
    }
    if(site==='embedded') {const info=page.getByRole('button',{name:'Meer informatie'}).first();await info.click();await page.getByText('Start hier als je nog nooit een microcontroller hebt geprogrammeerd.',{exact:false}).waitFor();}
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1),`${site} overflows mobile viewport`);
    await page.screenshot({path:`/tmp/docusaurus-${site}-mobile.png`,fullPage:true});
    assert.deepEqual(errors,[],`${site} browser exceptions`);
    console.log(`${site}: hydration, interaction, mobile layout passed`);await page.close();
   }finally{await new Promise(resolve=>server.close(resolve));}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
