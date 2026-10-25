/* MacroLog UI. All persistent writes are atomic replacements of the versioned state key. */
(function () {
  'use strict';
  const C=window.MacroCore,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:d}):'—';
  const dateLabel=d=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
  const inputNumber=n=>Number(Number(n).toFixed(10)).toString();
  const macroDefs=[['protein','Protein','#3dd6c4'],['carbs','Carbs','#ffc145'],['fat','Fat','#a78bfa'],['sugar','Sugar','#f25f9c']];
  const sourceLabels={barcode:'Barcode · Open Food Facts',label:'Nutrition-label photo',manual:'Manually entered',legacy:'Imported from your saved history'};
  const D=$('appDialog');
  let today=C.londonDate(),selectedDay=today,screen='nutrition',weightView='daily',weightRange=30;
  let foodQuery='',foodSort='recent',foodLimit=50,weightHistoryLimit=20;
  let state,storageBlocked=false,statusTimer,lastFocus=null,foodObserver=null;
  function banner(message){$('storageBanner').textContent=message;$('storageBanner').hidden=!message;}
  function toast(message,spinning=false,duration=4000){
    clearTimeout(statusTimer);$('status').innerHTML=(spinning?'<span class="spin" aria-hidden="true"></span>':'')+esc(message);
    $('status').classList.add('show');if(duration)statusTimer=setTimeout(()=>$('status').classList.remove('show'),duration);
  }
  function hideToast(){clearTimeout(statusTimer);$('status').classList.remove('show');}
  function report(error){
    const message=error?.name==='QuotaExceededError'?'Device storage is full. Nothing from this action was saved. Export a backup in Settings, then free some browser storage.':error?.message||'Something went wrong. Please try again.';
    if(error?.name==='QuotaExceededError'||error?.name==='SecurityError')banner(message);
    const box=$('formError');if(D.open&&box){box.textContent=message;box.hidden=false;box.scrollIntoView({block:'nearest'});}
    else toast(message,false,6500);
  }
  function persist(mutator,message){
    if(storageBlocked){report(new Error('Saved data is unavailable. Use Settings to restore a valid backup before making changes.'));return false;}
    try{
      const draft=C.copy(state);mutator(draft);C.syncReviews(draft,today,Date.now());
      const clean=C.validateState(draft,today);
      C.save(localStorage,clean);state=clean;render();
      if(message)toast(message);return true;
    }catch(e){report(e);return false;}
  }
  try{
    const result=C.load(localStorage,today,Date.now());state=result.state;
    C.syncReviews(state,today,Date.now());C.save(localStorage,state);
    if(state.migration.warnings.length)banner('Some older records could not be imported. Their original storage was preserved. Open Settings for the migration details.');
  }catch(e){state=C.blank(null,today,Date.now());storageBlocked=true;banner(e.message+' Existing data has not been cleared. Use Settings for recovery.');}
  function openDialog(title,content){
    lastFocus=document.activeElement;
    $('dialogBody').innerHTML=`<div class="handle" aria-hidden="true"></div><div class="dialog-head"><h3 id="dialogTitle">${esc(title)}</h3><button class="dialog-close" type="button" aria-label="Close dialog">✕</button></div><div id="formError" class="form-error" role="alert" hidden></div>${content}`;
    $('dialogBody').querySelector('.dialog-close').onclick=()=>D.close();
    if(!D.open)D.showModal();
    requestAnimationFrame(()=>D.querySelector('input:not([type=checkbox]),select,button:not(.dialog-close)')?.focus({preventScroll:true}));
  }
  D.addEventListener('close',()=>lastFocus?.isConnected&&lastFocus.focus({preventScroll:true}));
  D.addEventListener('click',e=>{if(e.target===D){const r=D.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right)D.close();}});
  function confirmDialog(title,message,action,label='Confirm',extra=''){
    openDialog(title,`<p class="form-helper">${esc(message)}</p>${extra}<div class="form-actions"><button class="secondary" id="cancelConfirm">Cancel</button><button class="primary" id="confirmAction">${esc(label)}</button></div>`);
    $('cancelConfirm').onclick=()=>D.close();$('confirmAction').onclick=()=>{if(action()!==false)D.close();};
  }
  function setScreen(next){
    screen=next;
    document.querySelectorAll('[data-screen]').forEach(b=>{if(b.dataset.screen===screen)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    ['nutrition','foods','weight'].forEach(s=>$(s+'Screen').hidden=s!==screen);
    if(screen==='foods')renderFoods();if(screen==='weight')renderWeight();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function render(){ $('dateLbl').textContent=dateLabel(today);renderNutrition();if(screen==='foods')renderFoods();if(screen==='weight')renderWeight();}
  function recentFoods(){
    return state.foods.slice().sort((a,b)=>(b.lastUsedAt||b.updatedAt)-(a.lastUsedAt||a.updatedAt)||a.name.localeCompare(b.name));
  }
  function renderNutrition(){
    $('diaryDate').value=selectedDay;$('diaryDate').max=today;$('nextDay').disabled=selectedDay>=today;
    const entries=state.logs[selectedDay]||[],total=C.totals(entries),target=C.targetAt(state,selectedDay)?.goals;
    const remaining=target?target.calories-total.calories:null;
    $('ringEyebrow').textContent=target?(remaining<0?'Above target':'Remaining'):'Logged';
    $('calRemain').textContent=nf(target?Math.abs(remaining):total.calories);
    $('ringUnit').textContent=target?(remaining<0?'kcal above target':'kcal remaining'):'kcal · target unknown';
    $('legGoal').textContent=target?nf(target.calories):'—';$('legFood').textContent=nf(total.calories);
    $('legPct').textContent=target?nf(total.calories/target.calories*100)+'%':'—';
    $('calRing').style.strokeDashoffset=578*(1-(target?Math.min(1,total.calories/target.calories):0));
    $('calRing').style.stroke=remaining!==null&&remaining<0?'#ef4444':'url(#calGrad)';
    $('macros').innerHTML=macroDefs.map(([key,label,color])=>{
      const value=total[key],goal=target?.[key],pct=goal>0?Math.min(1,value/goal):0,circ=2*Math.PI*26;
      return `<div class="macro-card"><div class="macro-arcwrap"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--track)" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-pct)}"/></svg><span class="macro-arc-center">${nf(value)}</span></div><div class="macro-text"><div class="macro-name"><span class="macro-dot" style="background:${color}"></span>${label}</div><div class="macro-sub">${nf(value,1)} / ${target?nf(goal,1):'—'} g</div></div></div>`;
    }).join('');
    $('foodCount').textContent='('+state.foods.length+')';
    $('recentsRow').innerHTML=recentFoods().slice(0,6).map(f=>`<button class="recent-chip" data-food-open="${esc(f.id)}"><span class="rc-bar" style="background:var(--c-pro)"></span><span class="rc-add" aria-hidden="true">+</span><span class="rc-name" style="display:block">${esc(f.name)}</span><span class="rc-meta" style="display:block">${nf(f.per100.calories)} kcal / 100 g</span></button>`).join('')||'<p class="subtle">Saved and previously logged foods will appear here.</p>';
    $('diaryTitle').textContent=selectedDay===today?"Today's food":dateLabel(selectedDay);
    $('logTotal').textContent=entries.length+' item'+(entries.length===1?'':'s');
    $('logList').innerHTML=entries.map(e=>{
      const m=C.entryMacros(e);
      return `<div class="entry"><div class="swatch" style="background:var(--accent)"></div><div class="entry-info"><div class="entry-name">${esc(e.name)}</div><div class="entry-meta"><span>${nf(e.grams,2)} g</span><span>P <b>${nf(m.protein,1)}</b></span><span>C <b>${nf(m.carbs,1)}</b></span><span>F <b>${nf(m.fat,1)}</b></span></div></div><div class="entry-cal">${nf(m.calories)}</div><button class="entry-del" data-entry-edit="${esc(e.id)}" aria-label="Edit ${esc(e.name)}">✎</button><button class="entry-del" data-entry-delete="${esc(e.id)}" aria-label="Delete ${esc(e.name)}">×</button></div>`;
    }).join('')||'<div class="empty"><div class="big" aria-hidden="true">◉</div>No food logged for this date.<br>Scan, add manually, or choose a saved food.</div>';
    $('dayComplete').checked=!!state.completion[selectedDay]?.complete;
    $('dayTargetNote').textContent=target?'Editing this diary marks it incomplete until you confirm all food is recorded again.':'A calorie target was not recorded for this date. Its target remains unknown in historical comparisons.';
  }
  function renderFoods(){
    const needle=foodQuery.trim().toLowerCase();
    let foods=state.foods.filter(f=>[f.name,f.originalName,f.brand,f.barcode].join(' ').toLowerCase().includes(needle));
    foods.sort(foodSort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(b.lastUsedAt||b.updatedAt)-(a.lastUsedAt||a.updatedAt)||a.name.localeCompare(b.name));
    $('foodResultsCount').textContent=foods.length+' matching food'+(foods.length===1?'':'s')+' · '+state.foods.length+' saved';
    $('foodList').innerHTML=foods.slice(0,foodLimit).map(f=>`<article class="food-row"><div class="food-top"><div><h3>${esc(f.name)}</h3><span class="source-tag">${esc(sourceLabels[f.source])}</span></div><strong>${nf(f.per100.calories)}<span class="subtle"> kcal</span></strong></div><div class="food-meta">Per 100 g · P ${nf(f.per100.protein,1)} g · C ${nf(f.per100.carbs,1)} g · F ${nf(f.per100.fat,1)} g<br>${f.servingG?'1 '+esc(f.servingLabel)+' = '+nf(f.servingG,2)+' g':'Choose any gram amount'}${f.barcode?' · '+esc(f.barcode):''}</div><div class="food-actions"><button class="primary" data-food-open="${esc(f.id)}">+ Log food</button><button class="secondary" data-food-edit="${esc(f.id)}">Edit</button><button class="secondary" data-food-delete="${esc(f.id)}" aria-label="Delete saved food ${esc(f.name)}">×</button></div></article>`).join('')||
      `<div class="empty">${needle?'No matching foods. Try a different name or barcode.':'Your food library is ready. Scan a product or add your first food manually.'}</div>`;
    $('loadMoreFoods').hidden=foods.length<=foodLimit;
    if(foodObserver)foodObserver.disconnect();
    if('IntersectionObserver'in window&&!$('loadMoreFoods').hidden){
      foodObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&screen==='foods'){foodLimit+=50;renderFoods();}},{rootMargin:'150px'});
      foodObserver.observe($('loadMoreFoods'));
    }
  }
  function openFood(input,options={}){
    const existing=input?.id&&state.foods.some(f=>f.id===input.id),manual=!input;
    const food=C.copy(input||{name:'',originalName:'',per100:Object.fromEntries(C.MACROS.map(k=>[k,0])),source:'manual',servingG:null,servingLabel:'serving'});
    const source=food.source||'legacy',defaultG=options.grams||food.servingG||100;
    const isSnapshot=!!options.entryId;
    let mode=food.servingG&&!isSnapshot?'servings':'grams',basis=manual?'portion':'per100';
    openDialog(isSnapshot?'Edit diary entry':existing?'Log or edit food':'Save a food',`
      <form id="foodForm">
        <span class="source-tag">${isSnapshot?'Diary snapshot':esc(sourceLabels[source])}</span>
        <label class="form-field"><span>Food name</span><input name="foodName" id="foodName" type="text" maxlength="250" value="${esc(/^(Scanned product|Custom food)$/i.test(food.name)?'':food.name)}" placeholder="e.g. Tesco Greek yoghurt" required></label>
        ${isSnapshot?'<p class="form-helper">Changes affect this diary entry only, not your saved food.</p>':''}
        <details id="foodDetails" ${!existing||options.edit||isSnapshot?'open':''}><summary>Nutrition and serving details</summary>
          <label class="form-field"><span>Nutrition values are for</span><select id="nutritionBasis"><option value="per100" ${basis==='per100'?'selected':''}>100 grams</option><option value="portion" ${basis==='portion'?'selected':''}>The amount entered below</option></select></label>
          <div class="form-grid">${C.MACROS.map(k=>`<label class="form-field"><span>${k==='calories'?'Calories (kcal)':k[0].toUpperCase()+k.slice(1)+' (g)'}</span><input type="number" step="any" min="0" max="1000000" name="nutri_${k}" value="${food.per100[k]||0}" required></label>`).join('')}</div>
          <div class="form-grid"><label class="form-field"><span>Default serving weight (g), optional</span><input id="servingG" name="servingG" type="number" min="0.001" max="10000000" step="any" value="${food.servingG||''}" placeholder="e.g. 45"></label><label class="form-field"><span>Serving name</span><input name="servingLabel" type="text" maxlength="100" value="${esc(food.servingLabel||'serving')}" placeholder="e.g. bar"></label></div>
          <p class="form-helper">Nutrition is saved per 100 g. Portion amounts are calculated from that definition.</p>
        </details>
        <div class="amount-modes" aria-label="Amount unit"><button type="button" data-amount-mode="grams" aria-pressed="${mode==='grams'}">Grams</button><button type="button" data-amount-mode="servings" aria-pressed="${mode==='servings'}" id="servingsMode" ${!food.servingG?'disabled':''}>Servings / items</button></div>
        <label class="form-field" id="gramsWrap"><span>Amount (grams)</span><input id="foodGrams" type="number" min="0.001" max="10000000" step="any" value="${defaultG}"></label>
        <label class="form-field" id="servingsWrap"><span>Number of servings / items</span><input id="foodServings" type="number" min="0.001" step="any" value="1"></label>
        <p id="portionNote" class="form-helper"></p>
        <div class="preview-grid" id="foodPreview"></div>
        <div class="form-actions">${!isSnapshot?'<button class="secondary" type="button" id="saveFoodOnly">Save food</button>':''}<button class="primary" type="submit">${isSnapshot?'Update diary entry':existing?"Add to diary":'Save and add'}</button></div>
        <p class="form-helper">Diary date: ${esc(dateLabel(selectedDay))}. Saving a food alone does not log a portion.</p>
      </form>`);
    const form=$('foodForm'),gramsInput=$('foodGrams'),servingsInput=$('foodServings'),servingInput=$('servingG');
    function gramAmount(){return mode==='servings'?Number(servingsInput.value)*Number(servingInput.value):Number(gramsInput.value);}
    function getNutrition(){
      const raw={};C.MACROS.forEach(k=>raw[k]=C.number(form.elements['nutri_'+k].value,k,0,1000000));
      if(basis==='portion'){const g=C.number(gramAmount(),'amount eaten',0.001,10000000);C.MACROS.forEach(k=>raw[k]=raw[k]*100/g);}
      return C.per100(raw);
    }
    function preview(){
      $('gramsWrap').hidden=mode!=='grams';$('servingsWrap').hidden=mode!=='servings';
      gramsInput.required=mode==='grams';gramsInput.disabled=mode!=='grams';servingsInput.required=mode==='servings';servingsInput.disabled=mode!=='servings';
      $('servingsMode').disabled=!(Number(servingInput.value)>0);
      form.querySelectorAll('[data-amount-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.amountMode===mode)));
      try{
        const g=C.number(gramAmount(),'amount eaten',0.001,10000000),p=getNutrition();
        $('portionNote').textContent=mode==='servings'?nf(Number(servingsInput.value),3)+' × '+nf(Number(servingInput.value),3)+' g = '+nf(g,3)+' g':'Choose any portion. You can change it each time you log this food.';
        $('foodPreview').innerHTML=C.MACROS.map((k,i)=>`<div class="preview ${['cal','pro','carb','fat','sug'][i]}"><span class="num">${nf(p[k]*g/100,1)}</span><span class="lbl">${k==='calories'?'kcal':k+' g'}</span></div>`).join('');
      }catch{$('foodPreview').textContent='Enter valid nutrition and a positive amount to preview this portion.';}
    }
    form.addEventListener('input',()=>{
      if(mode==='servings'&&!(Number(servingInput.value)>0)){gramsInput.value=defaultG;mode='grams';}
      preview();
    });
    form.querySelectorAll('[data-amount-mode]').forEach(b=>b.onclick=()=>{
      const amount=gramAmount(),next=b.dataset.amountMode;if(next==='servings'&&!(Number(servingInput.value)>0))return;
      if(next==='grams')gramsInput.value=Number.isFinite(amount)&&amount>0?inputNumber(amount):defaultG;
      else servingsInput.value=Number.isFinite(amount)&&amount>0?inputNumber(amount/Number(servingInput.value)):'1';
      mode=next;preview();
    });
    $('nutritionBasis').onchange=e=>{
      try{
        const previous=getNutrition(),g=C.number(gramAmount(),'amount eaten',0.001,10000000);basis=e.target.value;
        C.MACROS.forEach(k=>form.elements['nutri_'+k].value=inputNumber(previous[k]*(basis==='portion'?g/100:1)));
        preview();
      }catch(err){e.target.value=basis;report(err);}
    };
    function submit(logIt){
      if(!form.reportValidity())return;
      try{
        const amount=C.number(gramAmount(),'amount eaten',0.001,10000000),nutrition=getNutrition();
        const updated=Object.assign({},food,{name:form.elements.foodName.value.trim(),originalName:food.originalName||food.name||form.elements.foodName.value.trim(),
          per100:nutrition,source,servingG:servingInput.value?C.number(servingInput.value,'serving weight',0.001,10000000):(manual&&basis==='portion'?amount:null),
          servingLabel:form.elements.servingLabel.value.trim()||'serving'});
        C.cleanFood(updated,Date.now(),false);
        const ok=persist(draft=>{
          if(isSnapshot){
            const entry=draft.logs[selectedDay]?.find(e=>e.id===options.entryId);
            if(!entry)throw new Error('This diary entry is no longer available.');
            entry.name=updated.name;entry.per100=C.copy(nutrition);entry.grams=amount;
            draft.completion[selectedDay]={complete:false,updatedAt:Date.now()};
          }else{
            const saved=C.upsertFood(draft,updated,Date.now());
            if(logIt)C.addEntry(draft,selectedDay,saved,amount,Date.now(),today);
          }
        },isSnapshot?'Diary entry updated.':logIt?'Food saved and added to your diary.':'Food saved. No calories added to your diary.');
        if(ok)D.close();
      }catch(err){report(err);}
    }
    if($('saveFoodOnly'))$('saveFoodOnly').onclick=()=>submit(false);
    form.onsubmit=e=>{e.preventDefault();submit(true);};preview();
  }
  function openEntry(id){
    const entry=state.logs[selectedDay]?.find(e=>e.id===id);if(!entry)return;
    const saved=state.foods.find(f=>f.id===entry.foodId);
    openFood({name:entry.name,originalName:entry.name,per100:entry.per100,source:saved?.source||'legacy',servingG:saved?.servingG||null,servingLabel:saved?.servingLabel||'serving'},
      {entryId:id,grams:entry.grams});
  }
  function openGoals(){
    openDialog('Daily targets',`<form id="goalsForm"><p class="form-helper">These are your current targets. Past target records stay unchanged. Changing calories recalculates carbohydrates while keeping your selected protein and fat.</p><div class="form-grid">${C.MACROS.map(k=>`<label class="form-field"><span>${k==='calories'?'Calories (kcal)':k[0].toUpperCase()+k.slice(1)+' (g)'}</span><input type="number" step="any" min="${k==='calories'?1:0}" name="${k}" value="${state.goals[k]}" required></label>`).join('')}</div><label class="check-row form-field"><input id="recalcCarbs" type="checkbox"><span>Recalculate carbs from calories, protein and fat</span></label><p class="form-helper" id="goalCalculation"></p><div class="form-actions"><button class="primary" type="submit">Save targets</button></div></form>`);
    const form=$('goalsForm');
    form.oninput=()=>{try{const g=Object.fromEntries(C.MACROS.map(k=>[k,Number(form.elements[k].value)]));$('goalCalculation').textContent='Calculated carbs: '+nf(C.remainingCarbs(g),2)+' g. Sugar is included in total carbohydrate.';}catch(e){$('goalCalculation').textContent=e.message;}};
    form.oninput();
    form.onsubmit=e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const g=Object.fromEntries(C.MACROS.map(k=>[k,Number(form.elements[k].value)]));
      if(persist(draft=>C.changeGoals(draft,g,today,Date.now(),'manual',$('recalcCarbs').checked),'Daily targets saved.'))D.close();
    };
  }
  function download(name,object){
    const blob=new Blob([JSON.stringify(object,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function exportData(){
    if(storageBlocked){
      const records={};try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key===C.STORE||key==='goals'||key==='recents'||/^log:\d{4}-\d{2}-\d{2}$/.test(key||''))records[key]=localStorage.getItem(key);}}catch(e){report(e);return;}
      download('MacroLog-recovery-'+today+'.json',{app:'MacroLog raw recovery',records});
    }else download('MacroLog-backup-'+today+'.json',C.exportBackup(state));
    toast('Backup download started. Your Gemini key is excluded.');
  }
  function openSettings(){
    openDialog('Settings & backup',`<form id="keyForm"><label class="form-field"><span>Gemini API key for label scanning</span><input id="keyInput" type="password" autocomplete="off" placeholder="Paste your API key"></label><p class="form-helper">Your key stays in this browser and is excluded from backups. Barcode lookup does not need a Gemini key.</p><button class="secondary" type="submit">Save API key</button></form><div class="panel"><h3>Your data</h3><p class="form-helper">Saved on this device and browser. Keep a backup before changing devices, browser profiles or website addresses. Restoring a backup replaces the current app data; your API key stays unchanged.</p><div class="actions"><button class="secondary" id="exportBackup">Download backup</button><button class="secondary" id="restoreBackup">Restore JSON</button></div></div>${state.migration.warnings.length?`<details><summary>Migration details (${state.migration.warnings.length})</summary><ul>${state.migration.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')}</ul></details>`:''}<p class="form-helper">MacroLog 2 · Daily weight observations and a transparent weekly review. Guidance estimates progress from your logs; scale weight does not identify muscle gain.</p>`);
    try{$('keyInput').value=localStorage.getItem('gemini_key')||'';}catch{}
    $('keyForm').onsubmit=e=>{e.preventDefault();try{localStorage.setItem('gemini_key',$('keyInput').value.trim());toast('API key saved on this device.');D.close();}catch(err){report(err);}};
    $('exportBackup').onclick=exportData;$('restoreBackup').onclick=()=>$('restoreFile').click();
  }
  $('restoreFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{
      const imported=C.importBackup(JSON.parse(await file.text()),today);
      confirmDialog('Restore your backup?',`This replaces your current app data with ${imported.foods.length} saved foods, ${Object.keys(imported.logs).length} diary dates and ${imported.weights.length} weigh-ins. Download a backup first if you need to keep the current version. Your API key will not change.`,()=>{
        try{C.syncReviews(imported,today,Date.now());C.save(localStorage,imported);state=imported;storageBlocked=false;banner('');render();toast('Backup restored.');return true;}
        catch(err){report(err);return false;}
      },'Replace and restore','<button class="secondary" id="backupBeforeRestore" style="width:100%;margin-top:12px">Download current data first</button>');
      $('backupBeforeRestore').onclick=exportData;
    }catch(err){report(new Error('Backup could not be restored: '+err.message));}
  };
  function weightFields(unit,kg){
    const f=C.unitFields(kg,unit);
    return `<div class="form-grid"><label class="form-field"><span id="weightValueLabel">${unit==='stlb'?'Whole stone':unit==='lb'?'Pounds':'Kilograms'}</span><input id="weightValue" type="number" step="${unit==='stlb'?'1':'any'}" min="${unit==='stlb'?0:0.001}" value="${inputNumber(f.value)}" required></label><label class="form-field" id="weightPoundsWrap" ${unit!=='stlb'?'hidden':''}><span>Pounds (0 to under 14)</span><input id="weightPounds" type="number" step="any" min="0" max="13.99999999" value="${inputNumber(f.pounds)}" ${unit==='stlb'?'required':'disabled'}></label></div><p class="form-helper" id="weightConversion"></p>`;
  }
  function bindWeightFields(form,unitId){
    let unit=$(unitId).value;
    const read=()=>C.fromUnit($('weightValue').value,unit,$('weightPounds').value);
    function updateNote(){try{$('weightConversion').textContent=C.formatWeight(read(),'kg',3)+' · '+C.formatWeight(read(),'lb',3);}catch{$('weightConversion').textContent='Enter a positive weight. Stone and pounds use separate fields.';}}
    $(unitId).onchange=()=>{
      let kg;try{kg=read();}catch{kg=67.13167076;}
      unit=$(unitId).value;const fields=C.unitFields(kg,unit);
      $('weightValue').value=inputNumber(fields.value);$('weightValue').step=unit==='stlb'?'1':'any';$('weightValue').min=unit==='stlb'?'0':'0.001';
      $('weightValueLabel').textContent=unit==='stlb'?'Whole stone':unit==='lb'?'Pounds':'Kilograms';
      $('weightPoundsWrap').hidden=unit!=='stlb';$('weightPounds').disabled=unit!=='stlb';$('weightPounds').required=unit==='stlb';$('weightPounds').value=inputNumber(fields.pounds);
      updateNote();
    };
    form.addEventListener('input',updateNote);updateNote();return read;
  }
  function unitOptions(unit){return [['kg','Kilograms'],['lb','Pounds'],['stlb','Stone + pounds']].map(([v,l])=>`<option value="${v}" ${v===unit?'selected':''}>${l}</option>`).join('');}
  function openWeightSetup(){
    const s=state.settings,baseline=state.weights.find(w=>w.date===s.startDate),unit=s.unit||'stlb';
    openDialog('Set up your weight journey',`<form id="setupForm"><p class="form-helper">Choose your actual starting date and confirm the starting reading. The suggested 10 st 8 lb is editable and is not saved until you confirm.</p><label class="form-field"><span>Starting date</span><input id="startDate" type="date" max="${today}" value="${s.startDate||''}" required></label><label class="form-field"><span>Weight unit</span><select id="setupUnit">${unitOptions(unit)}</select></label>${weightFields(unit,baseline?.kg||67.13167076)}<label class="form-field"><span>Lean-bulk gain preset</span><select id="experience" required><option value="">Choose a preset or custom range</option><option value="beginner" ${s.experience==='beginner'?'selected':''}>Beginner · 1–2% per month</option><option value="experienced" ${s.experience==='experienced'?'selected':''}>Intermediate / advanced · 0.5–1% per month</option><option value="custom" ${s.experience==='custom'?'selected':''}>Custom monthly range</option></select></label><div class="form-grid"><label class="form-field"><span>Minimum gain (% per month)</span><input id="gainMin" type="number" min="0" max="10" step="any" value="${s.gainMinPct??''}" required></label><label class="form-field"><span>Maximum gain (% per month)</span><input id="gainMax" type="number" min="0" max="10" step="any" value="${s.gainMaxPct??''}" required></label></div><label class="form-field"><span>Complete-day intake tolerance (%)</span><input id="adherencePct" type="number" min="1" max="50" step="any" value="${s.adherencePct}" required></label><p class="form-helper">Calorie reviews require your complete-day intake average to be this close to your target in each week. Default 5% is a configurable app rule.</p><label class="check-row form-field"><input id="useDiscussedTargets" type="checkbox"><span>Use our discussed starting nutrition targets<small>2,640 kcal · 148 g protein · 75 g fat · approximately 343 g carbs. Your saved sugar target stays unchanged. Existing targets are only changed if you select this.</small></span></label><p id="setupDateNotice" class="form-helper"></p><div class="form-actions"><button class="primary" id="saveSetup" type="submit">Save journey setup</button></div></form>`);
    const form=$('setupForm'),read=bindWeightFields(form,'setupUnit');
    function preset(setValues){
      const exp=$('experience').value;
      if(setValues&&exp==='beginner'){$('gainMin').value=1;$('gainMax').value=2;}
      if(setValues&&exp==='experienced'){$('gainMin').value=.5;$('gainMax').value=1;}
      $('gainMin').readOnly=exp!=='custom';$('gainMax').readOnly=exp!=='custom';
    }
    $('experience').onchange=()=>preset(true);preset(false);
    function dateNotice(){const w=state.weights.find(w=>w.date===$('startDate').value);$('setupDateNotice').textContent=w?'A reading already exists on this date ('+C.formatWeight(w.kg,unit)+'). Saving confirms its replacement with the starting weight entered above.':'';}
    $('startDate').oninput=dateNotice;dateNotice();
    form.onsubmit=e=>{
      e.preventDefault();if(!form.reportValidity())return;
      try{
        const kg=read(),date=$('startDate').value;
        const settings={unit:$('setupUnit').value,startDate:date,experience:$('experience').value,
          gainMinPct:Number($('gainMin').value),gainMaxPct:Number($('gainMax').value),adherencePct:Number($('adherencePct').value)};
        const useTargets=$('useDiscussedTargets').checked;
        if(persist(draft=>{
          C.saveWeight(draft,date,kg,Date.now(),today,true);draft.settings=settings;
          if(useTargets)C.changeGoals(draft,Object.assign({},draft.goals,{calories:2640,protein:148,fat:75,carbs:343.25}),today,Date.now(),'setup',true);
        },'Weight journey saved.'))D.close();
      }catch(err){report(err);}
    };
  }
  function openWeightEntry(date){
    const editing=!!date,entry=state.weights.find(w=>w.date===(date||today)),latest=state.weights.at(-1),unit=state.settings.unit;
    openDialog(editing?'Edit recorded weight':'Record your weight',`<form id="weightForm"><label class="form-field"><span>Weigh-in date</span><input id="weightDate" type="date" max="${today}" value="${date||today}" required></label><label class="form-field"><span>Weight unit</span><select id="entryUnit">${unitOptions(unit)}</select></label>${weightFields(unit,entry?.kg||latest?.kg||67.13167076)}<p class="warning" id="weightDuplicateNotice" hidden></p><div class="form-actions"><button class="primary" id="saveWeight" type="submit">Save weight</button></div></form>`);
    const form=$('weightForm'),read=bindWeightFields(form,'entryUnit');
    function duplicate(){
      const existing=state.weights.find(w=>w.date===$('weightDate').value);
      $('weightDuplicateNotice').hidden=!existing;$('weightDuplicateNotice').textContent=existing?'This date already has '+C.formatWeight(existing.kg,unit)+'. Use Update recorded weight to replace that reading.':'';
      $('saveWeight').textContent=existing?'Update recorded weight':'Save weight';
    }
    $('weightDate').oninput=duplicate;duplicate();
    form.onsubmit=e=>{
      e.preventDefault();if(!form.reportValidity())return;
      try{
        const kg=read(),d=$('weightDate').value,existing=state.weights.some(w=>w.date===d);
        if(persist(draft=>{
          if(editing&&date!==d){
            const wasStart=draft.settings.startDate===date;
            draft.weights=draft.weights.filter(w=>w.date!==date);
            C.saveWeight(draft,d,kg,Date.now(),today,existing);
            if(wasStart)draft.settings.startDate=d;
          }else C.saveWeight(draft,d,kg,Date.now(),today,existing);
        },'Weight recorded.'))D.close();
      }catch(err){report(err);}
    };
  }

  function stat(value,label){return `<div class="stat"><span class="value">${esc(value)}</span><span class="label">${esc(label)}</span></div>`;}
  function weightDelta(kg,unit){return (kg>0?'+':kg<0?'−':'')+C.formatWeight(Math.abs(kg),unit==='stlb'?'lb':unit,2);}
  function chartMarkup(weights,start,end,unit){
    const rows=weights.filter(w=>w.date>=start&&w.date<=end);
    if(!rows.length)return '<div class="chart-empty">No weigh-ins in this range. Record a weight or choose a wider range.</div>';
    const trend=C.trendSeries(weights).filter(w=>w.date>=start&&w.date<=end&&w.kg!==null);
    const W=480,H=270,left=unit==='stlb'?100:66,right=24,top=28,bottom=46;
    const values=rows.concat(trend).map(w=>w.kg);
    let min=Math.min(...values),max=Math.max(...values),pad=Math.max(.2,(max-min)*.22);
    min=Math.max(0,min-pad);max+=pad;
    const x=d=>left+(C.dayNumber(d)-C.dayNumber(start))/Math.max(1,C.daysBetween(start,end))*(W-left-right);
    const y=kg=>top+(max-kg)/(max-min)*(H-top-bottom);
    const path=arr=>arr.map((w,i)=>(i?'L':'M')+x(w.date).toFixed(2)+','+y(w.kg).toFixed(2)).join(' ');
    const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
    const xdates=Array.from(new Set([start,C.addDays(start,Math.floor(C.daysBetween(start,end)/2)),end]));
    return `<svg class="weight-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="weightChartTitle weightChartDesc"><title id="weightChartTitle">Weight measurements and seven-day trend</title><desc id="weightChartDesc">${rows.length} recorded readings from ${esc(dateLabel(start))} through ${esc(dateLabel(end))}. Orange points are measured weights. Teal is a rolling mean where at least four readings exist in seven calendar days.</desc>
      ${ticks.map(t=>`<line x1="${left}" y1="${y(t)}" x2="${W-right}" y2="${y(t)}" stroke="#293343" stroke-width="1"/><text x="${left-10}" y="${y(t)+4}" text-anchor="end" fill="#a8b2c1" font-size="14">${esc(C.formatWeight(t,unit,1))}</text>`).join('')}
      ${xdates.map((d,i)=>`<text x="${x(d)}" y="${H-17}" text-anchor="${i===0?'start':i===xdates.length-1?'end':'middle'}" fill="#a8b2c1" font-size="14">${esc(dateLabel(d).replace(/ \d{4}$/,''))}</text>`).join('')}
      <path d="${path(rows)}" fill="none" stroke="#ff6b35" stroke-width="2.5" stroke-linejoin="round"/>
      ${trend.length?`<path d="${path(trend)}" fill="none" stroke="#3dd6c4" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round"/>`:''}
      ${rows.map(w=>`<g tabindex="0" role="button" aria-label="${esc(dateLabel(w.date)+': '+C.formatWeight(w.kg,unit)+(w.date===state.settings.startDate?', starting measurement':''))}" data-chart-date="${w.date}"><title>${esc(dateLabel(w.date)+' · '+C.formatWeight(w.kg,unit))}</title><circle cx="${x(w.date)}" cy="${y(w.kg)}" r="10" fill="transparent"/><circle cx="${x(w.date)}" cy="${y(w.kg)}" r="${w.date===state.settings.startDate?5:3.5}" fill="#ff6b35" stroke="#141a25" stroke-width="1.5"/></g>`).join('')}</svg>
      <div class="chart-legend"><span>Recorded weight</span><span>7-day mean</span></div><p class="chart-detail" id="chartDetail">Select a point for its date and weight. Unrecorded days have no measurement.</p>`;
  }
  function reviewCard(){
    const g=C.guidance(state,today),m=g.live,days=m.windows.flatMap(w=>w.days),avg=days.length?days.reduce((n,d)=>n+d.calories,0)/days.length:null;
    const unit=state.settings.unit==='stlb'?'lb':state.settings.unit;
    const rate=m.kgWeek===null?'Collecting data':weightDelta(m.kgWeek,unit)+' / week';
    const gain=state.settings.gainMinPct===null?'Choose in Setup':nf(state.settings.gainMinPct,2)+'–'+nf(state.settings.gainMaxPct,2)+'% / month';
    return `<section class="panel recommend ${g.status==='suggest'?'suggest':''}" aria-label="Calorie guidance"><p class="subtle" style="margin-bottom:8px">CALORIE REVIEW</p><h3>${esc(g.title)}</h3><p class="subtle">${esc(g.reason)}</p>
      <dl class="review-details"><div><dt>Current target</dt><dd>${nf(state.goals.calories)} kcal / day</dd></div><div><dt>Logged average · complete days</dt><dd>${avg!==null?nf(avg)+' kcal':'Not enough logs'}</dd></div><div><dt>Observed weight change</dt><dd>${esc(rate)}</dd></div><div><dt>Your desired gain</dt><dd>${esc(gain)}</dd></div></dl>
      ${g.proposal?`<div class="info-note" style="margin-bottom:14px">Suggested target: <strong>${nf(g.proposal.goals.calories)} kcal / day</strong> (${g.proposal.delta>0?'+':''}${g.proposal.delta}). Protein and fat stay unchanged. Carbs become ${nf(g.proposal.goals.carbs,2)} g.</div><div class="actions"><button class="primary" id="applyCalorieSuggestion">Apply suggested target</button><button class="secondary" id="keepCalorieTarget">Keep current target</button></div>`:''}
      <button class="link-btn" id="manualCalorieTarget">Edit targets manually →</button>
      <p class="form-helper">${g.scheduled.date?'Latest review period: '+dateLabel(g.scheduled.date)+'. ':''}Next weekly review: ${dateLabel(g.scheduled.next)} · subject to enough consistent data.</p>
      <details><summary>See the data behind this guidance</summary><ul>${m.windows.map(w=>`<li>${dateLabel(w.start)}–${dateLabel(w.end)}: ${w.weightCount}/4 weigh-ins; ${w.completeCount}/5 complete food days; average intake ${w.averageCalories===null?'unknown':nf(w.averageCalories)+' kcal'}; target ${w.averageTarget===null?'unknown':nf(w.averageTarget)+' kcal'}.</li>`).join('')}</ul><p style="margin-top:10px">Daily readings update the graph and current trend. Formal reviews use two seven-day windows and need two consecutive eligible weekly reviews before proposing a 100-kcal change. The default intake tolerance is ${nf(state.settings.adherencePct,1)}%. After a calorie change, a new observation period is required. These are transparent MacroLog rules, not Jeff Nippard's exact adjustment formula or MacroFactor's algorithm.</p><p style="margin-top:10px">This is an estimate based on your entries, not a measurement of metabolism or muscle gain.</p></details>
    </section>`;
  }
  function renderWeight(){
    const unit=state.settings.unit,all=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)),baseline=all.find(w=>w.date===state.settings.startDate);
    const journey=baseline?all.filter(w=>w.date>=baseline.date):all,latest=journey.at(-1),previous=journey.at(-2),overall=weightView==='overall';
    const start=overall?(baseline?.date||today):weightRange==='all'?(baseline?.date||all[0]?.date||today):C.addDays(today,-(weightRange-1));
    const live=C.metrics(state,today),lastTrend=C.trendSeries(all).filter(w=>w.kg!==null).at(-1);
    document.querySelectorAll('[data-weight-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.weightView===weightView)));
    $('weightContent').setAttribute('aria-labelledby',overall?'overallWeightTab':'dailyWeightTab');
    $('weightContent').innerHTML=`
      ${!baseline?'<div class="info-note">Choose a starting date and confirm a starting measurement in Setup to begin your overall progress and calorie reviews.</div>':''}
      <div class="panel"><div class="weight-top"><span class="subtle">${overall?'LATEST RECORDED WEIGHT':'YOUR LATEST READING'}</span><select id="weightUnit" aria-label="Display weight unit">${unitOptions(unit)}</select></div>
      <div class="weight-latest"><div class="big-stat">${latest?esc(C.formatWeight(latest.kg,unit)):'No readings yet'}</div><p class="subtle">${latest?esc(dateLabel(latest.date))+(latest.date!==today?' · latest recorded, not a reading for today':''):'Record a weight to start your journal.'}</p></div><button class="primary" id="addWeight" style="margin-top:18px;box-shadow:none">+ Record weight</button></div>
      <div class="stats-grid">
        ${stat(baseline?C.formatWeight(baseline.kg,unit):'Not set',baseline?'Starting weight · '+dateLabel(baseline.date):'Starting weight')}
        ${stat(baseline&&latest?weightDelta(latest.kg-baseline.kg,unit):'—','Total change since your start')}
        ${stat(baseline&&latest?(latest.kg-baseline.kg>=0?'+':'')+nf((latest.kg-baseline.kg)/baseline.kg*100,2)+'%':'—','Overall percentage change')}
        ${stat(baseline?nf(C.daysBetween(baseline.date,today)):'—','Calendar days since starting date')}
        ${stat(latest&&previous?weightDelta(latest.kg-previous.kg,unit):'—',latest&&previous?'Since previous reading · '+C.daysBetween(previous.date,latest.date)+' day gap':'Since previous reading')}
        ${stat(nf(all.length),'Recorded weigh-ins')}
      </div>
      <div class="chart-panel"><div class="chart-title"><h3>${overall?'Your complete journey':'Daily readings & trend'}</h3></div>
        ${!overall?`<div class="chart-ranges" aria-label="Chart date range">${[7,30,90,'all'].map(n=>`<button data-weight-range="${n}" aria-pressed="${weightRange===n}">${n==='all'?'All time':n+' days'}</button>`).join('')}</div>`:''}
        ${overall&&!baseline?'<div class="chart-empty">Choose your starting measurement in Setup.</div>':chartMarkup(overall?journey:all,start,today,unit)}
      </div>
      <p class="form-helper">${lastTrend?'Latest seven-day mean: '+esc(C.formatWeight(lastTrend.kg,unit))+' on '+esc(dateLabel(lastTrend.date))+'. ':'The trend appears after at least four readings in a seven-calendar-day window. '}${live.kgWeek!==null?'Observed rate: '+esc(weightDelta(live.kgWeek,unit))+' per week. ':''}The teal trend averages recorded readings only. Missing days are never filled with zero.</p>
      ${reviewCard()}
      <section class="panel"><div class="section-head" style="margin:0 0 12px"><h3 style="margin:0">Weigh-in history</h3><span class="subtle">${all.length} readings</span></div>
        ${all.slice().reverse().slice(0,weightHistoryLimit).map(w=>`<div class="history-row"><div class="details"><strong>${esc(C.formatWeight(w.kg,unit))}</strong><small>${dateLabel(w.date)}${w.date===state.settings.startDate?' · Starting measurement':''}</small></div><button class="secondary" data-weight-edit="${w.date}" aria-label="Edit weight for ${dateLabel(w.date)}">Edit</button><button class="secondary" data-weight-delete="${w.date}" aria-label="Delete weight for ${dateLabel(w.date)}">×</button></div>`).join('')||'<p class="subtle">No weigh-ins recorded yet.</p>'}
        ${all.length>weightHistoryLimit?'<button class="link-btn" id="moreWeightHistory">Show more readings</button>':''}
      </section>
      <details class="panel"><summary>Calorie target & review history</summary><div class="review-history">${state.targets.slice().reverse().map(t=>`<div class="history-row"><div class="details"><strong>${nf(t.goals.calories)} kcal · ${esc(t.source)}</strong><small>Effective ${dateLabel(t.date)} · P ${nf(t.goals.protein,1)} / F ${nf(t.goals.fat,1)} / C ${nf(t.goals.carbs,1)} g</small></div></div>`).join('')}${state.reviews.slice().reverse().map(r=>`<div class="history-row"><div class="details"><strong>Review · ${dateLabel(r.date)}</strong><small>${esc(r.outcome||(!r.qualified?'Insufficient data':r.direction==='on'?'On target':r.direction==='slow'?'Below gain range':'Above gain range'))}</small></div></div>`).join('')}</div><p class="form-helper">Earlier diary dates without a stored target remain unknown.</p></details>`;
    $('weightUnit').onchange=e=>persist(draft=>{draft.settings.unit=e.target.value;});
    $('addWeight').onclick=()=>openWeightEntry();
    $('manualCalorieTarget').onclick=openGoals;
    if($('moreWeightHistory'))$('moreWeightHistory').onclick=()=>{weightHistoryLimit+=30;renderWeight();};
    if($('applyCalorieSuggestion'))$('applyCalorieSuggestion').onclick=()=>{
      const proposal=C.guidance(state,today).proposal;
      if(persist(draft=>C.applyGuidance(draft,today,Date.now(),proposal),'New calorie target applied. Carbohydrates updated.'))renderNutrition();
    };
    if($('keepCalorieTarget'))$('keepCalorieTarget').onclick=()=>persist(draft=>C.dismissGuidance(draft,today,Date.now()),'Current calorie target kept for this review.');
  }
  // Barcode camera and image fallback. ZXing is loaded only when needed.
  const video=$('video');let stream=null,reader=null,raf=null,cameraToken=0,readingBarcode=false,zxingPromise=null;
  function key(){try{return localStorage.getItem('gemini_key')||'';}catch{return '';}}
  function loadZXing(){
    if(window.ZXing)return Promise.resolve(window.ZXing);
    if(zxingPromise)return zxingPromise;
    zxingPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();zxingPromise=null;reject(new Error('Barcode decoder could not load. Check your connection, or add the food manually.'));},12000);
      script.src='https://cdnjs.cloudflare.com/ajax/libs/zxing-library/0.21.3/index.min.js';
      script.onload=()=>{clearTimeout(timer);window.ZXing?resolve(window.ZXing):reject(new Error('Barcode decoder unavailable.'));};
      script.onerror=()=>{clearTimeout(timer);zxingPromise=null;reject(new Error('Barcode decoder could not load. Check your connection.'));};
      document.head.append(script);
    });return zxingPromise;
  }
  function cameraInert(active){$('appMain').inert=active;document.querySelector('header').inert=active;document.querySelector('.bottom-nav').inert=active;}
  function stopCamera(){
    cameraToken++;if(raf)cancelAnimationFrame(raf);raf=null;
    if(reader){try{reader.reset();}catch{}reader=null;}
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    if(video.srcObject){try{video.srcObject.getTracks().forEach(t=>t.stop());}catch{}video.srcObject=null;}
    $('camOverlay').classList.remove('show');$('camOverlay').hidden=true;cameraInert(false);
  }
  async function startBarcode(){
    if(!navigator.mediaDevices?.getUserMedia){$('barcodeFile').click();return;}
    stopCamera();readingBarcode=false;const token=++cameraToken;
    $('camOverlay').hidden=false;$('camOverlay').classList.add('show');$('camHint').textContent='Centre the barcode in the frame';cameraInert(true);$('camClose').focus();
    try{
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(token!==cameraToken){media.getTracks().forEach(t=>t.stop());return;}
      stream=media;video.srcObject=media;await video.play();
      if('BarcodeDetector'in window){
        const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
        const tick=async()=>{
          if(token!==cameraToken||readingBarcode)return;
          try{const codes=await detector.detect(video);if(codes.length){onBarcode(codes[0].rawValue);return;}}catch{}
          if(token===cameraToken)raf=requestAnimationFrame(tick);
        };tick();
      }else{
        const ZX=await loadZXing();if(token!==cameraToken)return;
        reader=new ZX.BrowserMultiFormatReader();
        reader.decodeFromStream(stream,video,(result)=>{if(result&&token===cameraToken)onBarcode(result.getText());}).catch(err=>{if(token===cameraToken){$('camHint').textContent='Try a barcode photo instead.';toast(err.message||'Live decoding unavailable. Use a photo.');}});
      }
    }catch(err){
      if(token!==cameraToken)return;stopCamera();report(new Error('Camera unavailable. Allow camera access over HTTPS or localhost, or use a barcode photo.'));
      $('barcodeFile').click();
    }
  }
  async function lookupBarcode(code){
    const saved=state.foods.find(f=>f.barcode===code);if(saved)return C.copy(saved);
    const url='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'.json?fields=product_name,brands,serving_quantity,nutriments';
    const response=await fetch(url);if(!response.ok)throw new Error('Product lookup failed ('+response.status+').');
    const data=await response.json();if(data.status!==1||!data.product)return null;
    const p=data.product,n=p.nutriments||{},num=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):0;
    const name=[p.product_name,p.brands].filter(Boolean).join(' · ')||'';
    return {name,originalName:name,brand:p.brands||'',barcode:code,source:'barcode',servingG:num(p.serving_quantity)||null,servingLabel:'serving',
      per100:{calories:num(n['energy-kcal_100g']),protein:num(n.proteins_100g),carbs:num(n.carbohydrates_100g),fat:num(n.fat_100g),sugar:num(n.sugars_100g)}};
  }
  async function onBarcode(raw){
    if(readingBarcode)return;readingBarcode=true;const code=String(raw||'').trim();stopCamera();toast('Looking up product…',true,0);
    try{
      const food=await lookupBarcode(code);hideToast();
      if(food)openFood(food);
      else{toast('No match. Enter this product manually, or use Snap label.');openFood({name:'',originalName:'',barcode:code,source:'manual',per100:Object.fromEntries(C.MACROS.map(k=>[k,0])),servingG:null});}
    }catch(err){report(err);}
    finally{readingBarcode=false;}
  }
  async function barcodeImage(file){
    if('BarcodeDetector'in window&&'createImageBitmap'in window){
      const image=await createImageBitmap(file);
      try{const found=await new BarcodeDetector().detect(image);if(found.length)return found[0].rawValue;}finally{image.close();}
    }
    const ZX=await loadZXing(),url=URL.createObjectURL(file),decoder=new ZX.BrowserMultiFormatReader();
    try{return (await decoder.decodeFromImageUrl(url)).getText();}
    finally{URL.revokeObjectURL(url);decoder.reset();}
  }
  $('barcodeFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    toast('Reading barcode photo…',true,0);
    try{const code=await barcodeImage(file);readingBarcode=false;await onBarcode(code);}
    catch{hideToast();report(new Error('No barcode found in this photo. Try a clearer photo or add the food manually.'));}
  };
  function fileBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Could not read that image.'));r.readAsDataURL(file);});}
  async function readLabel(file){
    const prompt='Read this nutrition label and return ONLY JSON: {"name":string,"servingSizeG":number|null,"requiresGramConversion":boolean,"per100":{"calories":number,"protein":number,"carbs":number,"fat":number,"sugar":number}}. Values must be PER 100 GRAMS. Convert per-serving values only if the serving mass in grams is available. Do not invent a serving mass or density. If only volume values are shown and gram conversion is impossible, set requiresGramConversion true. Missing nutrients = 0. If the product name is not visible, return an empty name. Return kcal, not kJ.';
    const body={contents:[{parts:[{text:prompt},{inline_data:{mime_type:file.type||'image/jpeg',data:await fileBase64(file)}}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}};
    const apiKey=key();if(!apiKey)throw new Error('Save your Gemini API key in Settings to read a nutrition-label photo.');
    for(let attempt=0;attempt<4;attempt++){
      if(attempt) {toast('Label service busy. Retrying…',true,0);await new Promise(r=>setTimeout(r,800*2**(attempt-1)));}
      let response;try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
      catch{throw new Error('Label scanning needs an internet connection. Your saved foods still work offline.');}
      if(response.ok){
        const data=await response.json(),text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if(!text)throw new Error('No nutrition was returned. Try a clearer photo.');
        let p;try{p=JSON.parse(text.replace(/```json|```/g,'').trim());}catch{throw new Error('The label response was unreadable. Try a clearer photo.');}
        if(p.requiresGramConversion)throw new Error('This label uses volume without a gram conversion. Add the food manually using verified nutrition per 100 g.');
        return {name:p.name||'',originalName:p.name||'',source:'label',servingG:p.servingSizeG||null,servingLabel:'serving',per100:C.per100(p.per100)};
      }
      if(response.status===429||response.status===503){if(attempt<3)continue;throw new Error(response.status===429?'Label service rate limit reached. Try again later.':'Label service is busy. Try again later.');}
      throw new Error(response.status===400||response.status===403?'Check that your Gemini API key is valid and authorised.':'Label service error '+response.status+'.');
    }
  }
  $('labelFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    toast('Reading nutrition label…',true,0);
    try{const food=await readLabel(file);hideToast();openFood(food);}
    catch(err){report(err);}
  };
  // UI wiring.
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
  $('btnGoals').onclick=openGoals;$('btnSettings').onclick=openSettings;
  $('btnManual').onclick=()=>openFood();$('newFood').onclick=()=>openFood();
  $('viewAllFoods').onclick=()=>{foodQuery='';$('foodSearch').value='';foodLimit=50;setScreen('foods');};
  $('foodSearch').oninput=e=>{foodQuery=e.target.value;foodLimit=50;renderFoods();};
  $('foodSort').onchange=e=>{foodSort=e.target.value;foodLimit=50;renderFoods();};
  $('loadMoreFoods').onclick=()=>{foodLimit+=50;renderFoods();};
  $('diaryDate').onchange=e=>{if(C.validDate(e.target.value)&&e.target.value<=today){selectedDay=e.target.value;renderNutrition();}else e.target.value=selectedDay;};
  $('prevDay').onclick=()=>{selectedDay=C.addDays(selectedDay,-1);renderNutrition();};
  $('nextDay').onclick=()=>{if(selectedDay<today){selectedDay=C.addDays(selectedDay,1);renderNutrition();}};
  $('dayComplete').onchange=e=>{const complete=e.target.checked;if(!persist(draft=>{draft.completion[selectedDay]={complete,updatedAt:Date.now()};},complete?'Day marked complete for calorie reviews.':'Day marked incomplete.'))e.target.checked=!!state.completion[selectedDay]?.complete;};
  $('weightSetup').onclick=openWeightSetup;
  document.querySelectorAll('[data-weight-view]').forEach(b=>b.onclick=()=>{weightView=b.dataset.weightView;renderWeight();});
  $('btnBarcode').onclick=startBarcode;$('camClose').onclick=()=>{stopCamera();$('btnBarcode').focus();};
  $('camPhotoBtn').onclick=()=>{stopCamera();$('barcodeFile').click();};
  $('btnLabel').onclick=()=>{if(!key()){openSettings();toast('Save a Gemini API key, then choose Snap label.');}else $('labelFile').click();};
  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-food-open]'),edit=e.target.closest('[data-food-edit]'),del=e.target.closest('[data-food-delete]');
    if(open||edit){const b=open||edit,f=state.foods.find(x=>x.id===(b.dataset.foodOpen||b.dataset.foodEdit));if(f)openFood(f,{edit:!!edit});}
    if(del){const food=state.foods.find(f=>f.id===del.dataset.foodDelete);if(food)confirmDialog('Delete saved food?','Remove '+food.name+' from your saved foods? Past diary entries stay unchanged.',()=>persist(draft=>{draft.foods=draft.foods.filter(f=>f.id!==food.id);},'Saved food deleted.'),'Delete food');}
    const entryEdit=e.target.closest('[data-entry-edit]'),entryDel=e.target.closest('[data-entry-delete]');
    if(entryEdit)openEntry(entryEdit.dataset.entryEdit);
    if(entryDel){const entry=state.logs[selectedDay]?.find(x=>x.id===entryDel.dataset.entryDelete);if(entry)confirmDialog('Delete diary entry?','Remove '+entry.name+' from '+dateLabel(selectedDay)+'? The saved food stays in your library.',()=>persist(draft=>{draft.logs[selectedDay]=draft.logs[selectedDay].filter(x=>x.id!==entry.id);draft.completion[selectedDay]={complete:false,updatedAt:Date.now()};},'Diary entry removed.'),'Delete entry');}
    const wEdit=e.target.closest('[data-weight-edit]'),wDel=e.target.closest('[data-weight-delete]');
    if(wEdit)openWeightEntry(wEdit.dataset.weightEdit);
    if(wDel){const date=wDel.dataset.weightDelete;confirmDialog('Delete weigh-in?',date===state.settings.startDate?'This is your starting measurement. Deleting it removes the journey anchor; choose another starting date in Setup afterwards.':'Remove the recorded weight for '+dateLabel(date)+'?',()=>persist(draft=>C.deleteWeight(draft,date),'Weigh-in deleted.'),'Delete weigh-in');}
    const range=e.target.closest('[data-weight-range]');
    if(range){weightRange=range.dataset.weightRange==='all'?'all':Number(range.dataset.weightRange);renderWeight();}
    const point=e.target.closest('[data-chart-date]');
    if(point){const w=state.weights.find(x=>x.date===point.dataset.chartDate);if(w&&$('chartDetail'))$('chartDetail').textContent=dateLabel(w.date)+' · '+C.formatWeight(w.kg,state.settings.unit)+(w.date===state.settings.startDate?' · Starting measurement':'');}
  });
  document.addEventListener('keydown',e=>{
    if(!$('camOverlay').hidden){
      if(e.key==='Escape'){stopCamera();$('btnBarcode').focus();}
      if(e.key==='Tab'){e.preventDefault();(document.activeElement===$('camClose')?$('camPhotoBtn'):$('camClose')).focus();}
    }
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-chart-date]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  function checkRollover(){
    const next=C.londonDate();if(next===today)return;
    const previous=today;today=next;if(selectedDay===previous)selectedDay=today;
    if(!storageBlocked)persist(()=>{});else render();
    toast('New day. Your saved foods and weight history are unchanged.');
  }
  setInterval(checkRollover,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkRollover();else stopCamera();});
  window.addEventListener('pagehide',stopCamera);
  window.addEventListener('storage',e=>{
    if(e.key!==C.STORE)return;
    if(D.open){toast('Data changed in another tab. Close this form and refresh before saving.',false,7000);storageBlocked=true;banner('Another tab changed this app’s data. Refresh before making more changes to avoid overwriting it.');return;}
    try{state=C.load(localStorage,today,Date.now()).state;render();}catch(err){report(err);}
  });
  render();
  if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();


