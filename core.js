/* MacroLog data, conversions and transparent calorie reviews. No network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MacroCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 2, STORE = 'macrolog:v2', LB_KG = 0.45359237, DAY = 86400000;
  const MACROS = ['calories', 'protein', 'carbs', 'fat', 'sugar'];
  const SOURCES = ['barcode', 'label', 'manual', 'legacy'];
  const DEFAULT_GOALS = {calories:2200, protein:150, carbs:220, fat:70, sugar:50};
  const copy = x => JSON.parse(JSON.stringify(x));
  function id(prefix) {
    return prefix + '_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() :
      Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  function hash(text) {
    let h = 2166136261;
    for (let i=0; i<text.length; i++) h = Math.imul(h ^ text.charCodeAt(i),16777619);
    return (h >>> 0).toString(36);
  }
  function londonDate(now) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(now || new Date());
    const get = t => parts.find(p => p.type === t).value;
    return get('year') + '-' + get('month') + '-' + get('day');
  }
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const n = Date.parse(s + 'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === s && Number(s.slice(0,4)) >= 1900;
  }
  function dayNumber(d) { if (!validDate(d)) throw new Error('Choose a valid calendar date.'); return Date.parse(d+'T00:00:00Z')/DAY; }
  function addDays(d,n) {return new Date((dayNumber(d)+n)*DAY).toISOString().slice(0,10);}
  function daysBetween(a,b) {return dayNumber(b)-dayNumber(a);}
  function number(v,label,min,max) {
    if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) throw new Error('Enter a valid '+label+'.');
    const n=Number(v);
    if (n < (min === undefined ? 0 : min) || (max !== undefined && n>max)) throw new Error('Check the '+label+'.');
    return n;
  }
  function per100(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Nutrition values are missing.');
    const result={};
    MACROS.forEach(k=>result[k]=number(p[k] === undefined ? 0 : p[k],k,0,1000000));
    return result;
  }
  function goals(g) {
    const result=per100(g);
    number(result.calories,'calorie target',1,1000000);
    return result;
  }
  function remainingCarbs(g) {
    const value=(g.calories-4*g.protein-9*g.fat)/4;
    if (value < -1e-8) throw new Error('Protein and fat already exceed your calorie target. Adjust those targets before continuing.');
    return Math.max(0,value);
  }
  function fromUnit(value,unit,pounds) {
    let kg;
    if (unit==='stlb') {
      const st=number(value,'stone',0,157);
      if (!Number.isInteger(st)) throw new Error('Enter whole stone and use the separate pounds field.');
      const lb=number(pounds,'pounds',0,13.99999999);
      kg=(st*14+lb)*LB_KG;
    } else kg=number(value,'weight',0.001,2204.62)*(unit==='lb'?LB_KG:1);
    return number(kg,'weight',0.001,1000);
  }
  function unitFields(kg,unit) {
    if (unit==='kg') return {value:kg,pounds:0};
    const lb=kg/LB_KG;
    if(unit==='lb') return {value:lb,pounds:0};
    let st=Math.floor(lb/14+1e-10), pounds=lb-st*14;
    if(pounds<1e-8) pounds=0;
    return {value:st,pounds};
  }
  function formatWeight(kg,unit,digits) {
    if (!Number.isFinite(kg)) return '—';
    const d=digits === undefined ? 2 : digits;
    const fmt=n=>Number(n.toFixed(d)).toLocaleString('en-GB',{maximumFractionDigits:d});
    if(unit==='stlb') {const f=unitFields(kg,unit); let p=Number(f.pounds.toFixed(d)),st=f.value;
      if(p>=14){st++;p=0;} return st+' st '+fmt(p)+' lb';}
    return fmt(kg/(unit==='lb'?LB_KG:1))+' '+(unit==='lb'?'lb':'kg');
  }
  function foodFingerprint(f) {
    return JSON.stringify([String(f.originalName||f.name||'').trim().toLowerCase(),String(f.brand||'').trim().toLowerCase(),
      MACROS.map(k=>Number(Number(f.per100[k]||0).toFixed(6)))]);
  }
  function cleanFood(f,now,allowGeneric) {
    if(!f || typeof f!=='object') throw new Error('Invalid food item.');
    const name=String(f.name||'').trim();
    if(!name || name.length>250) throw new Error('Enter a food name of 1–250 characters.');
    if(!allowGeneric && /^(scanned product|custom food|unknown product)$/i.test(name))
      throw new Error('Give this food a recognisable name before saving it.');
    const servingG=f.servingG === null || f.servingG === undefined || f.servingG === '' ? null : number(f.servingG,'serving weight',0.001,10000000);
    return {
      id:String(f.id||id('food')), name, originalName:String(f.originalName||name).slice(0,250),
      brand:String(f.brand||'').slice(0,250),barcode:String(f.barcode||'').slice(0,100),
      per100:per100(f.per100),servingG,servingLabel:String(f.servingLabel||'serving').slice(0,100),
      source:SOURCES.includes(f.source)?f.source:'legacy',
      createdAt:Number.isFinite(f.createdAt)?f.createdAt:now,updatedAt:Number.isFinite(f.updatedAt)?f.updatedAt:now,
      lastUsedAt:Number.isFinite(f.lastUsedAt)?f.lastUsedAt:null,
      useCount:Number.isInteger(f.useCount)&&f.useCount>=0?f.useCount:0
    };
  }
  function blank(g,today,now) {
    const initial=goals(g||DEFAULT_GOALS);
    return {version:VERSION,foods:[],logs:{},completion:{},weights:[],
      settings:{unit:'stlb',startDate:null,experience:'',gainMinPct:null,gainMaxPct:null,adherencePct:5},
      goals:initial,targets:[{id:id('target'),date:today||londonDate(),ts:now||Date.now(),goals:copy(initial),source:'initial'}],
      reviews:[],migration:{complete:true,warnings:[]}};
  }
  function normaliseEntry(e,date,index) {
    if(!e || typeof e!=='object') throw new Error('Invalid food diary entry.');
    return {id:String(e.id||'legacy_entry_'+hash(date+':'+index+':'+JSON.stringify(e))),
      foodId:e.foodId?String(e.foodId):null,name:String(e.name||'Unnamed legacy food').slice(0,250),
      per100:per100(e.per100),grams:number(e.grams,'portion weight',0.001,10000000),
      ts:Number.isFinite(e.ts)?e.ts:Date.parse(date+'T12:00:00Z')};
  }
  function migrate(storage,today,now) {
    const warnings=[];
    function read(key,fallback) {
      const raw=storage.getItem(key);
      if(raw===null) return fallback;
      try {return JSON.parse(raw);} catch {warnings.push('Could not import '+key+'; the original record was kept.');return fallback;}
    }
    let g;try{g=goals(Object.assign({},DEFAULT_GOALS,read('goals',{})));}catch{g=DEFAULT_GOALS;warnings.push('Some old goals were invalid; original storage was kept.');}
    const state=blank(g,today,now);
    const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>/^log:\d{4}-\d{2}-\d{2}$/.test(k||'')).sort();
    const map=new Map();
    function remember(raw,date,used) {
      try{
        const f=cleanFood(Object.assign({},raw,{source:'legacy',createdAt:used||now,updatedAt:used||now,lastUsedAt:used||null}),now,true);
        const fingerprint=foodFingerprint(f);
        let existing=map.get(fingerprint);
        if(!existing){
          let legacyId='legacy_'+hash(fingerprint),suffix=0;
          while(state.foods.some(x=>x.id===legacyId)) legacyId='legacy_'+hash(fingerprint)+'_'+(++suffix);
          f.id=legacyId;state.foods.push(f);map.set(fingerprint,f);existing=f;
        } else {
          if(!existing.servingG&&f.servingG) existing.servingG=f.servingG;
          existing.lastUsedAt=Math.max(existing.lastUsedAt||0,used||0)||null;
          existing.createdAt=Math.min(existing.createdAt,f.createdAt);
        }
        return existing.id;
      }catch {warnings.push('Skipped an invalid legacy food'+(date?' on '+date:'')+'; original data was kept.');return null;}
    }
    for(const key of keys){
      const date=key.slice(4);if(!validDate(date))continue;
      const raw=read(key,[]);
      if(!Array.isArray(raw)){warnings.push('Invalid diary '+date+' was kept in original storage.');continue;}
      const entries=[];
      raw.forEach((e,i)=>{
        try{
          const entry=normaliseEntry(e,date,i);
          entry.foodId=remember(e,date,entry.ts);entries.push(entry);
          if(entry.foodId) state.foods.find(f=>f.id===entry.foodId).useCount++;
        }catch {warnings.push('Skipped an invalid diary entry on '+date+'; original data was kept.');}
      });state.logs[date]=entries;
    }
    const recents=read('recents',[]);
    if(Array.isArray(recents)) recents.slice().reverse().forEach((f,i)=>remember(f,null,now-recents.length+i));
    state.migration.warnings=warnings;
    return state;
  }
  function validateState(input,today) {
    if(!input||input.version!==VERSION) throw new Error('This is not a supported MacroLog version 2 backup.');
    const out=blank(input.goals,today,Date.now());
    if(!Array.isArray(input.foods)||!Array.isArray(input.weights)||!Array.isArray(input.targets)||!Array.isArray(input.reviews)) throw new Error('The backup is missing its data collections.');
    out.foods=input.foods.map(f=>cleanFood(f,Date.now(),true));
    if(new Set(out.foods.map(f=>f.id)).size!==out.foods.length)throw new Error('The backup contains duplicate food IDs.');
    out.logs={};
    if(!input.logs||typeof input.logs!=='object'||Array.isArray(input.logs))throw new Error('Invalid food diary collection.');
    for(const [date,entries]of Object.entries(input.logs)){
      if(!validDate(date)||!Array.isArray(entries))throw new Error('Invalid food diary date or entries.');
      out.logs[date]=entries.map((e,i)=>normaliseEntry(e,date,i));
    }
    out.completion={};
    for(const [date,value]of Object.entries(input.completion||{})){
      if(!validDate(date)||!value||typeof value.complete!=='boolean')throw new Error('Invalid day-completion record.');
      out.completion[date]={complete:value.complete,updatedAt:Number(value.updatedAt)||0};
    }
    out.weights=input.weights.map(w=>{
      if(!w||!validDate(w.date)||w.date>today)throw new Error('Weight records must have valid dates that are not in the future.');
      return {date:w.date,kg:number(w.kg,'weight',0.001,1000),updatedAt:Number(w.updatedAt)||0};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    if(new Set(out.weights.map(w=>w.date)).size!==out.weights.length)throw new Error('There must be only one weight per date.');
    const s=input.settings||{};
    out.settings={
      unit:['kg','lb','stlb'].includes(s.unit)?s.unit:'kg',
      startDate:s.startDate||null,experience:['beginner','experienced','custom'].includes(s.experience)?s.experience:'',
      gainMinPct:s.gainMinPct===null||s.gainMinPct===undefined?null:number(s.gainMinPct,'minimum monthly gain',0,10),
      gainMaxPct:s.gainMaxPct===null||s.gainMaxPct===undefined?null:number(s.gainMaxPct,'maximum monthly gain',0,10),
      adherencePct:number(s.adherencePct===undefined?5:s.adherencePct,'intake tolerance',1,50)};
    if(out.settings.startDate&&!out.weights.some(w=>w.date===out.settings.startDate))throw new Error('The starting date needs a matching starting measurement.');
    if(out.settings.gainMinPct!==null&&(out.settings.gainMaxPct===null||out.settings.gainMaxPct<out.settings.gainMinPct))throw new Error('The gain range is invalid.');
    out.targets=input.targets.map(t=>{
      if(!t||!validDate(t.date)||t.date>today||!t.id)throw new Error('Invalid target-history record.');
      return {id:String(t.id),date:t.date,ts:number(t.ts,'target time',0),goals:goals(t.goals),source:String(t.source||'manual').slice(0,30)};
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.ts-b.ts);
    if(!out.targets.length||new Set(out.targets.map(t=>t.id)).size!==out.targets.length)throw new Error('Invalid target history.');
    out.goals=goals(input.goals);
    if(JSON.stringify(out.targets[out.targets.length-1].goals)!==JSON.stringify(out.goals))throw new Error('The current goals do not match the latest target record.');
    out.reviews=input.reviews.map(r=>{
      if(!r||typeof r.id!=='string'||!validDate(r.date)||r.date>today)throw new Error('Invalid review history.');
      const allowed=['id','date','computedAt','epochId','signature','qualified','direction','reason','status','outcome','outcomeAt','appliedTargetId','snapshot'];
      const clean={};allowed.forEach(k=>{if(r[k]!==undefined)clean[k]=copy(r[k]);});
      return clean;
    });
    out.migration={complete:true,warnings:Array.isArray(input.migration?.warnings)?input.migration.warnings.map(String):[]};
    return out;
  }
  function load(storage,today,now) {
    const raw=storage.getItem(STORE);
    if(raw!==null) {
      let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Saved app data could not be read. It has not been overwritten. Restore a valid backup or export the raw data from Settings.');}
      return {state:validateState(parsed,today),migrated:false};
    }
    return {state:migrate(storage,today,now),migrated:true};
  }
  function save(storage,state) {storage.setItem(STORE,JSON.stringify(state));}
  function upsertFood(state,input,now) {
    const f=cleanFood(input,now,false);
    let existing=input.id?state.foods.find(x=>x.id===input.id):null;
    if(!existing&&f.barcode)existing=state.foods.find(x=>x.barcode===f.barcode);
    if(!existing&&!input.id&&!f.barcode)existing=state.foods.find(x=>foodFingerprint(x)===foodFingerprint(f));
    if(existing){
      const updated=Object.assign({},f,{id:existing.id,createdAt:existing.createdAt,updatedAt:now,lastUsedAt:existing.lastUsedAt,useCount:existing.useCount});
      state.foods[state.foods.findIndex(x=>x.id===existing.id)]=updated;return updated;
    }
    f.updatedAt=now;state.foods.push(f);return f;
  }
  function addEntry(state,date,food,grams,now,today) {
    if(!validDate(date)||date>today)throw new Error('Choose today or a past diary date.');
    const entry={id:id('entry'),foodId:food.id,name:food.name,per100:copy(food.per100),grams:number(grams,'amount eaten',0.001,10000000),ts:now};
    (state.logs[date]||(state.logs[date]=[])).push(entry);
    const f=state.foods.find(x=>x.id===food.id);if(f){f.lastUsedAt=now;f.useCount++;}
    state.completion[date]={complete:false,updatedAt:now};return entry;
  }
  function entryMacros(e) {const result={};MACROS.forEach(k=>result[k]=e.per100[k]*e.grams/100);return result;}
  function totals(entries) {const result=Object.fromEntries(MACROS.map(k=>[k,0]));(entries||[]).forEach(e=>{const m=entryMacros(e);MACROS.forEach(k=>result[k]+=m[k]);});return result;}
  function saveWeight(state,date,kg,now,today,allowUpdate) {
    if(!validDate(date)||date>today)throw new Error('Choose today or a past weigh-in date.');
    number(kg,'weight',0.001,1000);
    const found=state.weights.findIndex(w=>w.date===date);
    if(found>=0&&!allowUpdate)throw new Error('This date already has a weight. Choose Update recorded weight to replace it.');
    const w={date,kg,updatedAt:now};if(found>=0)state.weights[found]=w;else state.weights.push(w);
    state.weights.sort((a,b)=>a.date.localeCompare(b.date));return w;
  }
  function deleteWeight(state,date) {
    state.weights=state.weights.filter(w=>w.date!==date);
    if(state.settings.startDate===date) state.settings.startDate=null;
  }
  function targetAt(state,date) {
    return state.targets.filter(t=>t.date<=date).sort((a,b)=>a.date.localeCompare(b.date)||a.ts-b.ts).at(-1)||null;
  }
  function calorieEpoch(state) {
    const list=state.targets.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.ts-b.ts);
    let epoch=list[0];for(let i=1;i<list.length;i++)if(list[i].goals.calories!==list[i-1].goals.calories)epoch=list[i];
    return epoch;
  }
  function changeGoals(state,input,today,now,source,recalculate) {
    let g=goals(input);
    if(g.calories!==state.goals.calories||recalculate)g.carbs=remainingCarbs(g);
    else remainingCarbs(g);
    if(JSON.stringify(g)===JSON.stringify(state.goals))return null;
    const t={id:id('target'),date:today,ts:Math.max(now,(state.targets.at(-1)?.ts||0)+1),goals:copy(g),source:source||'manual'};
    state.goals=g;state.targets.push(t);return t;
  }
  function trendSeries(weights) {
    const sorted=weights.slice().sort((a,b)=>a.date.localeCompare(b.date));
    let left=0,sum=0;
    return sorted.map((w,right)=>{
      sum+=w.kg;const cutoff=addDays(w.date,-6);
      while(left<right&&sorted[left].date<cutoff){sum-=sorted[left].kg;left++;}
      const count=right-left+1;
      return {date:w.date,kg:count>=4?sum/count:null,count};
    });
  }
  function metrics(state,asOf) {
    const epoch=calorieEpoch(state),start=addDays(asOf,-13),middle=addDays(asOf,-7),second=addDays(asOf,-6);
    const windows=[[start,middle],[second,asOf]].map(([a,b])=>{
      const weights=state.weights.filter(w=>w.date>=a&&w.date<=b);
      const dates=Array.from({length:7},(_,i)=>addDays(a,i));
      const complete=dates.filter(d=>state.completion[d]?.complete);
      const days=complete.map(date=>({date,calories:totals(state.logs[date]).calories,target:targetAt(state,date)?.goals.calories??null}));
      const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
      const average=mean(days.map(x=>x.calories)),target=days.every(x=>x.target!==null)?mean(days.map(x=>x.target)):null;
      return {start:a,end:b,weightCount:weights.length,meanKg:mean(weights.map(w=>w.kg)),meanDay:mean(weights.map(w=>dayNumber(w.date))),
        completeCount:complete.length,averageCalories:average,averageTarget:target,
        adherence:target&&average!==null?Math.abs(average-target)/target*100:null,weights,days};
    });
    const [a,b]=windows;
    const kgWeek=a.meanDay!==null&&b.meanDay!==null&&b.meanDay>a.meanDay?(b.meanKg-a.meanKg)*7/(b.meanDay-a.meanDay):null;
    const pctWeek=kgWeek!==null?kgWeek/a.meanKg*100:null;
    const low=state.settings.gainMinPct===null?null:state.settings.gainMinPct*7/30.44;
    const high=state.settings.gainMaxPct===null?null:state.settings.gainMaxPct*7/30.44;
    let direction=pctWeek===null||low===null||high===null?null:pctWeek<low-1e-9?'slow':pctWeek>high+1e-9?'fast':'on';
    const missing=[];
    if(!state.settings.startDate)missing.push('Choose your starting date and weight.');
    if(low===null||high===null)missing.push('Choose your desired monthly gain range.');
    if(!state.weights.length||state.weights[0].date>start)missing.push('Collect at least 14 calendar days of weight observations.');
    windows.forEach((w,i)=>{
      const label=i?'Latest seven days':'Previous seven days';
      if(w.weightCount<4)missing.push(label+': '+w.weightCount+'/4 weigh-ins.');
      if(w.completeCount<5)missing.push(label+': '+w.completeCount+'/5 food days marked complete.');
      if(w.completeCount&&w.averageTarget===null)missing.push(label+': historical calorie targets are unknown.');
      if(w.adherence!==null&&w.adherence>state.settings.adherencePct+1e-9)
        missing.push(label+': complete-day intake averages '+Math.round(w.averageCalories)+' kcal versus a '+Math.round(w.averageTarget)+' kcal target. Review intake consistency first.');
    });
    if(start<epoch.date)missing.push('Collect a full observation window under your current calorie target.');
    if(epoch.source!=='initial'&&daysBetween(epoch.date,asOf)<14)missing.push('Wait at least 14 days after your calorie-target change.');
    if(state.settings.startDate&&asOf<addDays(state.settings.startDate,13))missing.push('Your weight journey needs 14 calendar days before its first review.');
    const signature=hash(JSON.stringify({asOf,weights:windows.map(w=>w.weights.map(x=>[x.date,x.kg])),intake:windows.map(w=>w.days),
      startDate:state.settings.startDate,min:state.settings.gainMinPct,max:state.settings.gainMaxPct,tolerance:state.settings.adherencePct,epochId:epoch.id,goals:state.goals}));
    return {asOf,windows,kgWeek,pctWeek,low,high,direction,qualified:missing.length===0,missing,signature};
  }
  function schedule(state,today) {
    const epoch=calorieEpoch(state);
    const first=[addDays(epoch.date,epoch.source==='initial'?13:14),
      state.settings.startDate?addDays(state.settings.startDate,13):today].sort().at(-1);
    if(today<first)return {epoch,first,date:null,previous:null,next:first};
    const index=Math.floor(daysBetween(first,today)/7),date=addDays(first,index*7);
    return {epoch,first,date,previous:index?addDays(date,-7):null,next:addDays(date,7)};
  }
  function guidance(state,today) {
    const live=metrics(state,today),scheduled=schedule(state,today);
    const result={status:'insufficient',title:'Not enough consistent data yet',reason:live.missing.join(' '),live,scheduled,proposal:null};
    if(!live.qualified)return result;
    if(!scheduled.date){result.reason='Keep logging until '+scheduled.first+' for your first review.';return result;}
    const baseline=metrics(state,scheduled.date);
    const previous=scheduled.previous?metrics(state,scheduled.previous):null;
    const reviewId='review_'+scheduled.epoch.id+'_'+scheduled.date;
    const record=state.reviews.find(r=>r.id===reviewId);
    result.reviewId=reviewId;result.baseline=baseline;result.previous=previous;
    if(record?.outcome==='dismissed'){result.status='kept';result.title='Current target kept';result.reason='You kept this target for this review. Your next weekly review is '+scheduled.next+'.';return result;}
    if(live.direction==='on'){result.status='on';result.title='Your gain rate is on target';result.reason='Keep your current calories. The recent weight trend is within your chosen range.';return result;}
    result.status='monitor';result.title=live.direction==='slow'?'Gain rate below your range':'Gain rate above your range';
    if(!baseline.qualified||!previous?.qualified){
      result.reason='Keep collecting consistent data. A calorie change needs two consecutive eligible weekly reviews in the same direction.';return result;
    }
    if(baseline.direction!==live.direction||previous.direction!==live.direction){
      result.reason='The eligible weekly reviews do not yet confirm a persistent change in the same direction. Keep monitoring.';return result;
    }
    const delta=live.direction==='slow'?100:-100;
    const next=Object.assign({},state.goals,{calories:state.goals.calories+delta});
    try{number(next.calories,'new calorie target',1);next.carbs=remainingCarbs(next);}
    catch(e){result.reason=e.message+' Review your Goals settings.';return result;}
    result.status='suggest';result.title=delta>0?'Consider increasing calories':'Consider decreasing calories';
    result.reason='Two eligible weekly reviews and the latest trend indicate '+(delta>0?'slower':'faster')+' gain than your chosen range, with sufficiently complete and consistent intake records.';
    result.proposal={id:reviewId,signature:live.signature,delta,goals:next};
    return result;
  }
  function syncReviews(state,today,now) {
    if(!state.settings.startDate||state.settings.gainMinPct===null||state.settings.gainMaxPct===null)return;
    const s=schedule(state,today);if(!s.date)return;
    for(const date of [s.previous,s.date].filter(Boolean)){
      const m=metrics(state,date),reviewId='review_'+s.epoch.id+'_'+date;
      const old=state.reviews.find(r=>r.id===reviewId);
      if(old?.outcome==='applied')continue;
      if(old?.signature===m.signature)continue;
      const record={id:reviewId,date,computedAt:now,epochId:s.epoch.id,signature:m.signature,qualified:m.qualified,direction:m.direction,
        reason:m.missing.join(' '),status:m.qualified?'reviewed':'insufficient',snapshot:copy(m)};
      if(old){if(old.outcome){record.outcome=old.outcome;record.outcomeAt=old.outcomeAt;}state.reviews[state.reviews.indexOf(old)]=record;}
      else state.reviews.push(record);
    }
  }
  function applyGuidance(state,today,now,proposal) {
    const g=guidance(state,today);
    if(!g.proposal||g.proposal.id!==proposal.id||g.proposal.signature!==proposal.signature)throw new Error('This recommendation has changed. Review the latest guidance before applying it.');
    syncReviews(state,today,now);
    const t=changeGoals(state,g.proposal.goals,today,now,'review',true);
    const r=state.reviews.find(x=>x.id===g.proposal.id);
    r.outcome='applied';r.outcomeAt=now;r.appliedTargetId=t.id;
    return t;
  }
  function dismissGuidance(state,today,now) {
    syncReviews(state,today,now);const g=guidance(state,today);
    if(!g.reviewId)throw new Error('There is no eligible review to keep yet.');
    const r=state.reviews.find(x=>x.id===g.reviewId);r.outcome='dismissed';r.outcomeAt=now;
  }
  function exportBackup(state,now) {return {app:'MacroLog',format:VERSION,exportedAt:new Date(now||Date.now()).toISOString(),data:copy(state)};}
  function importBackup(raw,today) {
    if(!raw||raw.app!=='MacroLog'||raw.format!==VERSION)throw new Error('Choose a MacroLog version 2 JSON backup.');
    return validateState(raw.data,today);
  }
  return {VERSION,STORE,LB_KG,MACROS,DEFAULT_GOALS,copy,id,londonDate,validDate,dayNumber,addDays,daysBetween,number,per100,goals,remainingCarbs,
    fromUnit,unitFields,formatWeight,foodFingerprint,cleanFood,blank,migrate,validateState,load,save,upsertFood,addEntry,entryMacros,totals,
    saveWeight,deleteWeight,targetAt,calorieEpoch,changeGoals,trendSeries,metrics,schedule,guidance,syncReviews,applyGuidance,dismissGuidance,exportBackup,importBackup};
});

