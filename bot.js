import { ethers } from "ethers";

const BOT_TOKEN = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const RPC = process.env.RPC_URL || "https://mainnet.base.org";
const MY_VEAERO = parseFloat(process.env.MY_VEAERO || "25262");

const VOTER = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3   = "0xcA11bde05977b3631167028862bE2a173976CA11";

const VI = new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function gauges(address) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)","function gaugeToFees(address) view returns (address)","function gaugeToBribe(address) view returns (address)"]);
const PI = new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI = new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const RI = new ethers.Interface(["function rewardsListLength() view returns (uint256)","function rewards(uint256) view returns (address)","function tokenRewardsPerEpoch(address,uint256) view returns (uint256)"]);
const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const FB={"0x4200000000000000000000000000000000000006":2500,"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0x940181a94a35a4569e4529a3cdfb74e38fd98631":0.444,"0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":94000,"0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22":2450,"0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452":2550,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1};

function fU(n){if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+Math.round(n);}
function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}

let cache=null,cacheTime=0;

async function getData(){
  if(cache&&Date.now()-cacheTime<5*60*1000) return cache;
  const provider=new ethers.JsonRpcProvider(RPC);
  const mc3=new ethers.Contract(MC3,MC3_ABI,provider);
  async function mcall(calls){
    const res=[];
    for(const batch of chunks(calls,100)){
      try{
        const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));
        for(let i=0;i<raw.length;i++){
          if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}
          try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}
        }
      }catch{batch.forEach(()=>res.push(null));}
    }
    return res;
  }
  const voter=new ethers.Contract(VOTER,VI,provider);
  const total=Number(await voter.length());
  const totalW=await voter.totalWeight();
  const WEEK=604800,now=Math.floor(Date.now()/1000),epoch=Math.floor(now/WEEK)*WEEK;
  const totalVeAero=Number(ethers.formatEther(totalW));
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  const m1=await mcall(pools.flatMap(p=>[{target:VOTER,iface:VI,fn:"gauges",args:[p]},{target:VOTER,iface:VI,fn:"weights",args:[p]}]));
  const active=[];
  for(let i=0;i<pools.length;i++){
    const gauge=m1[i*2],weight=m1[i*2+1];
    if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;
    const voteWeight=Number(ethers.formatEther(weight));
    active.push({pool:pools[i],gauge,voteWeight,votePct:(voteWeight/totalVeAero)*100,feesUsd:0,bribeUsd:0,totalUsd:0,feeTokens:[],bribeTokens:[]});
  }
  active.sort((a,b)=>b.voteWeight-a.voteWeight);
  const m2=await mcall(active.flatMap(p=>[{target:p.pool,iface:PI,fn:"token0"},{target:p.pool,iface:PI,fn:"token1"},{target:VOTER,iface:VI,fn:"gaugeToFees",args:[p.gauge]},{target:VOTER,iface:VI,fn:"gaugeToBribe",args:[p.gauge]}]));
  for(let i=0;i<active.length;i++){active[i].t0=m2[i*4]||"";active[i].t1=m2[i*4+1]||"";active[i].feesAddr=m2[i*4+2]||"";active[i].bribeAddr=m2[i*4+3]||"";}
  const uniq=[...new Set(active.flatMap(p=>[p.t0,p.t1]).filter(Boolean))];
  const syms=await mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"})));
  const decs=await mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})));
  const tinfo={};
  for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  for(const p of active)p.symbol=`${tinfo[p.t0.toLowerCase()]?.symbol||"?"}/${tinfo[p.t1.toLowerCase()]?.symbol||"?"}`;
  const contracts=active.flatMap(p=>[{addr:p.feesAddr,pidx:active.indexOf(p),type:"fees"},{addr:p.bribeAddr,pidx:active.indexOf(p),type:"bribe"}]).filter(c=>c.addr);
  const lenRes=await mcall(contracts.map(c=>({target:c.addr,iface:RI,fn:"rewardsListLength"})));
  const rwC=[],rwM=[];
  for(let i=0;i<contracts.length;i++){const len=Number(lenRes[i]||0);for(let t=0;t<Math.min(len,6);t++){rwC.push({target:contracts[i].addr,iface:RI,fn:"rewards",args:[t]});rwM.push(contracts[i]);}}
  const rwA=await mcall(rwC);
  const amtC=[],amtM=[];
  for(let i=0;i<rwA.length;i++){const tok=rwA[i];if(!tok||tok===ethers.ZeroAddress)continue;amtC.push({target:rwM[i].addr,iface:RI,fn:"tokenRewardsPerEpoch",args:[tok,epoch]});amtM.push({...rwM[i],tok});}
  const amts=await mcall(amtC);
  const newT=[...new Set(amtM.map(m=>m.tok.toLowerCase()))].filter(t=>!tinfo[t]);
  if(newT.length){const ns=await mcall(newT.map(t=>({target:t,iface:EI,fn:"symbol"})));const nd=await mcall(newT.map(t=>({target:t,iface:EI,fn:"decimals"})));for(let i=0;i<newT.length;i++)tinfo[newT[i]]={symbol:ns[i]||"?",decimals:Number(nd[i]||18)};}
  const allToks=[...new Set(amtM.map(m=>m.tok.toLowerCase()))];
  const LP={};
  try{for(let i=0;i<allToks.length;i+=30){const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${allToks.slice(i,i+30).join(",")}`);const j=await r.json();for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))if(p)LP[a.toLowerCase()]=parseFloat(p);}}catch(e){}
  for(let i=0;i<amts.length;i++){const raw=amts[i];if(!raw||raw===0n)continue;const{pidx,tok,type}=amtM[i];const p=active[pidx];const inf=tinfo[tok.toLowerCase()]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(raw,inf.decimals));const usd=amt*(LP[tok.toLowerCase()]||FB[tok.toLowerCase()]||0);const entry={symbol:inf.symbol,amt,usd};if(type==="fees"){p.feeTokens.push(entry);p.feesUsd+=usd;}else{p.bribeTokens.push(entry);p.bribeUsd+=usd;}p.totalUsd+=usd;}
  for(const p of active){p.roi=p.voteWeight>0?p.totalUsd/p.voteWeight:0;p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));p.veApy=p.roi*52*100;}
  cache={pools:active,meta:{totalPools:total,activePools:active.length,withRewards:active.filter(p=>p.totalUsd>0).length,totalVeAero,myVeAero:MY_VEAERO,totalBribes:active.reduce((s,p)=>s+p.bribeUsd,0),totalFees:active.reduce((s,p)=>s+p.feesUsd,0),totalRewards:active.reduce((s,p)=>s+p.totalUsd,0),epoch,epochDate:new Date(epoch*1000).toDateString(),updatedAt:Date.now()}};
  cacheTime=Date.now();
  return cache;
}

async function send(chatId,text){
  await fetch(`${API}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text,parse_mode:"HTML"})});
}

async function handle(update){
  const msg=update.message;
  if(!msg)return;
  const chatId=msg.chat.id;
  const text=msg.text||"";
  if(text==="/start"){
    await send(chatId,"🟦 <b>veAERO Voting Scanner</b>\n\nКоманды:\n/best — лучший пул\n/top — топ-10 по моим $\n/veapy — топ-10 по veAPY");
    return;
  }
  if(["/best","/top","/veapy"].includes(text)){
    await send(chatId,"⏳ Загружаю данные (~2 мин)...");
    try{
      const{pools,meta}=await getData();
      if(text==="/best"){
        const b=pools.filter(p=>p.totalUsd>500&&p.votePct>0.1).sort((a,b)=>b.myUsd-a.myUsd)[0]||pools[0];
        await send(chatId,`🚀 <b>ЛУЧШИЙ ПУЛ</b>\n\n<b>${b.symbol}</b>\nГолоса: ${b.votePct.toFixed(2)}%\nFees: ${fU(b.feesUsd)}\nBribes: ${fU(b.bribeUsd)}\nTotal: ${fU(b.totalUsd)}\nveAPY: ${b.veApy.toFixed(1)}%\n💰 Мои: <b>${fU(b.myUsd)}</b>\n\n📅 ${meta.epochDate}`);
      }
      if(text==="/top"){
        const top=pools.sort((a,b)=>b.myUsd-a.myUsd).slice(0,10);
        let m=`🎯 <b>ТОП-10 МОИ REWARDS</b>\n<i>${meta.epochDate}</i>\n\n`;
        top.forEach((p,i)=>{m+=`${i+1}. <b>${p.symbol}</b> — ${fU(p.myUsd)}\n   veAPY: ${p.veApy.toFixed(1)}% | Total: ${fU(p.totalUsd)}\n\n`;});
        await send(chatId,m);
      }
      if(text==="/veapy"){
        const top=[...pools].filter(p=>p.totalUsd>100&&p.votePct>0.05).sort((a,b)=>b.veApy-a.veApy).slice(0,10);
        let m=`📈 <b>ТОП-10 veAPY</b>\n<i>${meta.epochDate}</i>\n\n`;
        top.forEach((p,i)=>{m+=`${i+1}. <b>${p.symbol}</b> — ${p.veApy.toFixed(1)}%\n   Total: ${fU(p.totalUsd)} | Мои: ${fU(p.myUsd)}\n\n`;});
        await send(chatId,m);
      }
    }catch(e){await send(chatId,"❌ Ошибка: "+e.message);}
  }
}

async function poll(offset=0){
  try{
    const r=await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
    const j=await r.json();
    if(!j.ok){setTimeout(()=>poll(offset),5000);return;}
    let o=offset;
    for(const u of j.result){o=u.update_id+1;handle(u).catch(console.error);}
    poll(o);
  }catch(e){console.error("Poll error:",e.message);setTimeout(()=>poll(offset),5000);}
}

console.log("🤖 veAERO Bot started!");
poll();

// Test connectivity
fetch(`${API}/getMe`).then(r=>r.json()).then(j=>console.log("Bot info:",j.result?.username)).catch(e=>console.error("API error:",e.message));

// Keep alive for Railway
import http from "http";
http.createServer((req,res)=>res.end("OK")).listen(process.env.PORT||3000);
