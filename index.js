import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "41350");

const provider = new ethers.JsonRpcProvider(RPC);
const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const VI=new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function gauges(address) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)","function gaugeToFees(address) view returns (address)","function gaugeToBribe(address) view returns (address)"]);
const PI=new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI=new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const RI=new ethers.Interface(["function rewardsListLength() view returns (uint256)","function rewards(uint256) view returns (address)","function tokenRewardsPerEpoch(address,uint256) view returns (uint256)"]);
const SI=new ethers.Interface(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)"]);
const GI=new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);
const mc3=new ethers.Contract(MC3_ADDR,MC3_ABI,provider);

// Known stable prices
const STABLE = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 1,    // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 1,    // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 1,    // DAI
  "0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938": 1,    // USDz
  "0xb79dd08ea68a908a97220c76d19a6aa9cbde4376": 1,    // USD+
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 1.08, // EURC
};

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}

// Fetch prices from GeckoTerminal
async function fetchGeckoPrices(tokens){
  const prices={};
  for(let i=0;i<tokens.length;i+=30){
    try{
      const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokens.slice(i,i+30).join(",")}`);
      const j=await r.json();
      for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))
        if(p&&parseFloat(p)>0)prices[a.toLowerCase()]=parseFloat(p);
    }catch{}
  }
  return prices;
}

// Calculate price from slot0 (CL pool)
function priceFromSlot0(sqrtPriceX96,dec0,dec1){
  const Q96=2**96;
  const sqrtP=Number(sqrtPriceX96);
  const raw=(sqrtP/Q96)**2;
  return raw*Math.pow(10,dec0-dec1);
}

// Calculate price from reserves (AMM pool)
function priceFromReserves(r0,r1,dec0,dec1){
  const a=Number(r0)/Math.pow(10,dec0);
  const b=Number(r1)/Math.pow(10,dec1);
  if(a===0)return 0;
  return b/a; // price of token0 in token1
}

// Fetch on-chain prices for missing tokens using their pools
async function fetchOnChainPrices(missingTokens,activePools,tinfo,knownPrices){
  const USDC="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const WETH="0x4200000000000000000000000000000000000006";
  const prices={...knownPrices};

  // Find best pool for each missing token
  const tokenPoolMap={};
  for(const tok of missingTokens){
    // Prefer USDC pair, then WETH pair
    const usdcPool=activePools.find(p=>(p.t0.toLowerCase()===tok&&p.t1.toLowerCase()===USDC)||(p.t1.toLowerCase()===tok&&p.t0.toLowerCase()===USDC));
    const wethPool=activePools.find(p=>(p.t0.toLowerCase()===tok&&p.t1.toLowerCase()===WETH)||(p.t1.toLowerCase()===tok&&p.t0.toLowerCase()===WETH));
    const pool=usdcPool||wethPool;
    if(pool)tokenPoolMap[tok]={pool:pool.pool,t0:pool.t0.toLowerCase(),t1:pool.t1.toLowerCase()};
  }

  const poolAddrs=[...new Set(Object.values(tokenPoolMap).map(v=>v.pool))];
  if(!poolAddrs.length)return prices;

  // Try slot0 first (CL pools), then getReserves (AMM pools)
  const slot0Results=await mcall(poolAddrs.map(p=>({target:p,iface:SI,fn:"slot0"})));
  const reserveResults=await mcall(poolAddrs.map(p=>({target:p,iface:GI,fn:"getReserves"})));
  const token0Results=await mcall(poolAddrs.map(p=>({target:p,iface:GI,fn:"token0"})));

  for(const[tok,{pool,t0,t1}] of Object.entries(tokenPoolMap)){
    const idx=poolAddrs.indexOf(pool);
    const inf0=tinfo[t0]||{decimals:18};
    const inf1=tinfo[t1]||{decimals:18};
    const pairedToken=t0===tok?t1:t0;
    const pairedPrice=prices[pairedToken]||STABLE[pairedToken]||0;
    if(!pairedPrice)continue;

    let tokPrice=0;

    // Try slot0 (CL)
    if(slot0Results[idx]){
      try{
        const sqrtP=slot0Results[idx][0]||slot0Results[idx].sqrtPriceX96;
        if(sqrtP&&sqrtP>0n){
          const rawPrice=priceFromSlot0(sqrtP,inf0.decimals,inf1.decimals);
          // rawPrice = price of t1 per t0
          if(t0===tok){
            // tok=t0, paired=t1 → price_tok_in_paired = rawPrice → price_tok_usd = rawPrice*pairedPrice
            tokPrice=rawPrice*pairedPrice;
          }else{
            // tok=t1, paired=t0 → price_tok_in_paired = 1/rawPrice
            tokPrice=(1/rawPrice)*pairedPrice;
          }
        }
      }catch{}
    }

    // Try getReserves (AMM) if slot0 failed
    if(!tokPrice&&reserveResults[idx]){
      try{
        const[r0,r1]=reserveResults[idx];
        const actualT0=(token0Results[idx]||t0).toLowerCase();
        let rawPrice;
        if(actualT0===tok){
          rawPrice=priceFromReserves(r0,r1,inf0.decimals,inf1.decimals);
          tokPrice=rawPrice*pairedPrice;
        }else{
          rawPrice=priceFromReserves(r1,r0,inf1.decimals,inf0.decimals);
          tokPrice=rawPrice*pairedPrice;
        }
      }catch{}
    }

    if(tokPrice>0&&tokPrice<1e12)prices[tok]=tokPrice;
  }
  return prices;
}

const fU=n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP=n=>Number(n).toFixed(2)+"%";
const pad=(s,n)=>String(s).slice(0,n).padEnd(n);
const lpad=(s,n)=>String(s).slice(0,n).padStart(n);

async function main(){
  console.log("\n"+"═".repeat(100));
  console.log("  🟦 AERODROME veAERO VOTING SCANNER — FULL DATA");
  console.log("═".repeat(100)+"\n");

  const voter=new ethers.Contract(VOTER_ADDR,VI,provider);
  const total=Number(await voter.length());
  const totalW=await voter.totalWeight();
  const WEEK=604800,now=Math.floor(Date.now()/1000),epoch=Math.floor(now/WEEK)*WEEK;
  const totalVeAero=Number(ethers.formatEther(totalW));

  console.log(`📦 Всего пулов: ${total.toLocaleString()}`);
  console.log(`💪 Total veAERO weight: ${totalVeAero.toLocaleString()}`);
  console.log(`👤 Мои veAERO: ${MY_VEAERO.toLocaleString()}`);
  console.log(`📅 Эпоха: ${new Date(epoch*1000).toDateString()}\n`);

  // Step 1: Pools
  process.stdout.write("⏳ [1/6] Пулы... ");
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  console.log(`✅ ${pools.length}`);

  // Step 2: Gauges + weights
  process.stdout.write("⏳ [2/6] Gauges и веса... ");
  const m1=await mcall(pools.flatMap(p=>[{target:VOTER_ADDR,iface:VI,fn:"gauges",args:[p]},{target:VOTER_ADDR,iface:VI,fn:"weights",args:[p]}]));
  const active=[];
  for(let i=0;i<pools.length;i++){
    const gauge=m1[i*2],weight=m1[i*2+1];
    if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;
    const vw=Number(ethers.formatEther(weight));
    active.push({pool:pools[i],gauge,voteWeight:vw,votePct:(vw/totalVeAero)*100,feesUsd:0,bribeUsd:0,totalUsd:0,feeTokens:[],bribeTokens:[]});
  }
  active.sort((a,b)=>b.voteWeight-a.voteWeight);
  console.log(`✅ Активных: ${active.length}`);

  // Step 3: Tokens
  process.stdout.write("⏳ [3/6] Токены... ");
  const m2=await mcall(active.flatMap(p=>[{target:p.pool,iface:PI,fn:"token0"},{target:p.pool,iface:PI,fn:"token1"},{target:VOTER_ADDR,iface:VI,fn:"gaugeToFees",args:[p.gauge]},{target:VOTER_ADDR,iface:VI,fn:"gaugeToBribe",args:[p.gauge]}]));
  for(let i=0;i<active.length;i++){active[i].t0=m2[i*4]||"";active[i].t1=m2[i*4+1]||"";active[i].feesAddr=m2[i*4+2]||"";active[i].bribeAddr=m2[i*4+3]||"";}
  const uniq=[...new Set(active.flatMap(p=>[p.t0,p.t1]).filter(Boolean))];
  const[syms,decs]=await Promise.all([mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})))]);
  const tinfo={};
  for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  for(const p of active)p.symbol=`${tinfo[p.t0.toLowerCase()]?.symbol||"?"}/${tinfo[p.t1.toLowerCase()]?.symbol||"?"}`;
  console.log("✅");

  // Step 4: Rewards
  process.stdout.write("⏳ [4/6] Fees и Bribes... ");
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
  console.log("✅");

  // Step 5: Prices — GeckoTerminal + on-chain
  process.stdout.write("⏳ [5/6] Цены (GeckoTerminal)... ");
  const allToks=[...new Set(amtM.map(m=>m.tok.toLowerCase()))];
  const geckoPrices=await fetchGeckoPrices(allToks);
  const knownPrices={...STABLE,...geckoPrices};
  console.log(`✅ ${Object.keys(geckoPrices).length} цен`);

  process.stdout.write("⏳       On-chain цены (slot0/reserves)... ");
  const missingToks=allToks.filter(t=>!knownPrices[t]);
  const PRICES=await fetchOnChainPrices(missingToks,active,tinfo,knownPrices);
  const onChainCount=Object.keys(PRICES).length-Object.keys(knownPrices).length;
  console.log(`✅ +${onChainCount} доп. цен (итого ${Object.keys(PRICES).length})`);

  // Step 6: Calculate
  process.stdout.write("⏳ [6/6] Расчёт... ");
  for(let i=0;i<amts.length;i++){
    const raw=amts[i];if(!raw||raw===0n)continue;
    const{pidx,tok,type}=amtM[i];const p=active[pidx];
    const inf=tinfo[tok.toLowerCase()]||{symbol:"?",decimals:18};
    const amt=Number(ethers.formatUnits(raw,inf.decimals));
    const usd=amt*(PRICES[tok.toLowerCase()]||0);
    const entry={symbol:inf.symbol,amt,usd};
    if(type==="fees"){p.feeTokens.push(entry);p.feesUsd+=usd;}
    else{p.bribeTokens.push(entry);p.bribeUsd+=usd;}
    p.totalUsd+=usd;
  }
  for(const p of active){
    p.roi=p.voteWeight>0?p.totalUsd/p.voteWeight:0;
    p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));
    p.veApy=p.roi*52*100;
  }
  console.log("✅\n");

  // Tables
  const H=[pad("#",4),pad("Пул",22),lpad("Голоса%",8),lpad("Votes",11),lpad("Fees$",9),lpad("Bribes$",9),lpad("Total$",9),lpad("veAPY",8),lpad("Мои$",8)].join("  ");
  function printTable(title,rows){
    console.log("\n"+"═".repeat(H.length+2));
    console.log("  "+title);
    console.log("═".repeat(H.length+2));
    console.log("  "+H);
    console.log("  "+"─".repeat(H.length));
    rows.forEach((p,i)=>console.log("  "+[String(i+1).padStart(3)+".",pad(p.symbol,22),lpad(fP(p.votePct),8),lpad(Math.round(p.voteWeight).toLocaleString(),11),lpad(fU(p.feesUsd),9),lpad(fU(p.bribeUsd),9),lpad(fU(p.totalUsd),9),lpad(p.veApy.toFixed(1)+"%",8),lpad(fU(p.myUsd),8)].join("  ")));
  }

  const byVotes=[...active];
  const byMyUsd=[...active].sort((a,b)=>b.myUsd-a.myUsd);
  const byBribes=[...active].sort((a,b)=>b.bribeUsd-a.bribeUsd);
  const byFees=[...active].sort((a,b)=>b.feesUsd-a.feesUsd);
  const byTotal=[...active].sort((a,b)=>b.totalUsd-a.totalUsd);
  const byVeApy=[...active].filter(p=>p.totalUsd>50&&p.votePct>0.01).sort((a,b)=>b.veApy-a.veApy);

  printTable("🏆 ТОП-20 ПО ГОЛОСАМ",byVotes.slice(0,20));
  printTable("💰 ТОП-20 ПО INCENTIVES (BRIBES)",byBribes.slice(0,20));
  printTable("💸 ТОП-20 ПО FEES",byFees.slice(0,20));
  printTable("📊 ТОП-20 ПО TOTAL REWARDS",byTotal.slice(0,20));
  printTable("📈 ТОП-20 ПО veAPY",byVeApy.slice(0,20));
  printTable(`🎯 ТОП-20 — МОИ REWARDS (${MY_VEAERO} veAERO)`,byMyUsd.slice(0,20));

  const best=byMyUsd.find(p=>p.totalUsd>200&&p.votePct>0.01)||byMyUsd[0];
  console.log("\n╔"+"═".repeat(70)+"╗");
  console.log("║  🚀 ЛУЧШИЙ ПУЛ ДЛЯ ГОЛОСОВАНИЯ (максимум твоих наград)          ║");
  console.log("╚"+"═".repeat(70)+"╝");
  console.log(`\n  Пул:         ${best.symbol}`);
  console.log(`  Pool:        ${best.pool}`);
  console.log(`  Gauge:       ${best.gauge}`);
  console.log(`  Голоса:      ${fP(best.votePct)} (${Math.round(best.voteWeight).toLocaleString()} veAERO)`);
  console.log(`  Fees:        ${fU(best.feesUsd)}`);
  console.log(`  Incentives:  ${fU(best.bribeUsd)}`);
  console.log(`  Total:       ${fU(best.totalUsd)}`);
  console.log(`  veAPY:       ${best.veApy.toFixed(2)}%`);
  console.log(`  Мои rewards: ${fU(best.myUsd)} (с ${MY_VEAERO} veAERO)`);
  if(best.feeTokens.length){console.log(`\n  Fees tokens:`);for(const t of best.feeTokens)console.log(`    • ${t.symbol.padEnd(12)} ${t.amt.toFixed(4).padStart(16)} ≈ ${fU(t.usd)}`);}
  if(best.bribeTokens.length){console.log(`\n  Bribe tokens:`);for(const t of best.bribeTokens)console.log(`    • ${t.symbol.padEnd(12)} ${t.amt.toFixed(4).padStart(16)} ≈ ${fU(t.usd)}`);}
  console.log();
}

main().catch(e=>{console.error("\n❌",e.message);process.exit(1);});
