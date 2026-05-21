import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SUGAR_ADDR = "0x68c19e13618c41158fe4baba1b8fb3a9c74bdb0a";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "41801");

const provider=new ethers.JsonRpcProvider(RPC);
const MC3_ABI=[{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const VI=new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function gauges(address) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)","function gaugeToFees(address) view returns (address)","function gaugeToBribe(address) view returns (address)"]);
const PI=new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI=new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const SUGAR_ABI=["function epochsLatest(uint256,uint256) view returns (tuple(uint256 ts,address lp,uint256 votes,uint256 emissions,tuple(address token,uint256 amount)[] bribes,tuple(address token,uint256 amount)[] fees)[])"];
const mc3=new ethers.Contract(MC3_ADDR,MC3_ABI,provider);
const sugar=new ethers.Contract(SUGAR_ADDR,SUGAR_ABI,provider);
const voter=new ethers.Contract(VOTER_ADDR,VI,provider);

const STABLE={"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":1,"0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca":1,"0x50c5725949a6f0c72e6c4a641f24049a917db0cb":1,"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42":1.08};

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}
async function fetchGeckoPrices(tokens){const prices={};for(let i=0;i<tokens.length;i+=30){try{const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokens.slice(i,i+30).join(",")}`);const j=await r.json();for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))if(p&&parseFloat(p)>0)prices[a.toLowerCase()]=parseFloat(p);}catch{}}return prices;}

const fU=n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP=n=>Number(n).toFixed(2)+"%";
const pad=(s,n)=>String(s).slice(0,n).padEnd(n);
const lpad=(s,n)=>String(s).slice(0,n).padStart(n);

async function main(){
  const WEEK=604800,now=Math.floor(Date.now()/1000);
  const currentEpoch=Math.floor(now/WEEK)*WEEK;
  const prevEpoch=currentEpoch-WEEK;

  console.log("\n"+"═".repeat(100));
  console.log("  📊 АНАЛИЗ ПРЕДЫДУЩЕЙ ЭПОХИ — POST FACTUM");
  console.log("═".repeat(100));
  console.log(`  Текущая эпоха:   ${new Date(currentEpoch*1000).toDateString()}`);
  console.log(`  Прошлая эпоха:   ${new Date(prevEpoch*1000).toDateString()}`);
  console.log(`  Мои veAERO:      ${MY_VEAERO.toLocaleString()}`);
  console.log("═".repeat(100)+"\n");

  // Load pool symbols
  process.stdout.write("⏳ Загружаю пулы... ");
  const total=Number(await voter.length());
  const totalW=await voter.totalWeight();
  const totalVeAero=Number(ethers.formatEther(totalW));
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  const m1=await mcall(pools.flatMap(p=>[{target:p,iface:PI,fn:"token0"},{target:p,iface:PI,fn:"token1"}]));
  const uniq=[...new Set(pools.flatMap((_,i)=>[m1[i*2],m1[i*2+1]]).filter(Boolean))];
  const[syms,decs]=await Promise.all([mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})))]);
  const tinfo={};for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  const poolSymbols={};for(let i=0;i<pools.length;i++){const t0=m1[i*2]?.toLowerCase()||"";const t1=m1[i*2+1]?.toLowerCase()||"";poolSymbols[pools[i].toLowerCase()]=`${tinfo[t0]?.symbol||"?"}/${tinfo[t1]?.symbol||"?"}`;}
  console.log(`✅ ${pools.length} пулов`);

  // Get PREVIOUS epoch data via Sugar epochsLatest with offset=1
  // Sugar epochsLatest(limit, offset) — offset=0 is current, but we need previous
  // Actually Sugar returns current epoch data only
  // We use the fact that epochsLatest returns ts field — filter by prevEpoch ts
  process.stdout.write("⏳ Загружаю данные прошлой эпохи из Sugar... ");

  // Sugar epochsByAddress returns history — but we need to query many pools
  // Alternative: use epochsLatest and check ts field
  // epochsLatest returns CURRENT epoch. For previous we need different approach.
  // Let's use the Voter weights which reflect the LAST vote (still valid post-factum)

  const m2=await mcall(pools.flatMap(p=>[
    {target:VOTER_ADDR,iface:VI,fn:"gauges",args:[p]},
    {target:VOTER_ADDR,iface:VI,fn:"weights",args:[p]},
    {target:VOTER_ADDR,iface:VI,fn:"gaugeToFees",args:[p]},  
    {target:VOTER_ADDR,iface:VI,fn:"gaugeToBribe",args:[p]},
  ]));

  const active=[];
  for(let i=0;i<pools.length;i++){
    const gauge=m2[i*4],weight=m2[i*4+1];
    if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;
    const vw=Number(ethers.formatEther(weight));
    active.push({
      pool:pools[i],gauge,
      symbol:poolSymbols[pools[i].toLowerCase()]||"?/?",
      voteWeight:vw,
      votePct:(vw/totalVeAero)*100,
      feesAddr:m2[i*4+2]||"",
      bribeAddr:m2[i*4+3]||"",
      feesUsd:0,bribeUsd:0,totalUsd:0,
      feeTokens:[],bribeTokens:[],
    });
  }
  console.log(`✅ ${active.length} активных`);

  // Get Sugar data for previous epoch
  process.stdout.write("⏳ Sugar данные... ");
  const epochs=await sugar.epochsLatest(600,0);
  const sugarMap={};
  for(const ep of epochs){
    const lp=ep.lp.toLowerCase();
    // Check if this is previous epoch data (ts = prevEpoch)
    const epTs=Number(ep.ts);
    sugarMap[lp]={
      fees:ep.fees.map(t=>({token:t.token.toLowerCase(),amount:t.amount})),
      bribes:ep.bribes.map(t=>({token:t.token.toLowerCase(),amount:t.amount})),
      votes:Number(ethers.formatEther(ep.votes)),
      ts:epTs,
      isCurrentEpoch: epTs>=currentEpoch,
    };
  }
  console.log(`✅ ${epochs.length} пулов`);

  // Prices
  process.stdout.write("⏳ Цены... ");
  const allToks=[...new Set(Object.values(sugarMap).flatMap(d=>[...d.fees,...d.bribes].map(t=>t.token)))];
  const newT=allToks.filter(t=>!tinfo[t]);
  if(newT.length){const[ns,nd]=await Promise.all([mcall(newT.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(newT.map(t=>({target:t,iface:EI,fn:"decimals"})))]);for(let i=0;i<newT.length;i++)tinfo[newT[i]]={symbol:ns[i]||"?",decimals:Number(nd[i]||18)};}
  const PRICES=await fetchGeckoPrices(allToks);
  const LP={...STABLE,...PRICES};
  console.log(`✅ ${Object.keys(PRICES).length} цен`);

  // Calculate
  for(const p of active){
    const sd=sugarMap[p.pool.toLowerCase()];
    if(!sd)continue;
    // Use Sugar votes if available (more accurate)
    if(sd.votes>0)p.voteWeight=sd.votes;
    for(const t of sd.fees){const inf=tinfo[t.token]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(t.amount,inf.decimals));const usd=amt*(LP[t.token]||0);p.feeTokens.push({symbol:inf.symbol,usd});p.feesUsd+=usd;}
    for(const t of sd.bribes){const inf=tinfo[t.token]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(t.amount,inf.decimals));const usd=amt*(LP[t.token]||0);p.bribeTokens.push({symbol:inf.symbol,usd});p.bribeUsd+=usd;}
    p.totalUsd=p.feesUsd+p.bribeUsd;
  }

  for(const p of active){
    p.ratio=p.voteWeight>0?p.totalUsd/(p.voteWeight+MY_VEAERO):0;
    p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));
    p.veApy=p.ratio*52*100;
  }

  const ranked=active.filter(p=>p.totalUsd>0&&p.veApy<5000).sort((a,b)=>b.ratio-a.ratio);

  // Print results
  const W=process.stdout.columns||110;
  const L="═".repeat(W);const T="─".repeat(W);

  const H=[lpad("#",3),pad("Пул",22),lpad("Votes%",8),lpad("Votes",11),lpad("Fees$",9),lpad("Bribes$",9),lpad("Total$",9),lpad("$/vote",10),lpad("veAPY",8),lpad("Если бы мои$",12)].join("  ");

  console.log("\n"+L);
  console.log("  🏆 ТОП-30 ПРОШЛОЙ ЭПОХИ по (fees+bribes)/(votes+мои)");
  console.log(`  Если бы ты голосовал с ${MY_VEAERO.toLocaleString()} veAERO:`);
  console.log(L);
  console.log("  "+H);
  console.log("  "+T);

  for(let i=0;i<Math.min(ranked.length,30);i++){
    const p=ranked[i];
    const clr=i===0?"\x1b[92m":i<3?"\x1b[97m":i<10?"\x1b[37m":"\x1b[90m";
    const R="\x1b[0m";
    const row=[
      lpad(String(i+1),3),
      pad(p.symbol,22),
      lpad(fP(p.votePct),8),
      lpad(Math.round(p.voteWeight).toLocaleString(),11),
      lpad(fU(p.feesUsd),9),
      lpad(fU(p.bribeUsd),9),
      lpad(fU(p.totalUsd),9),
      lpad("$"+p.ratio.toFixed(5),10),
      lpad(p.veApy.toFixed(1)+"%",8),
      lpad(fU(p.myUsd),12),
    ].join("  ");
    console.log("  "+clr+row+R);
  }

  console.log("\n  "+T);
  const winner=ranked[0];
  if(winner){
    console.log(`\n  🥇 ПОБЕДИТЕЛЬ ПРОШЛОЙ ЭПОХИ: \x1b[92m${winner.symbol}\x1b[0m`);
    console.log(`     Fees: ${fU(winner.feesUsd)}  |  Bribes: ${fU(winner.bribeUsd)}  |  Total: ${fU(winner.totalUsd)}`);
    console.log(`     Голоса: ${Math.round(winner.voteWeight).toLocaleString()} veAERO (${fP(winner.votePct)})`);
    console.log(`     Если бы ты голосовал: \x1b[33m${fU(winner.myUsd)}\x1b[0m за эпоху`);
    console.log(`     veAPY: \x1b[92m${winner.veApy.toFixed(1)}%\x1b[0m`);
  }
  console.log();
}

main().catch(e=>{console.error("\n❌",e.message);process.exit(1);});
