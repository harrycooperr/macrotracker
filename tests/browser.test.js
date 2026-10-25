/* End-to-end checks. Requires Playwright and an installed Chromium browser. External scans are fixtures. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const C=require('../core.js');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const root=path.resolve(__dirname,'..'),qa=process.env.MACROLOG_QA_DIR||path.join(root,'qa-output');
const today=C.londonDate(),base=()=>({calories:2640,protein:148,fat:75,carbs:343.25,sugar:50});
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR4nGP8//8/AzbAhFV00EoAAFbUAw037MyjAAAAAElFTkSuQmCC','base64');
function coachingState(slope=0,intake=2640){
 const start=C.addDays(today,-20),now=Date.parse(start+'T12:00:00Z'),s=C.blank(base(),start,now);
 s.settings={unit:'kg',startDate:start,experience:'experienced',gainMinPct:.5,gainMaxPct:1,adherencePct:5};
 for(let i=0;i<21;i++){const date=C.addDays(start,i);C.saveWeight(s,date,67.13167076+slope*i,now+i*86400000,today,false);
  s.logs[date]=[{id:'qa-entry-'+i,foodId:null,name:'Example daily intake',per100:{...base(),calories:intake},grams:100,ts:now+i*86400000}];s.completion[date]={complete:true,updatedAt:now+i*86400000};}
 return s;
}
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const buf=await fs.readFile(file),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(buf);
 }catch{res.writeHead(404);res.end('Not found');}
});
(async()=>{
 await fs.mkdir(qa,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.MACROLOG_CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[],pageErrors=[];let activePage;
 async function context(values={},width=390){
  const ctx=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,timezoneId:'Europe/London',locale:'en-GB',acceptDownloads:true});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
  await ctx.addInitScript(({values,origin})=>{
   if(location.origin===origin&&!localStorage.getItem('qa-seeded')){for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);localStorage.setItem('qa-seeded','yes');}
   window.BarcodeDetector=class{async detect(){return[{rawValue:'5000123456789'}];}};
  },{values,origin});
  const page=await ctx.newPage();page.setDefaultTimeout(7000);activePage=page;page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#calRemain').waitFor({state:'visible'});
  return {ctx,page};
 }
 const stateOf=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),C.STORE);
 async function check(name,fn){
  try{await fn();results.push(name);console.log('PASS '+name);}
  catch(e){console.log('ORIGINAL FAILURE',name,e.message);try{if(activePage&&!activePage.isClosed()){
   console.log('FAIL DIAGNOSTIC',await activePage.evaluate(()=>({url:location.href,status:document.querySelector('#status')?.textContent,error:document.querySelector('#formError')?.textContent,dialog:document.querySelector('#appDialog')?.open,body:document.body.innerText.slice(0,1800)})));
   await activePage.screenshot({path:path.join(qa,'failure.png'),fullPage:true});
  }}catch{}throw e;}
 }

 try{
  const {ctx,page}=await context({gemini_key:'QA_ONLY_NOT_A_REAL_KEY'});
  await check('save a named manual food without logging calories',async()=>{
   await page.locator('#btnManual').click();await page.locator('#foodName').fill('Yoghurt <test>');
   for(const[k,v]of Object.entries({calories:290,protein:20,carbs:30,fat:10,sugar:5}))await page.locator('[name="nutri_'+k+'"]').fill(String(v));
   await page.locator('#foodGrams').fill('100');await page.locator('#saveFoodOnly').click();
   const s=await stateOf(page);assert.equal(s.foods.length,1);assert.equal((s.logs[today]||[]).length,0);
   assert.equal(await page.locator('#legFood').innerText(),'0');
   assert.equal(await page.locator('#recentsRow').locator('test').count(),0);
  });
  let scans=0;
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   scans++;await route.fulfill({contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({name:'',servingSizeG:45,per100:{calories:450+scans,protein:10,carbs:65,fat:17,sugar:30}})}]}}]})});
  });
  for(const name of ['Chocolate bar one','Chocolate bar two']){
   await page.locator('#labelFile').setInputFiles({name:'label.png',mimeType:'image/png',buffer:pixel});
   await page.locator('#foodForm').waitFor();assert.equal(await page.locator('#foodName').inputValue(),'');
   await page.locator('#foodName').fill(name);await page.locator('#saveFoodOnly').click();
  }
  await check('two label-photo scans retain separate names and source badges',async()=>{
   const s=await stateOf(page);assert.equal(s.foods.length,3);assert.equal(s.foods.filter(f=>f.source==='label').length,2);
  });
  let barcodeLookups=0;
  await page.route('https://world.openfoodfacts.org/**',async route=>{
   barcodeLookups++;await route.fulfill({contentType:'application/json',body:JSON.stringify({status:1,product:{product_name:'Barcode oats',brands:'Test brand',serving_quantity:50,nutriments:{'energy-kcal_100g':147,proteins_100g:10,carbohydrates_100g:20,fat_100g:3,sugars_100g:1}}})});
  });
  await check('mocked barcode lookup saves a reusable item and scales fractional servings once',async()=>{
   await page.locator('#barcodeFile').setInputFiles({name:'barcode.png',mimeType:'image/png',buffer:pixel});
   await page.locator('#foodForm').waitFor();await page.locator('#foodName').fill('Porridge oats');await page.locator('#saveFoodOnly').click();
   await page.locator('#barcodeFile').setInputFiles({name:'barcode-again.png',mimeType:'image/png',buffer:pixel});
   await page.locator('#foodForm').waitFor();await page.locator('#foodServings').fill('2.5');
   await page.locator('#foodForm button[type=submit]').click();
   const s=await stateOf(page);assert.equal(s.foods.length,4);assert.equal(barcodeLookups,1);
   assert.equal(s.logs[today][0].grams,125);assert.equal(C.totals(s.logs[today]).calories,183.75);
   assert.equal(s.foods.find(f=>f.barcode).source,'barcode');
  });
  await check('editing a saved food leaves its diary snapshot unchanged',async()=>{
   await page.locator('#viewAllFoods').click();await page.locator('#foodSearch').fill('Porridge oats');
   await page.getByRole('button',{name:'Edit',exact:true}).click();
   await page.locator('[name="nutri_calories"]').fill('999');await page.locator('#saveFoodOnly').click();
   const s=await stateOf(page);assert.equal(s.logs[today][0].per100.calories,147);
   assert.equal(s.foods.find(f=>f.barcode).per100.calories,999);
  });
  await check('dated diary correction scales grams and marks a completed day incomplete',async()=>{
   await page.locator('[data-screen=nutrition]').click();await page.locator('#dayComplete').check();
   await page.getByRole('button',{name:'Edit Porridge oats',exact:true}).click();
   await page.locator('#foodGrams').fill('150');await page.locator('#foodForm button[type=submit]').click();
   const s=await stateOf(page);assert.equal(s.logs[today][0].grams,150);assert.equal(C.totals(s.logs[today]).calories,220.5);
   assert.equal(s.completion[today].complete,false);
   await page.screenshot({path:path.join(qa,'nutrition-mobile.png'),fullPage:true});
  });
  await check('weight setup confirms stone/pounds and does not overwrite goals unless selected',async()=>{
   await page.locator('[data-screen=weight]').click();await page.locator('#weightSetup').click();
   await page.locator('#startDate').fill(C.addDays(today,-20));await page.locator('#experience').selectOption('experienced');
   assert.equal(await page.locator('#weightValue').inputValue(),'10');assert.equal(await page.locator('#weightPounds').inputValue(),'8');
   await page.locator('#saveSetup').click();
   const s=await stateOf(page);assert.equal(s.weights.length,1);assert.equal(s.weights[0].kg,67.13167076);assert.equal(s.goals.calories,2200);
  });
  await check('record, update and backdate weigh-ins without duplicate dates',async()=>{
   await page.locator('#addWeight').click();await page.locator('#weightPounds').fill('9');await page.locator('#saveWeight').click();
   await page.locator('#weightUnit').selectOption('kg');await page.locator('#addWeight').click();
   assert.equal(await page.locator('#saveWeight').innerText(),'Update recorded weight');
   await page.locator('#weightValue').fill('68');await page.locator('#saveWeight').click();
   let s=await stateOf(page);assert.equal(s.weights.length,2);assert.equal(s.weights.at(-1).kg,68);
   for(let i=1;i<=4;i++){await page.locator('#addWeight').click();await page.locator('#weightDate').fill(C.addDays(today,-i));await page.locator('#weightValue').fill(String(68-i*.05));await page.locator('#saveWeight').click();}
   s=await stateOf(page);assert.equal(s.weights.length,6);
  });
  await check('overall graph preserves the chosen starting point and exposes chart details',async()=>{
   await page.locator('#overallWeightTab').click();
   assert.equal(await page.locator('.weight-chart').count(),1);
   await page.locator('[data-chart-date="'+C.addDays(today,-20)+'"]').click();
   assert.match(await page.locator('#chartDetail').innerText(),/Starting measurement/);
   await page.screenshot({path:path.join(qa,'weight-overall-mobile.png'),fullPage:true});
   assert.equal(await page.locator('#weightContent').evaluate(e=>e.scrollWidth<=document.documentElement.clientWidth),true);
  });
  await check('backup excludes the API key and restoring it replaces data correctly',async()=>{
   await page.locator('#btnSettings').click();
   const waitDownload=page.waitForEvent('download');await page.locator('#exportBackup').click();
   const downloaded=await waitDownload,content=await fs.readFile(await downloaded.path(),'utf8'),backup=JSON.parse(content);
   assert.equal(content.includes('QA_ONLY_NOT_A_REAL_KEY'),false);assert.equal(backup.data.foods.length,4);
   await page.locator('#restoreFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(content)});
   await page.locator('#confirmAction').click();
   const s=await stateOf(page);assert.equal(s.weights.length,6);assert.equal(s.foods.length,4);
   assert.equal(await page.evaluate(()=>localStorage.getItem('gemini_key')),'QA_ONLY_NOT_A_REAL_KEY');
  });
  await check('both HTML entry points open the same app and retain data',async()=>{
   await page.goto(origin+'/MacroLog-Pro.html',{waitUntil:'domcontentloaded'});
   assert.equal((await stateOf(page)).foods.length,4);assert.equal(await page.locator('[data-screen=weight]').count(),1);
  });
  await check('offline shell reload, saved food search and weight views work without external services',async()=>{
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
   await page.reload({waitUntil:'domcontentloaded'});
   await ctx.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('[data-screen=foods]').click();await page.locator('#foodSearch').fill('Chocolate bar one');
   assert.match(await page.locator('#foodList').innerText(),/Chocolate bar one/);
   await page.locator('[data-screen=weight]').click();assert.equal(await page.locator('.weight-chart').count(),1);
   await ctx.setOffline(false);
  });
  await ctx.close();
  const legacy={goals:JSON.stringify(base()),recents:JSON.stringify([])};
  for(let i=0;i<40;i++)legacy['log:'+C.addDays(today,-i)]=JSON.stringify([{name:'Old food '+i,per100:{calories:100+i,protein:5,carbs:10,fat:2,sugar:1},grams:100,ts:Date.now()-i*86400000}]);
  const migration=await context(legacy);
  await check('all retained historical foods migrate and older foods remain searchable after deletion/reload',async()=>{
   const p=migration.page;assert.equal((await stateOf(p)).foods.length,40);
   await p.locator('#viewAllFoods').click();await p.locator('#foodSearch').fill('Old food 39');
   assert.match(await p.locator('#foodResultsCount').innerText(),/1 matching food/);
   await p.getByRole('button',{name:'Delete saved food Old food 39',exact:true}).click();await p.locator('#confirmAction').click();
   await p.reload({waitUntil:'domcontentloaded'});const s=await stateOf(p);
   assert.equal(s.foods.length,39);assert.equal(s.logs[C.addDays(today,-39)][0].name,'Old food 39');
  });
  await migration.ctx.close();
  for(const [name,slope,intake,expected]of [['slow gain',0,2640,2740],['fast gain',.06,2640,2540],['on-target gain',.015,2640,null],['incomplete intake mismatch',0,2200,null]]){
   const item=await context({[C.STORE]:JSON.stringify(coachingState(slope,intake))},720);
   await check('calorie review UI: '+name,async()=>{
    const p=item.page;await p.locator('[data-screen=weight]').click();
    if(expected){
     assert.equal(await p.locator('#applyCalorieSuggestion').count(),1);await p.locator('#applyCalorieSuggestion').click();
     assert.equal((await stateOf(p)).goals.calories,expected);
     await p.reload({waitUntil:'domcontentloaded'});await p.locator('[data-screen=weight]').click();
     assert.equal((await stateOf(p)).goals.calories,expected);assert.equal(await p.locator('#applyCalorieSuggestion').count(),0);
    }else assert.equal(await p.locator('#applyCalorieSuggestion').count(),0);
    if(name==='incomplete intake mismatch')assert.match(await p.locator('.recommend').innerText(),/2200 kcal versus a 2640 kcal target/);
   });await item.ctx.close();
  }
  const quota=await context();
  await check('failed persistence displays an error and retains the preceding saved state',async()=>{
   const p=quota.page;const previous=await stateOf(p);
   await p.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Full','QuotaExceededError');return original.call(this,k,v);};},C.STORE);
   await p.locator('#btnManual').click();await p.locator('#foodName').fill('Unsaved item');await p.locator('#saveFoodOnly').click();
   assert.match(await p.locator('#formError').innerText(),/Nothing from this action was saved/);
   assert.deepEqual(await stateOf(p),previous);
  });await quota.ctx.close();
  assert.deepEqual(pageErrors,[]);
  console.log('All '+results.length+' browser flows passed; no page JavaScript errors.');
  await fs.writeFile(path.join(qa,'browser-results.json'),JSON.stringify({passed:results.length,results,pageErrors,externalServices:'mocked',liveCamera:'not tested',liveGemini:'not tested'},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

