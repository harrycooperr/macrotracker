'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
class Storage {
  constructor(values={}){this.values={...values};this.fail=false;}
  get length(){return Object.keys(this.values).length;}
  key(i){return Object.keys(this.values)[i]??null;}
  getItem(k){return Object.hasOwn(this.values,k)?this.values[k]:null;}
  setItem(k,v){if(this.fail){const e=new Error('full');e.name='QuotaExceededError';throw e;}this.values[k]=String(v);}
}
const TODAY='2026-10-25',START='2026-09-01',NOW=Date.parse(START+'T12:00:00Z');
const target={calories:2640,protein:148,fat:75,carbs:343.25,sugar:50};
const baseFood={name:'Yoghurt',source:'manual',per100:{calories:290,protein:20,carbs:30,fat:10,sugar:5},servingG:100};
function seed(days=21,slope=0,calories=2640){
  const s=C.blank(target,START,NOW);s.settings={unit:'kg',startDate:START,experience:'experienced',gainMinPct:.5,gainMaxPct:1,adherencePct:5};
  for(let i=0;i<days;i++){
    const date=C.addDays(START,i);C.saveWeight(s,date,67.13167076+slope*i,NOW+i*86400000,TODAY,false);
    s.logs[date]=[{id:'entry-'+i,foodId:null,name:'Fixture day',per100:{...target,calories},grams:100,ts:NOW+i*86400000}];
    s.completion[date]={complete:true,updatedAt:NOW+i*86400000};
  }return s;
}
test('London calendar dates handle summer time and GMT boundaries',()=>{
  assert.equal(C.londonDate(new Date('2026-07-01T23:30:00Z')),'2026-07-02');
  assert.equal(C.londonDate(new Date('2026-10-25T00:30:00Z')),'2026-10-25');
  assert.equal(C.londonDate(new Date('2026-10-25T23:30:00Z')),'2026-10-25');
  assert.equal(C.addDays('2026-03-28',2),'2026-03-30');
  assert.equal(C.daysBetween('2026-10-24','2026-10-26'),2);
  assert.equal(C.validDate('2026-02-29'),false);
  assert.equal(C.validDate('2024-02-29'),true);
});
test('10 stone 8 is precisely 148 pounds and 67.13167076 kg',()=>{
  assert.equal(C.fromUnit(10,'stlb',8),67.13167076);
  assert.ok(Math.abs(C.fromUnit(148,'lb')-67.13167076)<1e-12);
  assert.deepEqual(C.unitFields(67.13167076,'stlb'),{value:10,pounds:8});
  assert.equal(C.formatWeight(67.13167076,'stlb'),'10 st 8 lb');
  assert.throws(()=>C.fromUnit(10.8,'stlb',0),/whole stone/);
  assert.throws(()=>C.fromUnit(10,'stlb',14),/pounds/);
  assert.throws(()=>C.fromUnit(0,'kg'),/weight/);
});
test('weight conversion round-trips do not accumulate material drift',()=>{
  let kg=67.13167076;for(let i=0;i<50;i++){const f=C.unitFields(kg,'stlb');kg=C.fromUnit(f.value,'stlb',f.pounds);}
  assert.ok(Math.abs(kg-67.13167076)<1e-10);
});
test('named foods can be saved without logging a meal',()=>{
  const s=C.blank(target,TODAY,1),f=C.upsertFood(s,baseFood,2);
  assert.equal(s.foods.length,1);assert.equal(Object.keys(s.logs).length,0);assert.equal(f.source,'manual');
  assert.throws(()=>C.upsertFood(s,{...baseFood,name:'Scanned product'},3),/recognisable name/);
});
test('different nutrition with the same food name remains distinct',()=>{
  const s=C.blank(target,TODAY,1);
  C.upsertFood(s,baseFood,2);C.upsertFood(s,{...baseFood,per100:{...baseFood.per100,calories:310}},3);
  assert.equal(s.foods.length,2);assert.notEqual(s.foods[0].id,s.foods[1].id);
});
test('barcodes and explicit IDs update the existing saved item',()=>{
  const s=C.blank(target,TODAY,1),f=C.upsertFood(s,{...baseFood,barcode:'1234567890123',source:'barcode'},2);
  C.upsertFood(s,{...baseFood,name:'Renamed yoghurt',barcode:f.barcode,source:'barcode'},3);
  assert.equal(s.foods.length,1);assert.equal(s.foods[0].id,f.id);assert.equal(s.foods[0].name,'Renamed yoghurt');
  C.upsertFood(s,{...s.foods[0],name:'Edited again'},4);assert.equal(s.foods.length,1);
});
test('portion scaling happens once and diary entries are independent snapshots',()=>{
  const s=C.blank(target,TODAY,1),f=C.upsertFood(s,baseFood,2);
  const e=C.addEntry(s,TODAY,f,150,3,TODAY);
  assert.equal(C.entryMacros(e).calories,435);assert.equal(C.entryMacros(e).protein,30);
  assert.equal(C.entryMacros({...e,grams:45*2.5}).calories,326.25);
  C.upsertFood(s,{...s.foods[0],name:'Different name',per100:{...f.per100,calories:999}},4);
  assert.equal(e.name,'Yoghurt');assert.equal(e.per100.calories,290);
  s.foods=[];assert.equal(C.totals(s.logs[TODAY]).calories,435);
});
test('adding food invalidates day completion and rejects future dates',()=>{
  const s=C.blank(target,TODAY,1),f=C.upsertFood(s,baseFood,2);
  s.completion[TODAY]={complete:true,updatedAt:1};C.addEntry(s,TODAY,f,50,3,TODAY);
  assert.equal(s.completion[TODAY].complete,false);
  assert.throws(()=>C.addEntry(s,C.addDays(TODAY,1),f,50,3,TODAY),/past diary date/);
});
test('legacy migration recovers all retained diary foods beyond the recent cap',()=>{
  const values={goals:JSON.stringify(target),gemini_key:'SECRET_DO_NOT_EXPORT'};
  values.recents=JSON.stringify(Array.from({length:15},(_,i)=>({...baseFood,name:'Food '+i})));
  for(let i=0;i<40;i++)values['log:'+C.addDays(START,i)]=JSON.stringify([{...baseFood,name:'Food '+i,grams:100,ts:NOW+i}]);
  const storage=new Storage(values),loaded=C.load(storage,TODAY,100);
  assert.equal(loaded.state.foods.length,40);assert.equal(Object.keys(loaded.state.logs).length,40);
  C.save(storage,loaded.state);const again=C.load(storage,TODAY,101);
  assert.equal(again.migrated,false);assert.equal(again.state.foods.length,40);
  assert.equal(storage.getItem('gemini_key'),'SECRET_DO_NOT_EXPORT');
});
test('legacy generic labels with distinct nutrition survive migration',()=>{
  const storage=new Storage({recents:JSON.stringify([{...baseFood,name:'Scanned product'},{...baseFood,name:'Scanned product',per100:{...baseFood.per100,protein:99}}])});
  assert.equal(C.load(storage,TODAY,1).state.foods.length,2);
});
test('deleting migrated foods does not resurrect them after reload',()=>{
  const storage=new Storage({recents:JSON.stringify([baseFood])});
  const s=C.load(storage,TODAY,1).state;s.foods=[];C.save(storage,s);
  assert.equal(C.load(storage,TODAY,2).state.foods.length,0);
  assert.ok(storage.getItem('recents'));
});
test('bad legacy records are kept in old storage with migration warnings',()=>{
  const storage=new Storage({recents:'broken','log:2026-09-01':JSON.stringify([{name:'broken',grams:-3,per100:{}}])});
  const s=C.load(storage,TODAY,1).state;assert.ok(s.migration.warnings.length>=2);
  assert.equal(storage.getItem('recents'),'broken');
});
test('invalid versioned storage is never silently reset',()=>{
  const storage=new Storage({[C.STORE]:'invalid'});
  assert.throws(()=>C.load(storage,TODAY,1),/not been overwritten/);assert.equal(storage.getItem(C.STORE),'invalid');
});
test('quota failure leaves the preceding atomic state intact',()=>{
  const storage=new Storage(),s=C.blank(target,TODAY,1);C.save(storage,s);
  const previous=storage.getItem(C.STORE);storage.fail=true;
  assert.throws(()=>C.save(storage,{...s,foods:[baseFood]}),/full/);
  assert.equal(storage.getItem(C.STORE),previous);
});
test('same-date weight replacement requires explicit update permission',()=>{
  const s=C.blank(target,TODAY,1);C.saveWeight(s,TODAY,67,1,TODAY,false);
  assert.throws(()=>C.saveWeight(s,TODAY,68,2,TODAY,false),/already has/);
  C.saveWeight(s,TODAY,68,2,TODAY,true);assert.equal(s.weights.length,1);assert.equal(s.weights[0].kg,68);
  assert.throws(()=>C.saveWeight(s,'2026-10-26',69,3,TODAY,false),/past weigh-in/);
});
test('backdated readings sort by date and deleting a baseline clears its anchor',()=>{
  const s=C.blank(target,TODAY,1);
  C.saveWeight(s,'2026-10-25',68,1,TODAY,false);C.saveWeight(s,'2026-10-01',67,2,TODAY,false);
  s.settings.startDate='2026-10-01';assert.equal(s.weights[0].date,'2026-10-01');
  C.deleteWeight(s,'2026-10-01');assert.equal(s.settings.startDate,null);assert.equal(s.weights.length,1);
});
test('rolling means use calendar windows with four real readings, never zero fills',()=>{
  const weights=[0,1,2,3,12].map((d,i)=>({date:C.addDays(START,d),kg:67+i}));
  const trend=C.trendSeries(weights);
  assert.equal(trend[2].kg,null);assert.equal(trend[3].kg,68.5);assert.equal(trend[4].kg,null);
});
test('old diary targets remain unknown before initial target creation',()=>{
  const s=C.blank(target,TODAY,1);
  assert.equal(C.targetAt(s,'2026-10-01'),null);assert.equal(C.targetAt(s,TODAY).goals.calories,2640);
});
test('a first eligible review monitors instead of immediately changing calories',()=>{
  const s=seed(14);const g=C.guidance(s,C.addDays(START,13));
  assert.equal(g.status,'monitor');assert.equal(g.proposal,null);
});
test('persistent slow gain suggests a single 100-kcal increase after two weekly reviews',()=>{
  const s=seed();C.syncReviews(s,C.addDays(START,20),1);
  const g=C.guidance(s,C.addDays(START,20));
  assert.equal(g.status,'suggest');assert.equal(g.proposal.goals.calories,2740);
  assert.equal(g.proposal.goals.protein,148);assert.equal(g.proposal.goals.fat,75);
  assert.equal(g.proposal.goals.carbs,368.25);
});
test('persistent fast gain suggests a 100-kcal decrease',()=>{
  const s=seed(21,.06);const g=C.guidance(s,C.addDays(START,20));
  assert.equal(g.status,'suggest');assert.equal(g.proposal.goals.calories,2540);
});
test('an on-target trend keeps calories unchanged',()=>{
  const s=seed(21,.015);const g=C.guidance(s,C.addDays(START,20));
  assert.equal(g.status,'on');assert.equal(g.proposal,null);
});
test('one outlier does not manufacture two agreeing weekly reviews',()=>{
  const s=seed(21,.015);s.weights.at(-1).kg+=2;
  const g=C.guidance(s,C.addDays(START,20));assert.notEqual(g.status,'suggest');
});
test('missing/incomplete food logs are unknown and block a change',()=>{
  const s=seed();for(let i=14;i<18;i++)s.completion[C.addDays(START,i)].complete=false;
  const g=C.guidance(s,C.addDays(START,20));
  assert.equal(g.status,'insufficient');assert.match(g.reason,/food days marked complete/);
});
test('actual intake is compared to the target rather than presumed equal',()=>{
  const s=seed(21,0,2200);const g=C.guidance(s,C.addDays(START,20));
  assert.equal(g.status,'insufficient');assert.match(g.reason,/2200 kcal versus a 2640 kcal target/);
});
test('a missing weight window blocks advice and irregular dates use actual observation times',()=>{
  const s=seed();s.weights=s.weights.filter((w,i)=>![7,8,9,10].includes(i));
  assert.equal(C.guidance(s,C.addDays(START,20)).status,'insufficient');
  const t=seed(21,.02);t.weights=t.weights.filter((w,i)=>![8,9,17].includes(i));
  const m=C.metrics(t,C.addDays(START,20));assert.ok(Math.abs(m.kgWeek-.14)<1e-10);
});
test('applying once updates carbs, records history, and cannot be repeated',()=>{
  const s=seed(),date=C.addDays(START,20),p=C.guidance(s,date).proposal;
  C.applyGuidance(s,date,NOW+20*86400000,p);
  assert.equal(s.goals.calories,2740);assert.equal(s.goals.carbs,368.25);
  assert.equal(s.targets.length,2);assert.equal(s.reviews.find(r=>r.id===p.id).outcome,'applied');
  assert.equal(C.guidance(s,date).status,'insufficient');
  assert.throws(()=>C.applyGuidance(s,date,NOW+20*86400000+1,p),/changed/);
  const storage=new Storage();C.save(storage,s);const loaded=C.load(storage,date,1).state;
  assert.equal(loaded.goals.calories,2740);assert.equal(C.guidance(loaded,date).proposal,null);
});
test('data edits invalidate a pending proposal',()=>{
  const s=seed(),date=C.addDays(START,20),p=C.guidance(s,date).proposal;
  s.weights.at(-1).kg+=.01;
  assert.throws(()=>C.applyGuidance(s,date,NOW,p),/changed/);
  assert.equal(s.goals.calories,2640);
});
test('keeping a target suppresses this weekly suggestion without changing goals',()=>{
  const s=seed(),date=C.addDays(START,20);
  C.dismissGuidance(s,date,NOW);
  assert.equal(C.guidance(s,date).status,'kept');assert.equal(s.goals.calories,2640);
});
test('calorie-target changes trigger a new 14-day observation period',()=>{
  const s=seed(35),date=C.addDays(START,20);
  C.changeGoals(s,{...s.goals,calories:2740},date,NOW+20*86400000,'manual',true);
  assert.equal(C.guidance(s,C.addDays(date,13)).status,'insufficient');
  assert.match(C.guidance(s,C.addDays(date,13)).reason,/14 days/);
});
test('negative carbohydrate allocations are rejected before goals change',()=>{
  const s=C.blank(target,TODAY,1);
  assert.throws(()=>C.changeGoals(s,{...s.goals,calories:1200},TODAY,2,'manual',true),/exceed/);
  assert.equal(s.goals.calories,2640);
});
test('JSON backups validate, preserve unknown historical targets and exclude the separate API key',()=>{
  const s=seed(),storage=new Storage({gemini_key:'SECRET_DO_NOT_EXPORT'});
  C.save(storage,s);const backup=C.exportBackup(s,NOW),text=JSON.stringify(backup);
  assert.equal(text.includes('SECRET_DO_NOT_EXPORT'),false);assert.equal(text.includes('gemini_key'),false);
  const restored=C.importBackup(JSON.parse(text),TODAY);
  assert.equal(restored.weights.length,21);assert.equal(C.targetAt(restored,'2026-08-31'),null);
  assert.throws(()=>C.importBackup({app:'other',format:2,data:s},TODAY),/MacroLog/);
  const bad=C.copy(backup);bad.data.weights.push({...bad.data.weights[0]});
  assert.throws(()=>C.importBackup(bad,TODAY),/only one weight/);
});
test('rendering/syncing does not repeatedly append the same formal review',()=>{
  const s=seed(),date=C.addDays(START,20);
  for(let i=0;i<20;i++){C.syncReviews(s,date,NOW+i);C.guidance(s,date);}
  assert.equal(s.reviews.length,2);assert.equal(s.goals.calories,2640);
});

