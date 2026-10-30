let initialized=false;
export function initializePlanner(){
if(initialized)return;

const KEY='commercial-planner-v1';
let db={bills:[],errands:[],goals:[]};
try{const s=localStorage.getItem(KEY);if(s)db=Object.assign(db,JSON.parse(s))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
const $=id=>document.getElementById(id);
const peso=n=>'₱'+(Math.round(n*100)/100).toLocaleString('en-PH',{maximumFractionDigits:2});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t0=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
let vm=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})();
const ymk=(d=vm)=>d.getFullYear()+'-'+(d.getMonth()+1);
const amtOf=b=>(b.amts&&b.amts[ymk()]!==undefined)?b.amts[ymk()]:b.amt;
const vIdx=()=>vm.getFullYear()*12+vm.getMonth();
const keyOf=i=>Math.floor(i/12)+'-'+(i%12+1);
const dayOf=b=>(b.days&&b.days[ymk()]!==undefined)?b.days[ymk()]:b.day;
const applies=b=>{const i=vIdx();if(b.skip&&b.skip[ymk()])return false;return b.once?b.s===i:(i>=b.s&&(b.e==null||i<=b.e))};
function migrate(){db.bills.forEach(b=>{if(b.s===undefined){const d=new Date(b.id);b.s=d.getFullYear()*12+d.getMonth();b.once=false}})}
migrate();
function moveMonth(n){vm=new Date(vm.getFullYear(),vm.getMonth()+n,1);render()}
const dstr=d=>d.toLocaleDateString('en-PH',{month:'short',day:'numeric'});
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const say=(id,t)=>{$(id).textContent=t};

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  ['bills','errands','travel'].forEach(t=>$(t).hidden=t!==b.dataset.t);
});

function dueOf(b){const dim=new Date(vm.getFullYear(),vm.getMonth()+1,0).getDate();return new Date(vm.getFullYear(),vm.getMonth(),Math.min(dayOf(b),dim))}
const diff=d=>Math.round((d-t0())/864e5);

$('fBill').onsubmit=e=>{
  e.preventDefault();
  const name=$('bn').value.trim(),amt=parseFloat($('ba').value),day=parseInt($('bd').value,10);
  if(!name)return say('mBill','Enter the bill name.');
  if(isNaN(amt)||amt<0)return say('mBill','Enter the amount as a number of 0 or more.');
  if(isNaN(day)||day<1||day>31)return say('mBill','Due day must be between 1 and 31.');
  db.bills.push({id:Date.now(),name,amt,day,s:vIdx(),e:null,once:$('br').value==='once',paid:{}});
  save();e.target.reset();say('mBill','');render();
};
function togglePaid(id){const b=db.bills.find(x=>x.id===id),k=ymk();if(b.paid[k])delete b.paid[k];else b.paid[k]=true;save();render()}
function editBill(id){
  const b=db.bills.find(x=>x.id===id),mn=vm.toLocaleDateString('en-PH',{month:'long'});
  const a=parseFloat(prompt('Amount for '+b.name+' in '+mn+' (₱):',amtOf(b)));
  if(isNaN(a)||a<0)return;
  let d=parseInt(prompt('Due day of the month (1-31):',dayOf(b)),10);
  if(!(d>=1&&d<=31))d=dayOf(b);
  b.amts=b.amts||{};b.days=b.days||{};
  if(b.once){b.amt=a;b.day=d;delete b.amts[ymk()];delete b.days[ymk()]}
  else if(confirm('Use this amount and due day for '+mn+' and all later months too?\n\nOK = this and later months (past months stay the same)\nCancel = '+mn+' only')){
    for(let i=b.s;i<vIdx();i++){const kk=keyOf(i);if(b.amts[kk]===undefined)b.amts[kk]=b.amt;if(b.days[kk]===undefined)b.days[kk]=b.day}
    b.amt=a;b.day=d;delete b.amts[ymk()];delete b.days[ymk()];
  }else{b.amts[ymk()]=a;b.days[ymk()]=d}
  save();render();
}
function delBill(id){
  const b=db.bills.find(x=>x.id===id),mn=vm.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  if(b.once){if(confirm('Delete "'+b.name+'"? It was only for '+mn+'.')){db.bills=db.bills.filter(x=>x.id!==id);save();render()}return}
  if(confirm('Remove "'+b.name+'" from '+mn+' only?\n\nOK = this month only\nCancel = see more options')){b.skip=b.skip||{};b.skip[ymk()]=true;save();render();return}
  if(confirm('Remove "'+b.name+'" from '+mn+' and all later months?\n\nPast months keep it.')){
    if(vIdx()<=b.s)db.bills=db.bills.filter(x=>x.id!==id);else b.e=vIdx()-1;
    save();render();
  }
}

$('fErr').onsubmit=e=>{
  e.preventDefault();
  const text=$('et').value.trim();
  if(!text)return say('mErr','Type what you need to do.');
  db.errands.push({id:Date.now(),text,date:$('ed').value,done:false});
  save();e.target.reset();say('mErr','');render();
};
function togErr(id){const x=db.errands.find(e=>e.id===id);x.done=!x.done;save();render()}
function delErr(id){db.errands=db.errands.filter(e=>e.id!==id);save();render()}
$('clrDone').onclick=()=>{db.errands=db.errands.filter(e=>!e.done);save();render()};

$('fGoal').onsubmit=e=>{
  e.preventDefault();
  const name=$('gn').value.trim(),target=parseFloat($('gt').value),date=$('gdt').value;
  if(!name)return say('mGoal','Enter a goal name.');
  if(isNaN(target)||target<=0)return say('mGoal','Target amount must be more than 0.');
  db.goals.push({id:Date.now(),name,target,date,saved:[]});
  save();e.target.reset();say('mGoal','');render();
};
function addDep(id){
  const g=db.goals.find(x=>x.id===id),inp=$('dep'+id),v=parseFloat(inp.value);
  if(isNaN(v)||v<=0){inp.focus();return}
  g.saved.push({t:Date.now(),amt:v});save();render();
}
function undoDep(id){const g=db.goals.find(x=>x.id===id);if(g.saved.length&&confirm('Remove your last deposit of '+peso(g.saved[g.saved.length-1].amt)+'?')){g.saved.pop();save();render()}}
function delGoal(id){if(confirm('Delete this goal and its savings record?')){db.goals=db.goals.filter(g=>g.id!==id);save();render()}}

function render(){
  $('today').textContent=new Date().toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'});
  const k=ymk();
  const bills=db.bills.filter(applies).map(b=>({b,due:dueOf(b),paid:!!b.paid[k],amt:amtOf(b)})).sort((a,c)=>(a.paid-c.paid)||(a.due-c.due));
  const left=bills.filter(x=>!x.paid).reduce((s,x)=>s+x.amt,0);
  const overdue=bills.filter(x=>!x.paid&&diff(x.due)<0).length;
  $('s1').textContent=peso(left);$('c1').classList.toggle('warn',overdue>0);
  $('l1').textContent='Bills left in '+vm.toLocaleDateString('en-PH',{month:'long'});
  const all=bills.reduce((s,x)=>s+x.amt,0);
  $('dashboardMonth').textContent=vm.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  $('billTotal').textContent=peso(all);
  $('billPaid').textContent=peso(all-left);
  $('billRemaining').textContent=peso(left);
  $('billSoon').textContent=bills.filter(x=>!x.paid&&diff(x.due)>=0&&diff(x.due)<=3).length;
  $('billOverdue').textContent=overdue;
  $('billMonth').textContent=vm.toLocaleDateString('en-PH',{month:'long',year:'numeric'})+' Bills';
  $('billSum').textContent=bills.length?`${peso(all-left)} paid of ${peso(all)} · ${bills.filter(x=>x.paid).length} of ${bills.length} bills paid`:'';
  $('lBills').innerHTML=bills.length?bills.map(({b,due,paid,amt})=>{
    const d=diff(due);
    const st=paid?'Paid':d<0?`<span class="late">Overdue by ${-d} day${d<-1?'s':''}</span>`:d===0?'<span class="late">Due today</span>':d<=3?`<span class="soon">Due in ${d} day${d>1?'s':''} (${dstr(due)})</span>`:'Due '+dstr(due);
    return `<div class="item ${paid?'done':''}"><input type="checkbox" ${paid?'checked':''} onchange="togglePaid(${b.id})" aria-label="Mark ${esc(b.name)} as paid"><div class="grow"><b>${esc(b.name)}</b><span class="meta">${st} · ${b.once?'This month only':'Monthly'}</span></div><span class="amt">${peso(amt)}</span><button class="sm" onclick="editBill(${b.id})">Edit</button><button class="sm" onclick="delBill(${b.id})" aria-label="Delete ${esc(b.name)}">✕</button></div>`}).join('')
    :'<p class="empty">No bills for this month yet. Add one above.</p>';

  const errs=db.errands.slice().sort((a,c)=>(a.done-c.done)||((a.date||'9999')<(c.date||'9999')?-1:1));
  const todo=db.errands.filter(e=>!e.done),late=todo.filter(e=>e.date&&diff(parse(e.date))<0).length;
  $('s2').textContent=todo.length+(late?` (${late} late)`:'');$('c2').classList.toggle('warn',late>0);
  $('lErr').innerHTML=errs.length?errs.map(e=>{
    let m='No date';if(e.date){const d=diff(parse(e.date));m=e.done?dstr(parse(e.date)):d<0?`<span class="late">Late by ${-d} day${d<-1?'s':''}</span>`:d===0?'<span class="soon">Today</span>':d===1?'Tomorrow':dstr(parse(e.date))}
    return `<div class="item ${e.done?'done':''}"><input type="checkbox" ${e.done?'checked':''} onchange="togErr(${e.id})" aria-label="Mark done"><div class="grow"><b>${esc(e.text)}</b><span class="meta">${m}</span></div><button class="sm" onclick="delErr(${e.id})" aria-label="Delete errand">✕</button></div>`}).join('')
    :'<p class="empty">Nothing to do. Add an errand so you don\'t forget it.</p>';
  $('clrDone').hidden=!db.errands.some(e=>e.done);

  let total=0;
  $('lGoals').innerHTML=db.goals.length?db.goals.map(g=>{
    const s=g.saved.reduce((a,x)=>a+x.amt,0);total+=s;
    const pct=Math.min(100,Math.round(s/g.target*100)),rem=Math.max(0,g.target-s);
    let tip='';
    if(rem===0)tip='Goal reached! Celebrate your progress.';
    else if(g.date){const dt=parse(g.date),now=new Date();const mo=(dt.getFullYear()-now.getFullYear())*12+dt.getMonth()-now.getMonth();
      tip=dt<t0()?'Target date has passed. Edit the goal or keep saving.':`Save about <b>${peso(rem/Math.max(1,mo))}</b> a month to reach it by ${dt.toLocaleDateString('en-PH',{month:'short',year:'numeric'})}.`}
    return `<div class="goal"><div class="item" style="border:0;padding:0"><div class="grow"><b>${esc(g.name)}</b><span class="meta">${peso(s)} of ${peso(g.target)} (${pct}%)</span></div><button class="sm" onclick="undoDep(${g.id})">Undo last</button><button class="sm" onclick="delGoal(${g.id})" aria-label="Delete goal">✕</button></div><div class="bar"><i style="width:${pct}%"></i></div><div class="meta">${tip}</div><div class="dep"><input id="dep${g.id}" type="number" min="1" step="1" placeholder="Amount to add (₱)" aria-label="Deposit amount"><button class="pri" style="padding:8px 14px" onclick="addDep(${g.id})">Add</button></div></div>`}).join('')
    :'<p class="empty">No goals yet. Add something you are saving for and the amount you need.</p>';
  $('s3').textContent=peso(total);
}
const DEFAULT_NAME="My Everyday Planner";
const ACC={
rose:{sea:'#a84365',soft:'#fce0e9',line:'#efdce4'},
lavender:{sea:'#7150a5',soft:'#ece3fb',line:'#e4dced'},
sage:{sea:'#3e7555',soft:'#e0f0e5',line:'#dce8df'},
sky:{sea:'#306e98',soft:'#deeffb',line:'#dce6ee'}};
const SW=[['salmon','Peach','#f7c9b6'],['rose','Rose','#f4bfd3'],['lavender','Lavender','#d9c7f5'],['sage','Sage green','#c7e5ce'],['sky','Sky blue','#c7e3f6']];
function cfg(){db.settings=db.settings||{};return db.settings}
function applyBrand(){
  const c=cfg(),name=(c.name||'').trim()||DEFAULT_NAME;
  $('brandH').textContent=name;document.title='My Everyday Planner';
  document.querySelector('meta[name="apple-mobile-web-app-title"]').content='My Everyday Planner';
  const r=document.documentElement.style;
  ['sea','bg','soft','line','ink','mute','card','on','barc'].forEach(k=>r.removeProperty('--'+k));
  const a=ACC[c.accent];let theme='#fff9f0';
  if(a){const p=a;
    Object.keys(p).forEach(k=>r.setProperty('--'+k,p[k]));r.setProperty('--barc',p.sea);theme=p.sea}
  document.querySelector('meta[name="theme-color"]').content=theme;
  const cur=c.accent||'salmon';
  $('swatches').innerHTML=SW.map(([k,n,col])=>`<button class="sw" data-k="${k}" style="background:${col}" aria-label="${n}" aria-pressed="${k===cur}"></button>`).join('');
}
function loadBrandInput(){$('brandName').value=cfg().name||''}
$('brandName').oninput=e=>{cfg().name=e.target.value;save();applyBrand()};
$('swatches').onclick=e=>{const b=e.target.closest('.sw');if(!b)return;if(b.dataset.k==='salmon')delete cfg().accent;else cfg().accent=b.dataset.k;save();applyBrand()};


$('bkSave').onclick=()=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(db)],{type:'application/json'}));a.download='commercial-planner-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();say('mBk','Backup saved. Check your Downloads folder.')}catch(e){say('mBk','This browser could not save the file.')}};
$('bkLoad').onclick=()=>$('bkFile').click();
$('bkFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d.bills)||!Array.isArray(d.errands)||!Array.isArray(d.goals))throw 0;if(!confirm('Replace this commercial planner’s data with the backup? Your personal planner will stay unchanged.'))return;db=d;migrate();save();render();applyBrand();loadBrandInput();say('mBk','Backup restored.')}catch(x){say('mBk','That file is not a valid planner backup.')}};r.readAsText(f);e.target.value=''};
render();applyBrand();loadBrandInput();

Object.assign(window,{moveMonth,togglePaid,editBill,delBill,togErr,delErr,addDep,undoDep,delGoal});

initialized=true;
}
