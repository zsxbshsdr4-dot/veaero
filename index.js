import { ethers } from "ethers";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const RPC        = process.env.RPC_URL || "https://mainnet.base.org";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "25262");

const provider = new ethers.JsonRpcProvider(RPC);

const VI = new ethers.Interface([
  "function length() view returns (uint256)",
  "function pools(uint256) view returns (address)",
  "function gauges(address) view returns (address)",
  "function weights(address) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function gaugeToFees(address) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
]);
const PI = new ethers.Interface([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const EI = new ethers.Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const RI = new ethers.Interface([
  "function rewardsListLength() view returns (uint256)",
  "function rewards(uint256) view returns (address)",
  "function tokenRewardsPerEpoch(address,uint256) view returns (uint256)",
]);
const MC3_ABI = [{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const mc3 = new ethers.Contract(MC3_ADDR, MC3_ABI, provider);

function chunks(arr, n) {
  const o = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
}

async function mcall(calls) {
  const res = [];
  for (const batch of chunks(calls, 100)) {
    try {
      const raw = await mc3.aggregate3(batch.map(c => ({
        target: c.target, allowFailure: true,
        callData: c.iface.encodeFunctionData(c.fn, c.args || [])
      })));
      for (let i = 0; i < raw.length; i++) {
        if (!raw[i].success || raw[i].returnData === "0x") { res.push(null); continue; }
        try {
          const d = batch[i].iface.decodeFunctionResult(batch[i].fn, raw[i].returnData);
          res.push(d.length === 1 ? d[0] : d);
        } catch { res.push(null); }
      }
    } catch { batch.forEach(() => res.push(null)); }
  }
  return res;
}

// Цены обновляются автоматически через DeFiLlama
const PRICES_FALLBACK = {
  "0x4200000000000000000000000000000000000006": 2500,
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 1.00,
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": 0.444,
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 94000,
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 2450,
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": 2550,
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 1.00,
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 1.00,
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 1.08,
};

function fU(n) {
  if (!n || n === 0) return "$0";
  if (n >= 1e6) return "$" + (n/1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n/1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}
function fP(n) { return Number(n).toFixed(2) + "%"; }
function pad(s, n) { return String(s).slice(0,n).padEnd(n); }
function lpad(s, n) { return String(s).slice(0,n).padStart(n); }

async function fetchLivePrices(tokens) {
  try {
    const prices = {};
    const BATCH = 30;
    for(let i=0;i<tokens.length;i+=BATCH){
      const batch = tokens.slice(i,i+BATCH).join(",");
      const r = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${batch}`);
      const j = await r.json();
      const tp = j?.data?.attributes?.token_prices || {};
      for(const [addr,price] of Object.entries(tp)){
        if(price) prices[addr.toLowerCase()] = parseFloat(price);
      }
    }
    return prices;
  } catch(e) { console.error("GeckoTerminal prices:", e.message); return {}; }
}

let LIVE_PRICES = {};

async function main() {
  console.log("\n" + "═".repeat(100));
  console.log("  🟦 AERODROME veAERO VOTING SCANNER — FULL DATA");
  console.log("═".repeat(100) + "\n");

  const voter  = new ethers.Contract(VOTER_ADDR, VI, provider);
  const total  = Number(await voter.length());
  const totalW = await voter.totalWeight();
  const WEEK   = 604800;
  const now    = Math.floor(Date.now() / 1000);
  const epoch  = Math.floor(now / WEEK) * WEEK;
  const pEpoch = epoch - WEEK;
  const totalVeAero = Number(ethers.formatEther(totalW));

  console.log(`📦 Всего пулов: ${total}`);
  console.log(`💪 Total veAERO weight: ${totalVeAero.toLocaleString()}`);
  console.log(`👤 Мои veAERO: ${MY_VEAERO.toLocaleString()}`);
  console.log(`📅 Эпоха: ${new Date(epoch * 1000).toDateString()}\n`);

  // 1. Пулы
  process.stdout.write("⏳ [1/5] Пулы... ");
  const poolRes = await mcall(Array.from({length: total}, (_, i) => ({
    target: VOTER_ADDR, iface: VI, fn: "pools", args: [i]
  })));
  const pools = poolRes.filter(Boolean);
  console.log(`✅ ${pools.length}`);

  // 2. Gauge + weight
  process.stdout.write("⏳ [2/5] Gauges и веса... ");
  const m1 = await mcall(pools.flatMap(p => [
    {target: VOTER_ADDR, iface: VI, fn: "gauges",  args: [p]},
    {target: VOTER_ADDR, iface: VI, fn: "weights", args: [p]},
  ]));
  const active = [];
  for (let i = 0; i < pools.length; i++) {
    const gauge  = m1[i*2];
    const weight = m1[i*2+1];
    if (!gauge || gauge === ethers.ZeroAddress || !weight || weight === 0n) continue;
    const voteWeight = Number(ethers.formatEther(weight));
    const votePct    = (voteWeight / totalVeAero) * 100;
    active.push({
      pool: pools[i], gauge, weight, voteWeight, votePct,
      feesUsd: 0, bribeUsd: 0, totalUsd: 0,
      feeTokens: [], bribeTokens: [],
    });
  }
  active.sort((a, b) => b.weight > a.weight ? 1 : -1);
  console.log(`✅ Активных: ${active.length}`);

  // 3. Токены + адреса контрактов наград
  process.stdout.write("⏳ [3/5] Токены и адреса наград... ");
  const m2 = await mcall(active.flatMap(p => [
    {target: p.pool,      iface: PI, fn: "token0"},
    {target: p.pool,      iface: PI, fn: "token1"},
    {target: VOTER_ADDR,  iface: VI, fn: "gaugeToFees",  args: [p.gauge]},
    {target: VOTER_ADDR,  iface: VI, fn: "gaugeToBribe", args: [p.gauge]},
  ]));
  for (let i = 0; i < active.length; i++) {
    active[i].t0        = m2[i*4]   || ethers.ZeroAddress;
    active[i].t1        = m2[i*4+1] || ethers.ZeroAddress;
    active[i].feesAddr  = m2[i*4+2] || ethers.ZeroAddress;
    active[i].bribeAddr = m2[i*4+3] || ethers.ZeroAddress;
  }
  const uniq = [...new Set(active.flatMap(p => [p.t0, p.t1]))].filter(a => a !== ethers.ZeroAddress);
  const syms = await mcall(uniq.map(t => ({target: t, iface: EI, fn: "symbol"})));
  const decs = await mcall(uniq.map(t => ({target: t, iface: EI, fn: "decimals"})));
  const tinfo = {};
  for (let i = 0; i < uniq.length; i++)
    tinfo[uniq[i].toLowerCase()] = {symbol: syms[i] || "?", decimals: Number(decs[i] || 18)};
  for (const p of active)
    p.symbol = `${tinfo[p.t0.toLowerCase()]?.symbol || "?"}/${tinfo[p.t1.toLowerCase()]?.symbol || "?"}`;
  console.log("✅");

  // 4. Fees и Bribes
  process.stdout.write("⏳ [4/5] Fees и Bribes... ");
  const contracts = active.flatMap(p => [
    {addr: p.feesAddr,  pidx: active.indexOf(p), type: "fees"},
    {addr: p.bribeAddr, pidx: active.indexOf(p), type: "bribe"},
  ]).filter(c => c.addr !== ethers.ZeroAddress);

  const lenRes = await mcall(contracts.map(c => ({target: c.addr, iface: RI, fn: "rewardsListLength"})));

  const rwCalls = [], rwMeta = [];
  for (let i = 0; i < contracts.length; i++) {
    const len = Number(lenRes[i] || 0);
    for (let t = 0; t < Math.min(len, 6); t++) {
      rwCalls.push({target: contracts[i].addr, iface: RI, fn: "rewards", args: [t]});
      rwMeta.push(contracts[i]);
    }
  }
  const rwAddrs = await mcall(rwCalls);

  const amtCalls = [], amtMeta = [];
  for (let i = 0; i < rwAddrs.length; i++) {
    const tok = rwAddrs[i];
    if (!tok || tok === ethers.ZeroAddress) continue;
    amtCalls.push({target: rwMeta[i].addr, iface: RI, fn: "tokenRewardsPerEpoch", args: [tok, epoch]});
    amtMeta.push({...rwMeta[i], tok, ep: "current"});
  }
  const amts = await mcall(amtCalls);

  // Символы новых токенов
  const newT = [...new Set(amtMeta.map(m => m.tok.toLowerCase()))].filter(t => !tinfo[t]);
  if (newT.length) {
    const ns = await mcall(newT.map(t => ({target: t, iface: EI, fn: "symbol"})));
    const nd = await mcall(newT.map(t => ({target: t, iface: EI, fn: "decimals"})));
    for (let i = 0; i < newT.length; i++)
      tinfo[newT[i]] = {symbol: ns[i] || "?", decimals: Number(nd[i] || 18)};
  }

  // Агрегируем по пулам
  const best = {}; // pidx -> {tok -> {raw, type}}
  for (let i = 0; i < amts.length; i++) {
    const raw = amts[i];
    if (!raw || raw === 0n) continue;
    const {pidx, tok, type} = amtMeta[i];
    const k = tok.toLowerCase();
    if (!best[pidx]) best[pidx] = {};
    if (!best[pidx][k] || raw > best[pidx][k].raw)
      best[pidx][k] = {raw, type};
  }

  for (const [pidx, tokens] of Object.entries(best)) {
    const p = active[Number(pidx)];
    for (const [tok, {raw, type}] of Object.entries(tokens)) {
      const inf = tinfo[tok] || {symbol: "?", decimals: 18};
      const amt = Number(ethers.formatUnits(raw, inf.decimals));
      const usd = amt * (LIVE_PRICES[tok] || PRICES_FALLBACK[tok] || 0);
      const entry = {symbol: inf.symbol, amt, usd};
      if (type === "fees") {
        p.feeTokens.push(entry);
        p.feesUsd += usd;
      } else {
        p.bribeTokens.push(entry);
        p.bribeUsd += usd;
      }
      p.totalUsd += usd;
    }
  }
  console.log("✅");

  // Загружаем живые цены
  process.stdout.write("⏳ Цены (GeckoTerminal)... ");
  const allToks = [...new Set(amtMeta.map(m => m.tok.toLowerCase()))];
  LIVE_PRICES = await fetchLivePrices(allToks);
  console.log(`✅ ${Object.keys(LIVE_PRICES).length} цен из GeckoTerminal`);

  // On-chain цены через Multicall для токенов без цены
  const USDC_A = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const WETH_A = "0x4200000000000000000000000000000000000006";
  const missing2 = allToks.filter(t => !LIVE_PRICES[t] && t !== USDC_A && t !== WETH_A);
  if (missing2.length > 0) {
    process.stdout.write(`⏳ On-chain цены для ${missing2.length} токенов... `);
    const GI = new ethers.Interface(["function getReserves() view returns (uint112,uint112,uint32)","function token0() view returns (address)"]);
    const poolMap = new Map();
    for(const tok of missing2){
      const pp = active.find(p=>
        (p.t0.toLowerCase()===tok&&(p.t1.toLowerCase()===USDC_A||p.t1.toLowerCase()===WETH_A))||
        (p.t1.toLowerCase()===tok&&(p.t0.toLowerCase()===USDC_A||p.t0.toLowerCase()===WETH_A))
      );
      if(pp) poolMap.set(tok, pp);
    }
    const entries = [...poolMap.entries()];
    const uniquePools = [...new Set(entries.map(e=>e[1].pool))].map(addr=>entries.find(e=>e[1].pool===addr)[1]);
    const [reserves, token0s] = await Promise.all([
      mcall(uniquePools.map(p=>({target:p.pool,iface:GI,fn:"getReserves"}))),
      mcall(uniquePools.map(p=>({target:p.pool,iface:GI,fn:"token0"})))
    ]);
    let cnt2 = 0;
    for(let i=0;i<uniquePools.length;i++){
      try{
        if(!reserves[i]||!token0s[i]) continue;
        const pp = uniquePools[i];
        const [r0,r1] = reserves[i];
        const t0addr = token0s[i].toLowerCase();
        const inf0 = tinfo[pp.t0.toLowerCase()]||{decimals:18};
        const inf1 = tinfo[pp.t1.toLowerCase()]||{decimals:18};
        const res0 = Number(ethers.formatUnits(r0,inf0.decimals));
        const res1 = Number(ethers.formatUnits(r1,inf1.decimals));
        const toks = missing2.filter(t=>t===pp.t0.toLowerCase()||t===pp.t1.toLowerCase());
        for(const tok of toks){
          const isTok0 = t0addr===tok;
          const paired = isTok0?pp.t1.toLowerCase():pp.t0.toLowerCase();
          const pairedP = LIVE_PRICES[paired]||PRICES_FALLBACK[paired]||0;
          if(!pairedP) continue;
          const tokRes = isTok0?res0:res1;
          const pairRes = isTok0?res1:res0;
          if(!tokRes) continue;
          LIVE_PRICES[tok] = (pairRes*pairedP)/tokRes;
          cnt2++;
        }
      }catch(e){}
    }
    console.log(`✅ ${cnt2} доп. цен`);
  }


  // 5. Считаем метрики
  process.stdout.write("⏳ [5/5] Метрики... ");
  for (const p of active) {
    // Текущий ROI
    p.roiPerVeAero = p.voteWeight > 0 ? p.totalUsd / p.voteWeight : 0;

    // Мои rewards если добавлю свои голоса
    const newWeight = p.voteWeight + MY_VEAERO;
    p.myShare  = MY_VEAERO / newWeight;
    p.myUsd    = p.totalUsd * p.myShare;

    // veAPY — годовая доходность на 1 veAERO
    // Эпох в году = 52, цена AERO ~0.95
    p.veApy = p.roiPerVeAero * 52 * 100; // в %
  }
  console.log("✅\n");

  // Сортировки
  const byVotes  = [...active];
  const byBribes = [...active].sort((a,b) => b.bribeUsd - a.bribeUsd);
  const byFees   = [...active].sort((a,b) => b.feesUsd - a.feesUsd);
  const byTotal  = [...active].sort((a,b) => b.totalUsd - a.totalUsd);
  const byMyUsd  = [...active].sort((a,b) => b.myUsd - a.myUsd);
  const byVeApy  = [...active].filter(p => p.totalUsd > 100 && p.votePct > 0.05).sort((a,b) => b.veApy - a.veApy);

  // ── ВЫВОД ──────────────────────────────────────────────────────────────────
  const H = ["#".padEnd(4), pad("Пул",20), lpad("Голоса%",8), lpad("Votes",12), lpad("Fees$",9), lpad("Bribes$",9), lpad("Total$",9), lpad("veAPY",7), lpad(`Мои$`,8)].join(" ");

  function printFull(title, rows) {
    console.log(`\n${"═".repeat(H.length+2)}\n  ${title}\n${"═".repeat(H.length+2)}`);
    console.log("  " + H);
    console.log("  " + "─".repeat(H.length));
    rows.forEach((p, i) => {
      const line = [
        String(i+1).padStart(3)+".",
        pad(p.symbol, 20),
        lpad(fP(p.votePct), 8),
        lpad(p.voteWeight.toFixed(0), 12),
        lpad(fU(p.feesUsd), 9),
        lpad(fU(p.bribeUsd), 9),
        lpad(fU(p.totalUsd), 9),
        lpad(p.veApy.toFixed(1)+"%", 7),
        lpad(fU(p.myUsd), 8),
      ].join(" ");
      console.log("  " + line);
    });
  }

  printFull("🏆 ТОП-20 ПО ГОЛОСАМ",           byVotes.slice(0,20));
  printFull("💰 ТОП-20 ПО INCENTIVES (BRIBES)", byBribes.slice(0,20));
  printFull("💸 ТОП-20 ПО FEES",               byFees.slice(0,20));
  printFull("📊 ТОП-20 ПО TOTAL REWARDS",      byTotal.slice(0,20));
  printFull("📈 ТОП-20 ПО veAPY",              byVeApy.slice(0,20));
  printFull(`🎯 ТОП-20 — МОИ REWARDS (${MY_VEAERO} veAERO)`, byMyUsd.slice(0,20));

  // Рекомендация
  const best_pool = byMyUsd.find(p => p.totalUsd > 500 && p.votePct > 0.1) || byMyUsd[0];
  console.log("\n" + "╔" + "═".repeat(70) + "╗");
  console.log("║  🚀 ЛУЧШИЙ ПУЛ ДЛЯ ГОЛОСОВАНИЯ (максимум твоих наград)          ║");
  console.log("╚" + "═".repeat(70) + "╝");
  console.log(`\n  Пул:         ${best_pool.symbol}`);
  console.log(`  Pool:        ${best_pool.pool}`);
  console.log(`  Gauge:       ${best_pool.gauge}`);
  console.log(`  Голоса:      ${fP(best_pool.votePct)} (${best_pool.voteWeight.toFixed(0)} veAERO)`);
  console.log(`  Fees:        ${fU(best_pool.feesUsd)}`);
  console.log(`  Incentives:  ${fU(best_pool.bribeUsd)}`);
  console.log(`  Total:       ${fU(best_pool.totalUsd)}`);
  console.log(`  veAPY:       ${best_pool.veApy.toFixed(2)}%`);
  console.log(`  Мои rewards: ${fU(best_pool.myUsd)} (с ${MY_VEAERO} veAERO)`);
  if (best_pool.feeTokens.length) {
    console.log(`\n  Fees tokens:`);
    for (const t of best_pool.feeTokens)
      console.log(`    • ${t.symbol.padEnd(12)} ${t.amt.toFixed(4).padStart(16)} ≈ ${fU(t.usd)}`);
  }
  if (best_pool.bribeTokens.length) {
    console.log(`\n  Bribe tokens:`);
    for (const t of best_pool.bribeTokens)
      console.log(`    • ${t.symbol.padEnd(12)} ${t.amt.toFixed(4).padStart(16)} ≈ ${fU(t.usd)}`);
  }
  console.log();
}

main().catch(e => {
  console.error("\n❌", e.message);
  process.exit(1);
});

export async function fetchData() {
  const WEEK = 604800;
  const now = Math.floor(Date.now()/1000);
  const epoch = Math.floor(now/WEEK)*WEEK;
  const voter = new ethers.Contract(VOTER_ADDR, VI, provider);
  const total = Number(await voter.length());
  const totalW = await voter.totalWeight();
  const totalVeAero = Number(ethers.formatEther(totalW));
  const poolRes = await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools = poolRes.filter(Boolean);
  const m1 = await mcall(pools.flatMap(p=>[{target:VOTER_ADDR,iface:VI,fn:"gauges",args:[p]},{target:VOTER_ADDR,iface:VI,fn:"weights",args:[p]}]));
  const active = [];
  for(let i=0;i<pools.length;i++){const gauge=m1[i*2],weight=m1[i*2+1];if(!gauge||gauge===ethers.ZeroAddress||!weight||weight===0n)continue;const voteWeight=Number(ethers.formatEther(weight));active.push({pool:pools[i],gauge,voteWeight,votePct:(voteWeight/totalVeAero)*100,feesUsd:0,bribeUsd:0,totalUsd:0,feeTokens:[],bribeTokens:[]});}
  active.sort((a,b)=>b.voteWeight-a.voteWeight);
  const m2=await mcall(active.flatMap(p=>[{target:p.pool,iface:PI,fn:"token0"},{target:p.pool,iface:PI,fn:"token1"},{target:VOTER_ADDR,iface:VI,fn:"gaugeToFees",args:[p.gauge]},{target:VOTER_ADDR,iface:VI,fn:"gaugeToBribe",args:[p.gauge]}]));
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
  let LP={};
  try{for(let i=0;i<allToks.length;i+=30){const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${allToks.slice(i,i+30).join(",")}`);const j=await r.json();for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))if(p)LP[a.toLowerCase()]=parseFloat(p);}}catch(e){}
  for(let i=0;i<amts.length;i++){const raw=amts[i];if(!raw||raw===0n)continue;const{pidx,tok,type}=amtM[i];const p=active[pidx];const inf=tinfo[tok.toLowerCase()]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(raw,inf.decimals));const usd=amt*(LP[tok.toLowerCase()]||PRICES_FALLBACK[tok.toLowerCase()]||0);const entry={symbol:inf.symbol,amt,usd};if(type==="fees"){p.feeTokens.push(entry);p.feesUsd+=usd;}else{p.bribeTokens.push(entry);p.bribeUsd+=usd;}p.totalUsd+=usd;}
  for(const p of active){p.roi=p.voteWeight>0?p.totalUsd/p.voteWeight:0;p.myUsd=p.totalUsd*(MY_VEAERO/(p.voteWeight+MY_VEAERO));p.veApy=p.roi*52*100;}
  const best=[...active].filter(p=>p.totalUsd>500&&p.votePct>0.1).sort((a,b)=>b.myUsd-a.myUsd)[0]||active[0];
  return {pools:active,best,meta:{totalPools:total,activePools:active.length,myVeAero:MY_VEAERO,epochDate:new Date(epoch*1000).toDateString(),updatedAt:Date.now()}};
}
