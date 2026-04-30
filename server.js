import http from "http";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const PORT = process.env.PORT || 3000;
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadData() {
  const { main } = await import("./index.js?" + Date.now());
  return main();
}

const HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>veAERO</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#050810;color:#e8edf8;font-family:monospace;min-height:100vh}.w{max-width:1400px;margin:0 auto;padding:20px}header{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #1a2540;margin-bottom:20px}.li{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#00d4aa,#0077ff);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;margin-right:10px}.lt{font-size:15px;font-weight:800}.ls{font-size:8px;color:#3d5070;letter-spacing:1.5px;text-transform:uppercase}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px}.sc{background:#080d1a;border:1px solid #1a2540;border-radius:9px;padding:12px;position:relative;overflow:hidden}.sc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac,#00d4aa)}.sl{font-size:8px;color:#3d5070;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px}.sv{font-size:16px;font-weight:800}.ss{font-size:9px;color:#3d5070;margin-top:2px}.best{background:linear-gradient(135deg,rgba(0,212,170,.07),rgba(0,119,255,.05));border:1px solid rgba(0,212,170,.2);border-radius:12px;padding:14px;margin-bottom:16px}.bl{font-size:8px;color:#00d4aa;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px}.bn{font-size:18px;font-weight:800;margin-bottom:10px}.bg{display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:6px}.bs{background:rgba(0,212,170,.06);border:1px solid rgba(0,212,170,.1);border-radius:7px;padding:8px}.bsl{font-size:7px;color:#3d5070;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}.bsv{font-size:13px;font-weight:800;color:#00d4aa}.tabs{display:flex;gap:3px;margin-bottom:10px;flex-wrap:wrap}.tab{background:transparent;border:1px solid #1a2540;color:#3d5070;border-radius:7px;padding:5px 10px;font-family:monospace;font-size:9px;cursor:pointer;white-space:nowrap}.tab.active{background:#111928;border-color:#00d4aa;color:#00d4aa}.ctrl{display:flex;gap:7px;margin-bottom:10px;flex-wrap:wrap}.sr{background:#0c1422;border:1px solid #1a2540;border-radius:7px;padding:7px 11px;color:#e8edf8;font-family:monospace;font-size:11px;outline:none;flex:1;min-width:140px}.sr:focus{border-color:#00d4aa}.fb{background:transparent;border:1px solid #1a2540;color:#3d5070;border-radius:7px;padding:7px 10px;font-family:monospace;font-size:9px;cursor:pointer}.fb.on{background:rgba(29,185,84,.1);border-color:#1db954;color:#1db954}.tw{background:#080d1a;border:1px solid #1a2540;border-radius:11px;overflow:auto}table{width:100%;border-collapse:collapse;min-width:680px}th{background:#0c1422;padding:8px 11px;font-size:8px;color:#3d5070;letter-spacing:1.2px;text-transform:uppercase;text-align:left;border-bottom:1px solid #1a2540;white-space:nowrap}td{padding:9px 11px;border-bottom:1px solid rgba(26,37,64,.5);font-size:11px;vertical-align:middle;white-space:nowrap}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(12,20,34,.8)}tr.hl td{background:rgba(0,212,170,.04)}.pi{width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;margin-right:6px;vertical-align:middle}.pn{font-weight:700;font-size:12px}.pa{font-size:9px;color:#1e2d45;margin-top:1px}.vb{height:3px;background:#1e2d45;border-radius:2px;margin-top:3px;min-width:50px}.vbf{height:100%;border-radius:2px}.g{color:#1db954}.go{color:#f0b429}.b{color:#60a5fa}.pu{color:#9b59b6}.mu{color:#3d5070}.tc{font-size:8px;padding:2px 5px;border-radius:3px;display:inline-block;margin:1px}.tf{background:rgba(0,119,255,.12);border:1px solid rgba(0,119,255,.3);color:#60a5fa}.tb{background:rgba(29,185,84,.1);border:1px solid rgba(29,185,84,.25);color:#1db954}.ld{display:flex;flex-direction:column;align-items:center;gap:14px;padding:60px 0;color:#3d5070}.sp{width:34px;height:34px;border-radius:50%;border:3px solid #1a2540;border-top-color:#00d4aa;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.ui{font-size:10px;color:#3d5070;text-align:right;margin-top:8px}.rb{background:#0c1422;border:1px solid #1a2540;color:#3d5070;border-radius:6px;padding:5px 11px;font-family:monospace;font-size:9px;cursor:pointer}.ep{background:#0c1422;border:1px solid #1a2540;border-radius:6px;padding:5px 11px;font-size:9px;color:#3d5070}</style></head>
<body><div class="w">
<header>
<div style="display:flex;align-items:center"><div class="li">A</div><div><div class="lt">veAERO</div><div class="ls">Voting Intelligence · Base</div></div></div>
<div style="display:flex;align-items:center;gap:8px"><div class="ep" id="ep">—</div><button class="rb" onclick="load()">⟳</button></div>
</header>
<div id="lv" class="ld"><div class="sp"></div><div style="font-size:12px">Загружаю данные...</div><div style="font-size:10px;color:#1e2d45">~2 минуты первый раз</div></div>
<div id="mv" style="display:none">
<div class="stats" id="sr"></div>
<div class="best" id="bp"></div>
<div class="tabs"><button class="tab active" onclick="sT('votes')">🏆 Голоса</button><button class="tab" onclick="sT('myusd')">👤 Мои $</button><button class="tab" onclick="sT('bribes')">💰 Bribes</button><button class="tab" onclick="sT('fees')">💸 Fees</button><button class="tab" onclick="sT('total')">📊 Total</button><button class="tab" onclick="sT('veapy')">📈 veAPY</button></div>
<div class="ctrl"><input class="sr" type="text" placeholder="🔍 Поиск..." oninput="rT()" id="si"><button class="fb" id="fb" onclick="tF()">★ Rewards</button></div>
<div class="tw"><table><thead id="th"></thead><tbody id="tb"></tbody></table></div>
<div class="ui" id="ui"></div>
</div></div>
<script>
let D=null,tab='votes',fR=false;
const C=['#00d4aa','#0077ff','#9b59b6','#f0b429','#f97316','#1db954','#ec4899','#06b6d4'];
const fU=n=>{if(!n||n===0)return'<span class="mu">—</span>';if(n>=1e6)return'<span class="g">$'+(n/1e6).toFixed(2)+'M</span>';if(n>=1e3)return'<span class="g">$'+(n/1e3).toFixed(1)+'K</span>';if(n>=100)return'<span class="g">$'+Math.round(n)+'</span>';return'<span class="mu">$'+n.toFixed(0)+'</span>'};
const fP=n=>Number(n).toFixed(2)+'%';const fN=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:0});const fUP=n=>{if(!n)return'$0';if(n>=1e6)return'$'+(n/1e6).toFixed(2)+'M';if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K';return'$'+Math.round(n)};
function sT(t){tab=t;document.querySelectorAll('.tab').forEach((e,i)=>e.classList.toggle('active',['votes','myusd','bribes','fees','total','veapy'][i]===t));rT();}
function tF(){fR=!fR;document.getElementById('fb').classList.toggle('on',fR);rT();}
async function load(){
  document.getElementById('lv').style.display='flex';document.getElementById('mv').style.display='none';
  const poll=async()=>{try{const r=await fetch('/api/data');const d=await r.json();if(d.loading){setTimeout(poll,3000);return;}D=d;render();}catch(e){document.getElementById('lv').innerHTML='<div style="color:#ff4757">Ошибка: '+e.message+'</div>';}};poll();
}
function render(){
  if(!D)return;const{meta:m,pools}=D;
  document.getElementById('lv').style.display='none';document.getElementById('mv').style.display='block';
  document.getElementById('ep').textContent=m.epochDate;
  const st=[{l:'Пулов',v:m.activePools,s:'активных',a:'#3b82f6'},{l:'Incentives',v:fUP(m.totalBribes),s:'bribes',a:'#f0b429'},{l:'Fees',v:fUP(m.totalFees),s:'комиссии',a:'#0077ff'},{l:'Total',v:fUP(m.totalRewards),s:'rewards',a:'#9b59b6'},{l:'Мои veAERO',v:fN(m.myVeAero),s:'для расчёта',a:'#00d4aa'},{l:'С rewards',v:m.withRewards,s:'пулов',a:'#1db954'}];
  document.getElementById('sr').innerHTML=st.map(s=>'<div class="sc" style="--ac:'+s.a+'"><div class="sl">'+s.l+'</div><div class="sv">'+s.v+'</div><div class="ss">'+s.s+'</div></div>').join('');
  const best=[...pools].filter(p=>p.totalUsd>500&&p.votePct>0.1).sort((a,b)=>b.myUsd-a.myUsd)[0]||pools[0];
  if(best)document.getElementById('bp').innerHTML='<div class="bl">🚀 Лучший пул для голосования</div><div class="bn">'+best.symbol+'</div><div class="bg"><div class="bs"><div class="bsl">Голоса</div><div class="bsv">'+fP(best.votePct)+'</div></div><div class="bs"><div class="bsl">Incentives</div><div class="bsv">'+fUP(best.bribeUsd)+'</div></div><div class="bs"><div class="bsl">Fees</div><div class="bsv">'+fUP(best.feesUsd)+'</div></div><div class="bs"><div class="bsl">Total</div><div class="bsv">'+fUP(best.totalUsd)+'</div></div><div class="bs"><div class="bsl">veAPY</div><div class="bsv">'+best.veApy.toFixed(1)+'%</div></div><div class="bs"><div class="bsl" style="color:#f0b429">Мои $</div><div class="bsv" style="color:#f0b429">'+fUP(best.myUsd)+'</div></div></div>';
  rT();document.getElementById('ui').textContent='Обновлено: '+new Date(m.updatedAt).toLocaleTimeString();
}
function rT(){
  if(!D)return;let p=[...D.pools];const q=document.getElementById('si').value.toLowerCase();
  if(q)p=p.filter(x=>x.symbol.toLowerCase().includes(q));if(fR)p=p.filter(x=>x.totalUsd>0);
  const sm={votes:x=>-x.votePct,myusd:x=>-x.myUsd,bribes:x=>-x.bribeUsd,fees:x=>-x.feesUsd,total:x=>-x.totalUsd,veapy:x=>-x.veApy};
  p.sort((a,b)=>sm[tab](a)-sm[tab](b));const mx=Math.max(...p.map(x=>x.votePct),1);
  document.getElementById('th').innerHTML='<tr>'+['#','Пул','Голоса%','Votes','Fees$','Bribes$','Total$','veAPY','Мои$','Токены'].map(h=>'<th>'+h+'</th>').join('')+'</tr>';
  document.getElementById('tb').innerHTML=p.slice(0,100).map((x,i)=>{const c=C[i%C.length];const bw=Math.min((x.votePct/mx)*100,100);const bc=x.votePct>5?'#1db954':x.votePct>2?'#0077ff':'#1e2d45';
  return '<tr class="'+(i<3?'hl':'')+'"><td class="mu">'+(i+1)+'</td><td><div style="display:flex;align-items:center"><span class="pi" style="background:'+c+'22;color:'+c+'">'+(x.symbol||'?')[0]+'</span><div><div class="pn">'+x.symbol+'</div><div class="pa">'+x.pool.slice(0,10)+'…</div></div></div></td><td><div class="'+(x.votePct>5?'g':x.votePct>2?'b':'')+'" style="font-weight:700">'+fP(x.votePct)+'</div><div class="vb"><div class="vbf" style="width:'+bw+'%;background:'+bc+'"></div></div></td><td class="mu">'+fN(x.voteWeight)+'</td><td>'+fU(x.feesUsd)+'</td><td>'+fU(x.bribeUsd)+'</td><td>'+fU(x.totalUsd)+'</td><td class="'+(x.veApy>50?'go':x.veApy>20?'pu':'')+'">'+( x.veApy>0?x.veApy.toFixed(1)+'%':'<span class="mu">—</span>')+'</td><td style="color:'+(x.myUsd>50?'#f0b429':x.myUsd>10?'#9b59b6':'#3d5070')+';font-weight:'+(x.myUsd>10?700:400)+'">'+fUP(x.myUsd)+'</td><td>'+x.feeTokens.map(t=>'<span class="tc tf">'+t.symbol+'</span>').join('')+x.bribeTokens.map(t=>'<span class="tc tb">'+t.symbol+'</span>').join('')+'</td></tr>';}).join('');
}
load();setInterval(load,5*60*1000);
</script></body></html>`;

import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://mainnet.base.org";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "25262");

const VI = new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function gauges(address) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)","function gaugeToFees(address) view returns (address)","function gaugeToBribe(address) view returns (address)"]);
const PI = new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI = new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const RI = new ethers.Interface(["function rewardsListLength() view returns (uint256)","function rewards(uint256) view returns (address)","function tokenRewardsPerEpoch(address,uint256) view returns (uint256)"]);
const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];

const provider = new ethers.JsonRpcProvider(RPC);
const mc3 = new ethers.Contract(MC3_ADDR, MC3_ABI, provider);
const PRICES={"0x4200000000000000000000000000000000000006":2500,"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0x940181a94a35a4569e4529a3cdfb74e38fd98631":0.95,"0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":94000,"0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22":2450,"0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452":2550,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}

async function fetchAeroData(){
  const voter=new ethers.Contract(VOTER_ADDR,VI,provider);
  const total=Number(await voter.length());
  const totalW=await voter.totalWeight();
  const WEEK=604800,now=Math.floor(Date.now()/1000);
  const epoch=Math.floor(now/WEEK)*WEEK,pEpoch=epoch-WEEK;
  const totalVeAero=Number(ethers.formatEther(totalW));
  console.log(`Loading ${total} pools...`);
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  const m1=await mcall(pools.flatMap(p=>[{target:VOTER_ADDR,iface:VI,fn:"gauges",args:[p]},{target:VOTER_ADDR,iface:VI,fn:"weights",args:[p]}]));
  const active=[];
  for(let i=0;i<pools.length;i++){const gauge=m1[i*2],weight=m1[i*2+1];if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;const voteWeight=Number(ethers.formatEther(weight));active.push({pool:pools[i],gauge,voteWeight,votePct:(voteWeight/totalVeAero)*100,feesUsd:0,bribeUsd:0,totalUsd:0,feeTokens:[],bribeTokens:[]});}
  active.sort((a,b)=>b.voteWeight-a.voteWeight);
  const m2=await mcall(active.flatMap(p=>[{target:p.pool,iface:PI,fn:"token0"},{target:p.pool,iface:PI,fn:"token1"},{target:VOTER_ADDR,iface:VI,fn:"gaugeToFees",args:[p.gauge]},{target:VOTER_ADDR,iface:VI,fn:"gaugeToBribe",args:[p.gauge]}]));
  for(let i=0;i<active.length;i++){active[i].t0=m2[i*4]||"";active[i].t1=m2[i*4+1]||"";active[i].feesAddr=m2[i*4+2]||"";active[i].bribeAddr=m2[i*4+3]||"";}
  const uniq=[...new Set(active.flatMap(p=>[p.t0,p.t1]).filter(Boolean))];
  const syms=await mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"})));
  const decs=await mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})));
  const tinfo={};for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  for(const p of active)p.symbol=`${tinfo[p.t0.toLowerCase()]?.symbol||"?"}/${tinfo[p.t1.toLowerCase()]?.symbol||"?"}`;
  const rc=active.flatMap(p=>[{addr:p.feesAddr,pidx:active.indexOf(p),type:"fees"},{addr:p.bribeAddr,pidx:active.indexOf(p),type:"bribe"}]).filter(c=>c.addr);
  const lenRes=await mcall(rc.map(c=>({target:c.addr,iface:RI,fn:"rewardsListLength"})));
  const rwC=[],rwM=[];
  for(let i=0;i<rc.length;i++){const len=Number(lenRes[i]||0);for(let t=0;t<Math.min(len,6);t++){rwC.push({target:rc[i].addr,iface:RI,fn:"rewards",args:[t]});rwM.push(rc[i]);}}
  const rwA=await mcall(rwC);
  const amtC=[],amtM=[];
  for(let i=0;i<rwA.length;i++){const tok=rwA[i];if(!tok||tok===ethers.ZeroAddress)continue;amtC.push({target:rwM[i].addr,iface:RI,fn:"tokenRewardsPerEpoch",args:[tok,epoch]});amtM.push({...rwM[i],tok,ep:"cur"});amtC.push({target:rwM[i].addr,iface:RI,fn:"tokenRewardsPerEpoch",args:[tok,pEpoch]});amtM.push({...rwM[i],tok,ep:"prev"});}
  const amts=await mcall(amtC);
  const newT=[...new Set(amtM.map(m=>m.tok))].filter(t=>!tinfo[t.toLowerCase()]);
  if(newT.length){const ns=await mcall(newT.map(t=>({target:t,iface:EI,fn:"symbol"})));const nd=await mcall(newT.map(t=>({target:t,iface:EI,fn:"decimals"})));for(let i=0;i<newT.length;i++)tinfo[newT[i].toLowerCase()]={symbol:ns[i]||"?",decimals:Number(nd[i]||18)};}
  const best={};
  for(let i=0;i<amts.length;i++){const raw=amts[i];if(!raw||raw===0n)continue;const{pidx,tok,type}=amtM[i];const k=tok.toLowerCase();if(!best[pidx])best[pidx]={};if(!best[pidx][k]||raw>best[pidx][k].raw)best[pidx][k]={raw,type};}
  for(const[pidx,tokens]of Object.entries(best)){const p=active[Number(pidx)];for(const[tok,{raw,type}]of Object.entries(tokens)){const inf=tinfo[tok]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(raw,inf.decimals));const usd=amt*(PRICES[tok]||0);const entry={symbol:inf.symbol,amt,usd};if(type==="fees"){p.feeTokens.push(entry);p.feesUsd+=usd;}else{p.bribeTokens.push(entry);p.bribeUsd+=usd;}p.totalUsd+=usd;}}
  for(const p of active){p.roiPerVeAero=p.voteWeight>0?p.totalUsd/p.voteWeight:0;p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));p.veApy=p.roiPerVeAero*52*100;}
  return{pools:active,meta:{totalPools:total,activePools:active.length,withRewards:active.filter(p=>p.totalUsd>0).length,totalVeAero,totalBribes:active.reduce((s,p)=>s+p.bribeUsd,0),totalFees:active.reduce((s,p)=>s+p.feesUsd,0),totalRewards:active.reduce((s,p)=>s+p.totalUsd,0),myVeAero:MY_VEAERO,epoch,epochDate:new Date(epoch*1000).toDateString(),updatedAt:Date.now()}};
}

async function refresh(){
  try{console.log("Refreshing data...");const data=await fetchAeroData();cache=data;cacheTime=Date.now();console.log("Done:",data.meta.activePools,"pools");}catch(e){console.error("Refresh error:",e.message);}
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://localhost:${PORT}`);
  if(url.pathname==="/api/data"){res.setHeader("Content-Type","application/json");res.setHeader("Access-Control-Allow-Origin","*");if(!cache){res.end(JSON.stringify({loading:true}));return;}res.end(JSON.stringify(cache));return;}
  res.setHeader("Content-Type","text/html;charset=utf-8");res.end(HTML);
});

server.listen(PORT,()=>{console.log(`Server on port ${PORT}`);refresh();setInterval(refresh,5*60*1000);});
