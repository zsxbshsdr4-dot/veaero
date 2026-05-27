import { ethers } from "ethers";
import { readFileSync, readdirSync } from "fs";

const RPC       = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const MY_VEAERO = parseFloat(process.env.MY_VEAERO || "41801");

const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938":1,"0xb79dd08ea68a908a97220c76d19a6aa9cbde4376":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

const SI=new ethers.Interface(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)"]);
const GI=new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);

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


const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938":1,"0xb79dd08ea68a908a97220c76d19a6aa9cbde4376":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

const SI=new ethers.Interface(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)"]);
const GI=new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);

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


const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938":1,"0xb79dd08ea68a908a97220c76d19a6aa9cbde4376":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

const SI=new ethers.Interface(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)"]);
const GI=new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);

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


const fU=n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP=n=>Number(n).toFixed(2)+"%";
const pad=(s,n)=>String(s).slice(0,n).padEnd(n);
const lpad=(s,n)=>String(s).slice(0,n).padStart(n);

function optimizeVotes(pools, myVeAero) {
  const candidates=pools.slice(0,50).filter(p=>p.totalUsd>50);
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
  const results=candidates.map((p,i)=>({
    pool:p,alloc:Math.round(allocs[i]),pct:allocs[i]/myVeAero*100,
    myReward:p.totalUsd*(allocs[i]/(p.voteWeight+allocs[i]))
  })).filter(r=>r.pct>=1).sort((a,b)=>b.alloc-a.alloc);
  const totalOpt=results.reduce((s,r)=>s+r.myReward,0);
  const totalSingle=candidates[0]?candidates[0].totalUsd*(myVeAero/(candidates[0].voteWeight+myVeAero)):0;
  if(totalOpt<=totalSingle*1.001)return{allocations:[{pool:candidates[0],alloc:myVeAero,pct:100,myReward:totalSingle}],totalOpt:totalSingle,totalSingle,singleBest:true};
  return{allocations:results,totalOpt,totalSingle,singleBest:false};
}

async function main(){
  const WEEK=604800,now=Math.floor(Date.now()/1000);
  const currentEpoch=Math.floor(now/WEEK)*WEEK;
  const prevEpoch=currentEpoch-WEEK;

  console.log("\n"+"═".repeat(100));
  console.log("  📊 АНАЛИЗ ПРЕДЫДУЩЕЙ ЭПОХИ — POST FACTUM");
  console.log("═".repeat(100));
  console.log(`  Текущая эпоха:  ${new Date(currentEpoch*1000).toDateString()}`);
  console.log(`  Прошлая эпоха:  ${new Date(prevEpoch*1000).toDateString()}`);
  console.log(`  Мои veAERO:     ${MY_VEAERO.toLocaleString()}`);
  console.log("═".repeat(100)+"\n");

  // Try to load saved snapshot
  const dir = "/Users/gregoryk./Downloads/veaero";
  let pools = null;
  let source = "";

  // Find snapshot file for previous epoch
  try {
    const files = readdirSync(dir).filter(f=>f.startsWith("epoch_")&&f.endsWith(".json"));
    // Find closest to prevEpoch
    const snapshots = files.map(f=>{
      const ts = parseInt(f.replace("epoch_","").replace(".json",""));
      return {f, ts, diff: Math.abs(ts-prevEpoch)};
    }).sort((a,b)=>a.diff-b.diff);

    if(snapshots.length>0 && snapshots[0].diff < WEEK){
      const snap = JSON.parse(readFileSync(`${dir}/${snapshots[0].f}`,"utf8"));
      pools = snap.pools;
      source = `снапшот от ${new Date(snap.savedAt*1000).toLocaleString("ru-RU")} (эпоха ${new Date(snap.epoch*1000).toDateString()})`;
      console.log(`✅ Загружен ${source}`);
    }
  } catch(e) {}

  // If no snapshot — fetch from Sugar epochsByAddress
  if(!pools) {
    console.log("⚠️  Снапшот не найден — загружаю из Sugar (медленно)...");

    const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
    const VI=new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)"]);
    const PI=new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
    const EI=new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
    const SUGAR_ABI=["function epochsByAddress(uint256,uint256,address) view returns (tuple(uint256 ts,address lp,uint256 votes,uint256 emissions,tuple(address token,uint256 amount)[] bribes,tuple(address token,uint256 amount)[] fees)[])"];
    const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

    const provider=new ethers.JsonRpcProvider(RPC);
    const mc3=new ethers.Contract("0xcA11bde05977b3631167028862bE2a173976CA11",MC3_ABI,provider);
    const sugar=new ethers.Contract("0x68c19e13618c41158fe4baba1b8fb3a9c74bdb0a",SUGAR_ABI,provider);
    const voter=new ethers.Contract("0x16613524e02ad97eDfeF371bC883F2F5d6C480A5",VI,provider);

    function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
    async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}

    process.stdout.write("⏳ Пулы... ");
    const total=Number(await voter.length());
    const totalW=await voter.totalWeight();
    const totalVeAero=Number(ethers.formatEther(totalW));
    const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:"0x16613524e02ad97eDfeF371bC883F2F5d6C480A5",iface:VI,fn:"pools",args:[i]})));
    const allPools=poolRes.filter(Boolean);
    const weights=await mcall(allPools.map(p=>({target:"0x16613524e02ad97eDfeF371bC883F2F5d6C480A5",iface:VI,fn:"weights",args:[p]})));
    const activePools=allPools.filter((_,i)=>weights[i]&&weights[i]>0n);
    const m1=await mcall(activePools.flatMap(p=>[{target:p,iface:PI,fn:"token0"},{target:p,iface:PI,fn:"token1"}]));
    const uniq=[...new Set(activePools.flatMap((_,i)=>[m1[i*2],m1[i*2+1]]).filter(Boolean))];
    const[syms,decs]=await Promise.all([mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})))]);
    const tinfo={};for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
    const poolSymbols={};for(let i=0;i<activePools.length;i++){const t0=m1[i*2]?.toLowerCase()||"";const t1=m1[i*2+1]?.toLowerCase()||"";poolSymbols[activePools[i].toLowerCase()]=`${tinfo[t0]?.symbol||"?"}/${tinfo[t1]?.symbol||"?"}`;}
    console.log(`✅ ${activePools.length} активных`);

    process.stdout.write("⏳ Sugar предыдущая эпоха (батчи по 50)... ");
    const results=[];
    const BATCH=50;
    for(let i=0;i<activePools.length;i+=BATCH){
      const batch=activePools.slice(i,i+BATCH);
      const epResults=await Promise.allSettled(batch.map(lp=>sugar.epochsByAddress(2,0,lp)));
      for(let j=0;j<epResults.length;j++){
        if(epResults[j].status!=="fulfilled")continue;
        const epochs=epResults[j].value;
        // Find previous epoch (ts = prevEpoch)
        const prevEp=epochs.find(e=>Number(e.ts)>=prevEpoch&&Number(e.ts)<currentEpoch)
                    ||epochs.find(e=>Number(e.ts)<currentEpoch);
        if(!prevEp)continue;
        const votes=Number(ethers.formatEther(prevEp.votes));
        if(votes===0)continue;
        let feesUsd=0,bribeUsd=0;
        for(const t of prevEp.fees){const tok=t.token.toLowerCase();const inf=tinfo[tok]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(t.amount,inf.decimals));feesUsd+=amt;}
        for(const t of prevEp.bribes){const tok=t.token.toLowerCase();const inf=tinfo[tok]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(t.amount,inf.decimals));bribeUsd+=amt;}
        const totalUsd=feesUsd+bribeUsd;
        if(totalUsd===0)continue;
        results.push({
          pool:batch[j],symbol:poolSymbols[batch[j].toLowerCase()]||"?/?",
          voteWeight:votes,votePct:(votes/totalVeAero)*100,
          feesUsd,bribeUsd,totalUsd,
          ratio:totalUsd/votes,
          myUsd:totalUsd*(MY_VEAERO/(votes+MY_VEAERO)),
          veApy:(totalUsd/votes)*52*100,
        });
      }
      process.stdout.write(`${i+BATCH}/${activePools.length}... `);
    }
    pools=results;
    source="Sugar epochsByAddress (без цен USD)";
    console.log(`\n✅ ${pools.length} пулов с данными`);
  }

  // Recalculate with MY_VEAERO
  for(const p of pools){
    p.ratio=p.voteWeight>0?p.totalUsd/p.voteWeight:0;
    p.veApy=p.ratio*52*100;
    p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));
  }

  const ranked=pools.filter(p=>p.totalUsd>0&&p.veApy<5000).sort((a,b)=>b.ratio-a.ratio);

  // Print table
  const W=process.stdout.columns||115;
  const L="═".repeat(W);const T="─".repeat(W);const R="\x1b[0m";

  const H=[lpad("#",3),pad("Пул",22),lpad("Votes%",8),lpad("Votes",11),lpad("Fees$",9),lpad("Bribes$",9),lpad("Total$",9),lpad("$/vote",10),lpad("veAPY",8),lpad("Если бы мои$",12)].join("  ");

  console.log("\n"+L);
  console.log("  🏆 ТОП-40 ПРОШЛОЙ ЭПОХИ — рейтинг без моих голосов");
  console.log(L);
  console.log("  "+H);console.log("  "+T);

  for(let i=0;i<Math.min(ranked.length,40);i++){
    const p=ranked[i];
    const clr=i===0?"\x1b[92m":i<3?"\x1b[97m":i<10?"\x1b[37m":"\x1b[90m";
    const row=[lpad(String(i+1),3),pad(p.symbol,22),lpad(fP(p.votePct),8),lpad(Math.round(p.voteWeight).toLocaleString(),11),lpad(fU(p.feesUsd),9),lpad(fU(p.bribeUsd),9),lpad(fU(p.totalUsd),9),lpad("$"+p.ratio.toFixed(5),10),lpad(p.veApy.toFixed(1)+"%",8),lpad(fU(p.myUsd),12)].join("  ");
    console.log("  "+clr+row+R);
  }
  console.log("\n  "+T);

  // Optimizer
  const opt=optimizeVotes(ranked,MY_VEAERO);
  if(opt){
    const bp=ranked[0];
    const totalMyVotes=MY_VEAERO;
    console.log("\n"+L);
    console.log("  🧮 ОПТИМАЛЬНОЕ РАСПРЕДЕЛЕНИЕ (если бы ты знал заранее)");
    console.log(L);
    console.log(`  100% в ${bp.symbol}: ${fU(opt.totalSingle)}`);
    if(!opt.singleBest){
      const gain=opt.totalOpt-opt.totalSingle;
      console.log(`  Оптимально:      \x1b[92m${fU(opt.totalOpt)}\x1b[0m  (+${fU(gain)}, +${(gain/opt.totalSingle*100).toFixed(1)}%)`);
      console.log("\n  "+T);
      console.log(`  ${"Пул".padEnd(24)} ${"Голосов".padStart(12)} ${"Мои veAERO".padStart(12)} ${"Доля%".padStart(8)} ${"Rewards".padStart(9)}`);
      console.log("  "+"-".repeat(70));
      for(const r of opt.allocations){
        const vAfter=Math.round(r.pool.voteWeight)+r.alloc;
        const sharePct=(r.alloc/vAfter*100).toFixed(2);
        console.log(`  ${r.pool.symbol.padEnd(24)} ${Math.round(r.pool.voteWeight).toLocaleString().padStart(12)} ${r.alloc.toLocaleString().padStart(12)} ${(sharePct+"%").padStart(8)}  \x1b[33m${fU(r.myReward)}\x1b[0m`);
      }
    } else {
      console.log(`  \x1b[92mОптимально: 100% в ${bp.symbol}\x1b[0m`);
    }
    console.log("  "+T);
    console.log(`  ИТОГО: \x1b[92m${fU(opt.totalOpt)}\x1b[0m`);
  }
  console.log(`\n  Источник: ${source}\n`);
}

main().catch(e=>{console.error("\n❌",e.message);process.exit(1);});
