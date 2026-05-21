import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "41350");
const MY_LOCKS   = [25300, 11290, 5211];
const BOT_TOKEN  = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const CHAT_ID    = process.env.CHAT_ID   || "478227003";
const VOTE_OFFSET = 3600;

const provider=new ethers.JsonRpcProvider(RPC);
const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const VI=new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function gauges(address) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)","function gaugeToFees(address) view returns (address)","function gaugeToBribe(address) view returns (address)"]);
const PI=new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI=new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const RI=new ethers.Interface(["function rewardsListLength() view returns (uint256)","function rewards(uint256) view returns (address)","function tokenRewardsPerEpoch(address,uint256) view returns (uint256)"]);
const SI=new ethers.Interface(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)"]);
const GI=new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);
const mc3=new ethers.Contract(MC3_ADDR,MC3_ABI,provider);
const voter=new ethers.Contract(VOTER_ADDR,VI,provider);

const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938":1,"0xb79dd08ea68a908a97220c76d19a6aa9cbde4376":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}
async function fetchGeckoPrices(tokens){const prices={};for(let i=0;i<tokens.length;i+=30){try{const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokens.slice(i,i+30).join(",")}`);const j=await r.json();for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))if(p&&parseFloat(p)>0)prices[a.toLowerCase()]=parseFloat(p);}catch{}}return prices;}
async function sendTG(text){try{const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:"HTML"})});const j=await r.json();const msgId=j?.result?.message_id;if(msgId){setTimeout(async()=>{try{await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:CHAT_ID,message_id:msgId})});}catch{}},4*60*60*1000);}}catch{}}

function priceFromSlot0(sqrtPriceX96,dec0,dec1){const Q96=2**96;const sqrtP=Number(sqrtPriceX96);const raw=(sqrtP/Q96)**2;return raw*Math.pow(10,dec0-dec1);}
function priceFromReserves(r0,r1,dec0,dec1){const a=Number(r0)/Math.pow(10,dec0);const b=Number(r1)/Math.pow(10,dec1);if(a===0)return 0;return b/a;}
async function fetchOnChainPrices(missingTokens,activePools,tinfo,knownPrices){
  const USDC="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";const WETH="0x4200000000000000000000000000000000000006";
  const prices={...knownPrices};const tokenPoolMap={};
  for(const tok of missingTokens){const usdcPool=activePools.find(p=>(p.t0.toLowerCase()===tok&&p.t1.toLowerCase()===USDC)||(p.t1.toLowerCase()===tok&&p.t0.toLowerCase()===USDC));const wethPool=activePools.find(p=>(p.t0.toLowerCase()===tok&&p.t1.toLowerCase()===WETH)||(p.t1.toLowerCase()===tok&&p.t0.toLowerCase()===WETH));const pool=usdcPool||wethPool;if(pool)tokenPoolMap[tok]={pool:pool.pool,t0:pool.t0.toLowerCase(),t1:pool.t1.toLowerCase()};}
  const poolAddrs=[...new Set(Object.values(tokenPoolMap).map(v=>v.pool))];if(!poolAddrs.length)return prices;
  const[s0,rv,t0r]=await Promise.all([mcall(poolAddrs.map(p=>({target:p,iface:SI,fn:"slot0"}))),mcall(poolAddrs.map(p=>({target:p,iface:GI,fn:"getReserves"}))),mcall(poolAddrs.map(p=>({target:p,iface:GI,fn:"token0"})))]);
  for(const[tok,{pool,t0,t1}] of Object.entries(tokenPoolMap)){const idx=poolAddrs.indexOf(pool);const inf0=tinfo[t0]||{decimals:18};const inf1=tinfo[t1]||{decimals:18};const paired=t0===tok?t1:t0;const pp=prices[paired]||STABLE[paired]||0;if(!pp)continue;let tp=0;if(s0[idx]){try{const sqrtP=s0[idx][0]||s0[idx].sqrtPriceX96;if(sqrtP&&sqrtP>0n){const rp=priceFromSlot0(sqrtP,inf0.decimals,inf1.decimals);tp=t0===tok?rp*pp:(1/rp)*pp;}}catch{}}if(!tp&&rv[idx]){try{const[r0,r1]=rv[idx];const at0=(t0r[idx]||t0).toLowerCase();let rp;if(at0===tok){rp=priceFromReserves(r0,r1,inf0.decimals,inf1.decimals);tp=rp*pp;}else{rp=priceFromReserves(r1,r0,inf1.decimals,inf0.decimals);tp=rp*pp;}}catch{}}if(tp>0&&tp<1e12)prices[tok]=tp;}
  return prices;
}

function optimizeVotes(pools,myVeAero){
  const candidates=pools.slice(0,20).filter(p=>p.totalUsd>100);
  if(!candidates.length)return null;
  const marginal=(p,x)=>p.totalUsd*p.voteWeight/Math.pow(p.voteWeight+x,2);
  let allocs=new Array(candidates.length).fill(0);
  allocs[0]=myVeAero;
  const STEP=myVeAero*0.001;
  for(let iter=0;iter<1000;iter++){
    const margins=candidates.map((p,i)=>marginal(p,allocs[i]));
    const bestIdx=margins.indexOf(Math.max(...margins));
    let worstIdx=-1,worstMargin=Infinity;
    for(let i=0;i<candidates.length;i++){if(allocs[i]>=STEP&&margins[i]<worstMargin){worstMargin=margins[i];worstIdx=i;}}
    if(worstIdx===-1||worstIdx===bestIdx||margins[bestIdx]<=margins[worstIdx])break;
    allocs[worstIdx]-=STEP;allocs[bestIdx]+=STEP;
  }
  const results=candidates.map((p,i)=>({pool:p,alloc:allocs[i],pct:allocs[i]/myVeAero*100,myReward:p.totalUsd*(allocs[i]/(p.voteWeight+allocs[i]))})).filter(r=>r.pct>=1).sort((a,b)=>b.alloc-a.alloc);
  const totalOpt=results.reduce((s,r)=>s+r.myReward,0);
  const totalSingle=candidates[0]?candidates[0].totalUsd*(myVeAero/(candidates[0].voteWeight+myVeAero)):0;
  if(totalOpt<=totalSingle*1.001){return{allocations:[{pool:candidates[0],alloc:myVeAero,pct:100,myReward:totalSingle}],totalOpt:totalSingle,totalSingle,singleBest:true};}
  return{allocations:results,totalOpt,totalSingle,singleBest:false};
}

const fU=n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP=n=>Number(n).toFixed(2)+"%";
const fT=s=>{if(s<=0)return"ЗАКРЫТО";const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;return h>0?`${h}ч ${m}м ${sc}с`:`${m}м ${sc}с`;};
const pad=(s,n)=>String(s).slice(0,n).padEnd(n);
const lpad=(s,n)=>String(s).slice(0,n).padStart(n);

async function fetchData(prevVotes={}){
  const total=Number(await voter.length());
  const totalW=await voter.totalWeight();
  const totalVeAero=Number(ethers.formatEther(totalW));
  const WEEK=604800,now=Math.floor(Date.now()/1000),epoch=Math.floor(now/WEEK)*WEEK;
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  const m1=await mcall(pools.flatMap(p=>[{target:VOTER_ADDR,iface:VI,fn:"gauges",args:[p]},{target:VOTER_ADDR,iface:VI,fn:"weights",args:[p]}]));
  const active=[];
  for(let i=0;i<pools.length;i++){const gauge=m1[i*2],weight=m1[i*2+1];if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;const vw=Number(ethers.formatEther(weight));active.push({pool:pools[i],gauge,voteWeight:vw,votePct:(vw/totalVeAero)*100,feesUsd:0,bribeUsd:0,totalUsd:0,feeTokens:[],bribeTokens:[]});}
  const m2=await mcall(active.flatMap(p=>[{target:p.pool,iface:PI,fn:"token0"},{target:p.pool,iface:PI,fn:"token1"},{target:VOTER_ADDR,iface:VI,fn:"gaugeToFees",args:[p.gauge]},{target:VOTER_ADDR,iface:VI,fn:"gaugeToBribe",args:[p.gauge]}]));
  for(let i=0;i<active.length;i++){active[i].t0=m2[i*4]||"";active[i].t1=m2[i*4+1]||"";active[i].feesAddr=m2[i*4+2]||"";active[i].bribeAddr=m2[i*4+3]||"";}
  const uniq=[...new Set(active.flatMap(p=>[p.t0,p.t1]).filter(Boolean))];
  const[syms,decs]=await Promise.all([mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})))]);
  const tinfo={};for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  for(const p of active)p.symbol=`${tinfo[p.t0.toLowerCase()]?.symbol||"?"}/${tinfo[p.t1.toLowerCase()]?.symbol||"?"}`;
  const contracts=active.flatMap(p=>[{addr:p.feesAddr,pidx:active.indexOf(p),type:"fees"},{addr:p.bribeAddr,pidx:active.indexOf(p),type:"bribe"}]).filter(c=>c.addr&&c.addr!==ethers.ZeroAddress);
  const lenRes=await mcall(contracts.map(c=>({target:c.addr,iface:RI,fn:"rewardsListLength"})));
  const rwC=[],rwM=[];
  for(let i=0;i<contracts.length;i++){const len=Number(lenRes[i]||0);for(let t=0;t<Math.min(len,6);t++){rwC.push({target:contracts[i].addr,iface:RI,fn:"rewards",args:[t]});rwM.push(contracts[i]);}}
  const rwA=await mcall(rwC);
  const amtC=[],amtM=[];
  for(let i=0;i<rwA.length;i++){const tok=rwA[i];if(!tok||tok===ethers.ZeroAddress)continue;amtC.push({target:rwM[i].addr,iface:RI,fn:"tokenRewardsPerEpoch",args:[tok,epoch]});amtM.push({...rwM[i],tok});}
  const amts=await mcall(amtC);
  const newT=[...new Set(amtM.map(m=>m.tok.toLowerCase()))].filter(t=>!tinfo[t]);
  if(newT.length){const[ns,nd]=await Promise.all([mcall(newT.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(newT.map(t=>({target:t,iface:EI,fn:"decimals"})))]);for(let i=0;i<newT.length;i++)tinfo[newT[i]]={symbol:ns[i]||"?",decimals:Number(nd[i]||18)};}
  const allToks=[...new Set(amtM.map(m=>m.tok.toLowerCase()))];
  const geckoPrices=await fetchGeckoPrices(allToks);
  const knownPrices={...STABLE,...geckoPrices};
  const missingToks=allToks.filter(t=>!knownPrices[t]);
  const LP=await fetchOnChainPrices(missingToks,active,tinfo,knownPrices);
  for(let i=0;i<amts.length;i++){const raw=amts[i];if(!raw||raw===0n)continue;const{pidx,tok,type}=amtM[i];const p=active[pidx];const inf=tinfo[tok.toLowerCase()]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(raw,inf.decimals));const usd=amt*(LP[tok.toLowerCase()]||0);const entry={symbol:inf.symbol,usd};if(type==="fees"){p.feeTokens.push(entry);p.feesUsd+=usd;}else{p.bribeTokens.push(entry);p.bribeUsd+=usd;}p.totalUsd+=usd;}
  for(const p of active){p.ratio=p.totalUsd/(p.voteWeight+MY_VEAERO);p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));p.veApy=p.ratio*52*100;}
  // Mark pools with suspicious vote drops (likely mid-reset)
  for(const p of active) {
    const prev = prevVotes[p.pool.toLowerCase()];
    if(prev && prev > 100000 && p.voteWeight < prev * 0.5) {
      p.resetSuspect = true;
      p.voteWeight = prev; // use previous value
      p.ratio = p.totalUsd/(prev+MY_VEAERO);
      p.myUsd = p.totalUsd*(MY_VEAERO/(prev+MY_VEAERO));
      p.veApy = p.ratio*52*100;
    }
    prevVotes[p.pool.toLowerCase()] = p.voteWeight;
  }
  return active.filter(p=>p.totalUsd>0&&p.veApy<5000).sort((a,b)=>b.ratio-a.ratio);
}

function render(data,cycle,timeLeft){
  console.clear();
  const W=process.stdout.columns||115;
  const L="=".repeat(W);const T="-".repeat(W);const R="\x1b[0m";
  console.log("\n"+L);
  console.log("  AERODROME -- (FEES+INCENTIVES) / (VOTES + MOI "+MY_VEAERO+")");
  console.log(L);
  console.log(`  До закрытия: ${fT(timeLeft).padEnd(18)}  Цикл: #${cycle}  ${new Date().toLocaleTimeString("ru-RU")}`);
  console.log(L+"\n");
  if(!data.length){console.log("  Нет данных\n");return;}
  const H=[lpad("#",3),pad("Пул",22),lpad("Votes%",8),lpad("Fees$",9),lpad("Bribe$",9),lpad("Total$",9),lpad("$/vote",10),lpad("veAPY",8),lpad("Мои$",8),"Токены"].join("  ");
  console.log("  "+H);console.log("  "+T);
  for(let i=0;i<Math.min(data.length,40);i++){
    const p=data[i];
    const rClr=i===0?"\x1b[92m":i<3?"\x1b[97m":i<10?"\x1b[37m":"\x1b[90m";
    const myClr=p.myUsd>200?"\x1b[33m":p.myUsd>100?"\x1b[37m":"\x1b[90m";
    const toks=(p.resetSuspect?"⚠️RESET ":"")+[...p.feeTokens.filter(t=>t.usd>0).map(t=>t.symbol),...p.bribeTokens.filter(t=>t.usd>0).map(t=>t.symbol)].slice(0,3).join(" ");
    const row=[lpad(String(i+1),3),pad(p.symbol,22),lpad(fP(p.votePct),8),lpad(fU(p.feesUsd),9),lpad(fU(p.bribeUsd),9),lpad(fU(p.totalUsd),9),lpad("$"+p.ratio.toFixed(5),10),lpad(p.veApy.toFixed(1)+"%",8),myClr+lpad(fU(p.myUsd),8)+R+rClr,toks].join("  ");
    console.log("  "+rClr+row+R);
  }
  console.log("\n  "+T);
  if(data[0])console.log(`  \x1b[92m#1: ${data[0].symbol.padEnd(24)} veAPY: ${data[0].veApy.toFixed(1)}%  Мои: ${fU(data[0].myUsd)}\x1b[0m`);
  console.log(`\n  Пулов с наградами: ${data.length}`);

  // Recommendation block
  const opt=optimizeVotes(data,MY_VEAERO);
  if(!opt)return;
  const bp=data[0];
  const totalMyVotes=MY_LOCKS.reduce((a,b)=>a+b,0);
  const votesAfter=Math.round(bp.voteWeight)+totalMyVotes;

  console.log("\n"+L);
  console.log("  РЕКОМЕНДАЦИЯ ДЛЯ ГОЛОСОВАНИЯ");
  console.log(L);
  console.log(`  Лучший пул:    \x1b[97m${bp.symbol}\x1b[0m`);
  console.log(`  Наград всего:  \x1b[92m${fU(bp.totalUsd)}\x1b[0m  (fees: ${fU(bp.feesUsd)} + bribes: ${fU(bp.bribeUsd)})`);
  console.log(`  Голоса сейчас: ${Math.round(bp.voteWeight).toLocaleString()} veAERO  (${bp.votePct.toFixed(2)}% от всех)`);
  console.log(`  После моих:    ${votesAfter.toLocaleString()} veAERO  (+${totalMyVotes.toLocaleString()})`);
  console.log(`  Моя доля:      ${(totalMyVotes/votesAfter*100).toFixed(2)}%`);
  console.log(`  veAPY:         ${bp.veApy.toFixed(1)}%`);
  console.log(`  100% в один:   \x1b[33m${fU(opt.totalSingle)}\x1b[0m`);
  console.log("\n  "+T);

  if(opt.singleBest){
    console.log(`  \x1b[92mОПТИМАЛЬНО: все ${totalMyVotes.toLocaleString()} veAERO -> ${bp.symbol}\x1b[0m`);
    console.log("  "+T);
    console.log(`  ${"Пул".padEnd(24)} ${"Голосов сейчас".padStart(14)} ${"После+моих".padStart(12)} ${"Моя доля".padStart(10)} ${"Мои veAERO".padStart(12)} ${"Rewards".padStart(9)}`);
    console.log("  "+"-".repeat(90));
    const sharePct=(totalMyVotes/votesAfter*100).toFixed(3);
    console.log(`  ${bp.symbol.padEnd(24)} ${Math.round(bp.voteWeight).toLocaleString().padStart(14)} ${votesAfter.toLocaleString().padStart(12)} ${(sharePct+"%").padStart(10)} ${totalMyVotes.toLocaleString().padStart(12)}  \x1b[33m${fU(opt.totalSingle)}\x1b[0m`);
  } else {
    const gain=opt.totalOpt-opt.totalSingle;
    console.log(`  \x1b[92mОПТИМАЛЬНО: распределить по ${opt.allocations.length} пулам  (+${fU(gain)}, +${(gain/opt.totalSingle*100).toFixed(1)}%)\x1b[0m`);
    console.log("  "+T);
    console.log(`  ${"Пул".padEnd(24)} ${"Голосов сейчас".padStart(14)} ${"После+моих".padStart(12)} ${"Моя доля".padStart(10)} ${"Мои veAERO".padStart(12)} ${"Rewards".padStart(9)}`);
    console.log("  "+"-".repeat(90));
    for(const r of opt.allocations){
      const alloc=Math.round(r.alloc);
      const vAfter=Math.round(r.pool.voteWeight)+alloc;
      const sharePct=(alloc/vAfter*100).toFixed(3);
      const reward=r.pool.totalUsd*(alloc/(r.pool.voteWeight+alloc));
      console.log(`  ${r.pool.symbol.padEnd(24)} ${Math.round(r.pool.voteWeight).toLocaleString().padStart(14)} ${vAfter.toLocaleString().padStart(12)} ${(sharePct+"%").padStart(10)} ${alloc.toLocaleString().padStart(12)}  \x1b[33m${fU(reward)}\x1b[0m`);
    }
    console.log("  "+T);
    // Suggest how to split across locks
    console.log("\n  Как разбить по локам:");
    let remaining=[...opt.allocations];
    for(let i=0;i<MY_LOCKS.length;i++){
      const lock=MY_LOCKS[i];
      // Find best pool that still has allocation for this lock
      const best=remaining.find(r=>r.alloc>=lock*0.5)||remaining[0];
      if(!best)break;
      const reward=best.pool.totalUsd*(lock/(best.pool.voteWeight+lock));
      console.log(`  Лок ${i+1} (${lock.toLocaleString()} veAERO)  ->  ${best.pool.symbol.padEnd(22)}  \x1b[33m${fU(reward)}\x1b[0m`);
    }
  }
  console.log("  "+T);
  console.log(`  ИТОГО: \x1b[92m${fU(opt.totalOpt)}\x1b[0m`);
  console.log();
}

async function main(){
  const WEEK=604800,now=Math.floor(Date.now()/1000),epoch=Math.floor(now/WEEK)*WEEK;
  const voteDeadline=epoch+WEEK-VOTE_OFFSET;
  console.log("\n"+"=".repeat(80));
  console.log("  RANK -- (fees+incentives)/(votes+"+MY_VEAERO+")");
  console.log("=".repeat(80));
  console.log(`  Дедлайн: ${new Date(voteDeadline*1000).toLocaleString("ru-RU")}`);
  console.log(`  До закрытия: ${fT(voteDeadline-now)}`);
  console.log("=".repeat(80)+"\n");
  await sendTG(`Rank запущен\nДедлайн: ${new Date(voteDeadline*1000).toLocaleTimeString("ru-RU")}`);
  let cycle=0,firstSent=false,finalSent=false,prevTop="",prevMyUsd=0;
  const prevVotes={};
  while(true){
    const now2=Math.floor(Date.now()/1000);const left=voteDeadline-now2;
    if(left<=0){console.clear();console.log("\nГолосование закрыто!\n");await sendTG("Голосование закрыто!");break;}
    let data=[];try{data=await fetchData(prevVotes);}catch(e){console.error("Error:",e.message);}
    cycle++;render(data,cycle,left);
    const isFinal=left<=8*60&&!finalSent;
    if(isFinal){
      finalSent=true;
      const opt=optimizeVotes(data,MY_VEAERO);
      const bp=data[0];
      let msg=`ФИНАЛЬНЫЙ РЕЙТИНГ!\nДо закрытия: ${fT(left)}\n\n`;
      if(bp){
        msg+=`Пул: ${bp.symbol}\nНаград: ${fU(bp.totalUsd)} | veAPY: ${bp.veApy.toFixed(1)}%\nГолоса: ${Math.round(bp.voteWeight).toLocaleString()}\n\n`;
        if(opt){
          for(let i=0;i<MY_LOCKS.length;i++){
            const r=opt.singleBest?{pool:bp}:opt.allocations[Math.min(i,opt.allocations.length-1)];
            const lock=MY_LOCKS[i];
            const reward=r.pool.totalUsd*(lock/(r.pool.voteWeight+lock));
            msg+=`Лок ${i+1} (${lock.toLocaleString()}) -> ${r.pool.symbol}: ${fU(reward)}\n`;
          }
          msg+=`\nИТОГО: ${fU(opt.totalOpt)}\naeroдrome.finance/vote`;
        }
      }
      await sendTG(msg);
    } else if(data.length>0){
      if(!firstSent){
        firstSent=true;
        const bp=data[0];
        const opt=optimizeVotes(data,MY_VEAERO);
        let msg=`Rank запущен\nДо закрытия: ${fT(left)}\n\nПул: ${bp.symbol}\nНаград: ${fU(bp.totalUsd)} | veAPY: ${bp.veApy.toFixed(1)}%\n\n`;
        if(opt){
          for(let i=0;i<MY_LOCKS.length;i++){
            const r=opt.singleBest?{pool:bp}:opt.allocations[Math.min(i,opt.allocations.length-1)];
            const lock=MY_LOCKS[i];
            const reward=r.pool.totalUsd*(lock/(r.pool.voteWeight+lock));
            msg+=`Лок ${i+1} (${lock.toLocaleString()}) -> ${r.pool.symbol}: ${fU(reward)}\n`;
          }
          msg+=`\nИТОГО: ${fU(opt.totalOpt)}`;
        }
        await sendTG(msg);
        prevTop=bp.symbol;prevMyUsd=bp.myUsd;
      } else {
        const curTop=data[0]?.symbol||"";const curMyUsd=data[0]?.myUsd||0;
        if(curTop!==prevTop||Math.abs(curMyUsd-prevMyUsd)/prevMyUsd>0.1){
          const bp=data[0];
          const opt=optimizeVotes(data,MY_VEAERO);
          let msg=curTop!==prevTop?`Смена лидера!\n`:`Изменение +10%\n`;
          msg+=`До закрытия: ${fT(left)}\nПул: ${bp.symbol} | veAPY: ${bp.veApy.toFixed(1)}%\n\n`;
          if(opt){
            for(let i=0;i<MY_LOCKS.length;i++){
              const r=opt.singleBest?{pool:bp}:opt.allocations[Math.min(i,opt.allocations.length-1)];
              const lock=MY_LOCKS[i];
              const reward=r.pool.totalUsd*(lock/(r.pool.voteWeight+lock));
              msg+=`Лок ${i+1} (${lock.toLocaleString()}) -> ${r.pool.symbol}: ${fU(reward)}\n`;
            }
            msg+=`\nИТОГО: ${fU(opt.totalOpt)}`;
          }
          await sendTG(msg);
          prevTop=curTop;prevMyUsd=curMyUsd;
        }
      }
    }
    await new Promise(r=>setTimeout(r,left>10*60?60000:15000));
  }
}

main().catch(e=>{console.error("\n"+e.message);process.exit(1);});
