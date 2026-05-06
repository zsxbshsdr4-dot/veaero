import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SUGAR_ADDR = "0x68c19e13618c41158fe4baba1b8fb3a9c74bdb0a";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "25262");

// ── Config ──────────────────────────────────────────────────────────
const CFG = {
  INIT_BEFORE_END:   30 * 60,   // Start monitoring 30 min before epoch end
  FINAL_TRIGGER:      3 * 60,   // Final vote recommendation at T-3 min
  POLL_INTERVAL:     20 * 1000, // Poll every 20 seconds
  TOP_POOLS:         10,        // Track top N pools
  MIN_INCENTIVES:    500,       // Min $500 incentives to consider
  MIN_VOTE_PCT:      0.05,      // Min 0.05% votes (not dead pool)
  FAST_GROWTH_THRESHOLD: 0.15,  // 15% vote growth = whales/bots, skip
};

const FALLBACK = {
  "0x4200000000000000000000000000000000000006": 2500,
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 1,
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": 0.444,
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 94000,
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 2450,
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": 2550,
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 1,
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 1,
};

const provider = new ethers.JsonRpcProvider(RPC);
const MC3_ABI = [{"name":"aggregate3","inputs":[{"name":"calls","type":"tuple[]","components":[{"name":"target","type":"address"},{"name":"allowFailure","type":"bool"},{"name":"callData","type":"bytes"}]}],"outputs":[{"name":"returnData","type":"tuple[]","components":[{"name":"success","type":"bool"},{"name":"returnData","type":"bytes"}]}],"stateMutability":"view","type":"function"}];
const VI = new ethers.Interface([
  "function length() view returns (uint256)",
  "function pools(uint256) view returns (address)",
  "function gauges(address) view returns (address)",
  "function weights(address) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
]);
const PI = new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI = new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const RI = new ethers.Interface([
  "function rewardsListLength() view returns (uint256)",
  "function rewards(uint256) view returns (address)",
  "function tokenRewardsPerEpoch(address,uint256) view returns (uint256)",
]);
const SUGAR_ABI = ["function epochsLatest(uint256,uint256) view returns (tuple(uint256 ts,address lp,uint256 votes,uint256 emissions,tuple(address token,uint256 amount)[] bribes,tuple(address token,uint256 amount)[] fees)[])"];

const mc3   = new ethers.Contract(MC3_ADDR, MC3_ABI, provider);
const sugar = new ethers.Contract(SUGAR_ADDR, SUGAR_ABI, provider);
const voter = new ethers.Contract(VOTER_ADDR, VI, provider);

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}

async function mcall(calls) {
  const res = [];
  for(const batch of chunks(calls, 100)) {
    try {
      const raw = await mc3.aggregate3(batch.map(c=>({
        target:c.target, allowFailure:true,
        callData:c.iface.encodeFunctionData(c.fn,c.args||[])
      })));
      for(let i=0;i<raw.length;i++){
        if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}
        try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}
        catch{res.push(null);}
      }
    } catch { batch.forEach(()=>res.push(null)); }
  }
  return res;
}

async function fetchPrices(tokens) {
  const prices = {};
  for(let i=0;i<tokens.length;i+=30){
    try{
      const r = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokens.slice(i,i+30).join(",")}`);
      const j = await r.json();
      for(const [a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))
        if(p) prices[a.toLowerCase()] = parseFloat(p);
    } catch {}
  }
  return prices;
}


const BOT_TOKEN = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const CHAT_ID   = process.env.CHAT_ID   || "478227003";

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({chat_id: CHAT_ID, text, parse_mode: "HTML"})
    });
  } catch(e) { console.error("Telegram error:", e.message); }
}

const fU = n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP = n=>Number(n).toFixed(2)+"%";
const pad = (s,n)=>String(s).slice(0,n).padEnd(n);
const lpad = (s,n)=>String(s).slice(0,n).padStart(n);
const fTime = s=>{const m=Math.floor(s/60),sec=s%60;return`${m}m ${sec}s`;};

// ── Fetch current pool state ────────────────────────────────────────
async function fetchPoolState(tinfo, PRICES, epoch) {
  let epochs;
  try { epochs = await sugar.epochsLatest(500, 0); }
  catch(e) { throw new Error("Sugar failed: "+e.message); }

  const totalW = await voter.totalWeight();
  const totalVeAero = Number(ethers.formatEther(totalW));

  const state = {};
  for(const ep of epochs) {
    const lp = ep.lp.toLowerCase();
    const votes = Number(ethers.formatEther(ep.votes));
    const votePct = (votes/totalVeAero)*100;

    let bribeUsd = 0;
    const bribeTokens = [];
    for(const t of ep.bribes) {
      const tok = t.token.toLowerCase();
      const inf = tinfo[tok]||{symbol:"?",decimals:18};
      const amt = Number(ethers.formatUnits(t.amount, inf.decimals));
      const usd = amt*(PRICES[tok]||FALLBACK[tok]||0);
      bribeTokens.push({symbol:inf.symbol,amt,usd});
      bribeUsd += usd;
    }

    let feesUsd = 0;
    const feeTokens = [];
    for(const t of ep.fees) {
      const tok = t.token.toLowerCase();
      const inf = tinfo[tok]||{symbol:"?",decimals:18};
      const amt = Number(ethers.formatUnits(t.amount, inf.decimals));
      const usd = amt*(PRICES[tok]||FALLBACK[tok]||0);
      feeTokens.push({symbol:inf.symbol,amt,usd});
      feesUsd += usd;
    }

    state[lp] = {
      lp: ep.lp,
      votes,
      votePct,
      bribeUsd,
      feesUsd,
      totalUsd: bribeUsd + feesUsd,
      bribeTokens,
      feeTokens,
      ts: Number(ep.ts),
    };
  }
  return {state, totalVeAero};
}

// ── Load token info (one time) ──────────────────────────────────────
async function loadTokenInfo() {
  console.log("⏳ Загружаю список пулов и токенов...");
  const total = Number(await voter.length());
  const poolRes = await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools = poolRes.filter(Boolean);
  const m1 = await mcall(pools.flatMap(p=>[
    {target:p,iface:PI,fn:"token0"},
    {target:p,iface:PI,fn:"token1"},
  ]));
  const uniq = [...new Set(pools.flatMap((_,i)=>[m1[i*2],m1[i*2+1]]).filter(Boolean))];
  const [syms,decs] = await Promise.all([
    mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),
    mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"}))),
  ]);
  const tinfo = {};
  for(let i=0;i<uniq.length;i++) tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};

  // Pool symbols
  const poolSymbols = {};
  for(let i=0;i<pools.length;i++){
    const t0 = m1[i*2]?.toLowerCase()||"";
    const t1 = m1[i*2+1]?.toLowerCase()||"";
    poolSymbols[pools[i].toLowerCase()] = `${tinfo[t0]?.symbol||"?"}/${tinfo[t1]?.symbol||"?"}`;
  }

  console.log(`✅ ${pools.length} пулов, ${Object.keys(tinfo).length} токенов\n`);
  return {tinfo, poolSymbols, pools};
}

// ── Render monitoring table ─────────────────────────────────────────
function renderTable(trackedPools, poolSymbols, cycle, timeLeft) {
  console.clear();
  const bar = "═".repeat(100);
  console.log("\n"+bar);
  console.log("  🎯 LATE-INCENTIVE MONITOR — Aerodrome veAERO");
  console.log(bar);
  console.log(`  ⏱  До конца эпохи: ${fTime(timeLeft)}  |  Цикл: #${cycle}  |  Обновлено: ${new Date().toLocaleTimeString()}`);
  console.log(bar+"\n");

  if(!trackedPools.length) {
    console.log("  ⚠️  Нет пулов для отслеживания\n");
    return;
  }

  const H = [pad("#",3), pad("Пул",24), lpad("Incentives",12), lpad("Δ Incentive",12),
             lpad("Votes%",8), lpad("Δ Votes%",9), lpad("Score",9), lpad("Статус",18)].join("  ");
  console.log("  "+H);
  console.log("  "+"─".repeat(H.length));

  for(let i=0;i<trackedPools.length;i++){
    const p = trackedPools[i];
    const sym = poolSymbols[p.lp.toLowerCase()]||p.lp.slice(0,10)+"…";
    const delta = p.currentIncentives - p.baseIncentives;
    const votesDelta = p.currentVotes - p.baseVotes;
    const votesDeltaPct = p.baseVotes>0 ? (votesDelta/p.baseVotes)*100 : 0;
    const score = p.currentVotes>0 ? delta/p.currentVotes : 0;

    let status = "👁  Слежу";
    if(delta > 0) status = "🔥 Новый incentive!";
    else if(votesDelta > 0 && delta === 0) status = "⚡ Скрытый signal";
    if(p.excluded) status = "❌ Исключён (киты)";

    const line = [
      String(i+1).padStart(3),
      pad(sym,24),
      lpad(fU(p.currentIncentives),12),
      lpad(delta>0?"+" + fU(delta):delta<0?"-"+fU(Math.abs(delta)):"—",12),
      lpad(fP(p.currentVotePct),8),
      lpad((votesDeltaPct>=0?"+":"")+votesDeltaPct.toFixed(2)+"%",9),
      lpad(score>0?score.toFixed(6):"—",9),
      status,
    ].join("  ");
    console.log("  "+line);
  }
  console.log();
}

// ── Render final recommendation ─────────────────────────────────────
function renderFinal(target, poolSymbols) {
  const bar = "═".repeat(80);
  console.log("\n"+bar);
  console.log("  🚀 ФИНАЛЬНАЯ РЕКОМЕНДАЦИЯ (T−3 мин)");
  console.log(bar);

  if(!target) {
    console.log("\n  ⛔ НЕ ГОЛОСОВАТЬ — условия не выполнены:");
    console.log("     • Нет новых incentives ИЛИ все пулы перегреты\n");
    return;
  }

  const sym = poolSymbols[target.lp.toLowerCase()]||target.lp;
  const delta = target.currentIncentives - target.baseIncentives;
  const myUsd = target.currentIncentives * (MY_VEAERO/(target.currentVotes+MY_VEAERO));

  console.log(`\n  Пул:         ${sym}`);
  console.log(`  Address:     ${target.lp}`);
  console.log(`  Incentives:  ${fU(target.currentIncentives)}`);
  console.log(`  Δ Incentive: +${fU(delta)}`);
  console.log(`  Votes:       ${fP(target.currentVotePct)}`);
  console.log(`  Score:       ${(delta/target.currentVotes).toFixed(6)}`);
  console.log(`  Мои rewards: ~${fU(myUsd)} (с ${MY_VEAERO} veAERO)`);
  console.log(`\n  ✅ ГОЛОСУЙ СЕЙЧАС: aerodrome.finance/vote`);
  console.log(bar+"\n");

  // Send to Telegram
  const msg = target
    ? `🚀 <b>ГОЛОСУЙ СЕЙЧАС!</b>\n\n` +
      `Пул: <b>${poolSymbols[target.lp.toLowerCase()]||target.lp}</b>\n` +
      `Incentives: ${fU(target.currentIncentives)}\n` +
      `Δ: +${fU(target.currentIncentives - target.baseIncentives)}\n` +
      `Votes: ${fP(target.currentVotePct)}\n` +
      `Мои rewards: ~${fU(target.currentIncentives*(MY_VEAERO/(target.currentVotes+MY_VEAERO)))}\n\n` +
      `⏱ До конца эпохи: 3 мин\n` +
      `🔗 aerodrome.finance/vote`
    : `⛔ <b>НЕ ГОЛОСОВАТЬ</b>\nУсловия не выполнены — нет новых incentives или все пулы перегреты.`;
  await sendTelegram(msg);
}

// ── Main monitoring loop ────────────────────────────────────────────
async function main() {
  const WEEK = 604800;
  const now = Math.floor(Date.now()/1000);
  const epoch = Math.floor(now/WEEK)*WEEK;
  const epochEnd = epoch + WEEK;
  const timeLeft = epochEnd - now;

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  🎯 LATE-INCENTIVE MONITOR v1.0");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Эпоха: ${new Date(epoch*1000).toDateString()}`);
  console.log(`  До конца: ${fTime(timeLeft)}`);
  console.log(`  Начинаю мониторинг за ${fTime(CFG.INIT_BEFORE_END)} до конца\n`);

  // Load token info once
  const {tinfo, poolSymbols} = await loadTokenInfo();

  // Wait until monitoring window opens
  const monitorStart = epochEnd - CFG.INIT_BEFORE_END;
  const waitSecs = monitorStart - Math.floor(Date.now()/1000);
  if(waitSecs > 0) {
    console.log(`⏳ Жду начала окна мониторинга (через ${fTime(waitSecs)})...`);
    console.log(`   Мониторинг начнётся в: ${new Date(monitorStart*1000).toLocaleTimeString()}\n`);
    await new Promise(r=>setTimeout(r, waitSecs*1000));
  }

  // ── STEP 0: Initialize ──────────────────────────────────────────
  console.log("\n🔍 ИНИЦИАЛИЗАЦИЯ — загружаю базовое состояние...");

  // Load prices
  const epochs0 = await sugar.epochsLatest(500, 0);
  const allToks0 = [...new Set(epochs0.flatMap(ep=>[...ep.bribes,...ep.fees].map(t=>t.token.toLowerCase())))];
  const PRICES = await fetchPrices(allToks0);
  console.log(`💲 Загружено цен: ${Object.keys(PRICES).length}`);

  const {state: baseState, totalVeAero} = await fetchPoolState(tinfo, PRICES, epoch);

  // ── STEP 1: Filter candidates ───────────────────────────────────
  const candidates = Object.entries(baseState)
    .filter(([lp,s]) => s.bribeUsd >= CFG.MIN_INCENTIVES && s.votePct >= CFG.MIN_VOTE_PCT)
    .map(([lp,s]) => ({lp:s.lp, ...s}));

  // Remove pools with votes >> median
  const votes = candidates.map(p=>p.votes).sort((a,b)=>a-b);
  const median = votes[Math.floor(votes.length/2)]||0;

  const trackedPools = candidates
    .filter(p => p.votes <= median * 3)
    .sort((a,b) => (b.bribeUsd/b.votes) - (a.bribeUsd/a.votes))
    .slice(0, CFG.TOP_POOLS)
    .map(p => ({
      lp: p.lp,
      baseIncentives: p.bribeUsd,
      baseVotes: p.votes,
      currentIncentives: p.bribeUsd,
      currentVotes: p.votes,
      currentVotePct: p.votePct,
      excluded: false,
    }));

  console.log(`\n✅ Отслеживаю ${trackedPools.length} пулов из ${candidates.length} кандидатов`);
  trackedPools.forEach((p,i) => {
    const sym = poolSymbols[p.lp.toLowerCase()]||p.lp.slice(0,10)+"…";
    console.log(`   ${i+1}. ${sym.padEnd(24)} incentives=${fU(p.baseIncentives)} votes=${fP(p.currentVotePct)}`);
  });

  if(!trackedPools.length) {
    console.log("\n⛔ НЕТ КАНДИДАТОВ — нет пулов с достаточными incentives. Выход.");
    return;
  }

  // ── STEP 2: Monitoring loop ─────────────────────────────────────
  let cycle = 0;
  let finalTriggered = false;

  while(true) {
    const now2 = Math.floor(Date.now()/1000);
    const left = epochEnd - now2;

    if(left <= 0) {
      console.log("\n⏰ Эпоха закончилась. Выход.");
      break;
    }

    // Final trigger
    if(left <= CFG.FINAL_TRIGGER && !finalTriggered) {
      finalTriggered = true;

      // Find best pool
      const activePools = trackedPools.filter(p=>!p.excluded);
      const withDelta = activePools.filter(p=>p.currentIncentives > p.baseIncentives);
      const ranked = (withDelta.length ? withDelta : activePools)
        .sort((a,b) => {
          const scoreA = (a.currentIncentives-a.baseIncentives)/a.currentVotes;
          const scoreB = (b.currentIncentives-b.baseIncentives)/b.currentVotes;
          return scoreB - scoreA;
        });

      renderFinal(ranked[0]||null, poolSymbols);

      // Keep refreshing table but don't trigger again
    }

    // Update pool states
    try {
      const {state: newState} = await fetchPoolState(tinfo, PRICES, epoch);
      for(const tp of trackedPools) {
        const ns = newState[tp.lp.toLowerCase()];
        if(!ns) continue;

        // STEP 3: Anti-filter — exclude if votes growing too fast
        if(tp.baseVotes > 0) {
          const growthRate = (ns.votes - tp.baseVotes) / tp.baseVotes;
          if(growthRate > CFG.FAST_GROWTH_THRESHOLD) {
            tp.excluded = true;
          }
        }

        // Update current state
        tp.currentIncentives = ns.bribeUsd;
        tp.currentVotes = ns.votes;
        tp.currentVotePct = ns.votePct;
      }
    } catch(e) {
      // Silent fail — show stale data
    }

    cycle++;
    renderTable(trackedPools, poolSymbols, cycle, left);

    if(left <= CFG.FINAL_TRIGGER) {
      // Reshow final recommendation
      const activePools = trackedPools.filter(p=>!p.excluded);
      const withDelta = activePools.filter(p=>p.currentIncentives > p.baseIncentives);
      const ranked = (withDelta.length ? withDelta : activePools)
        .sort((a,b) => {
          const scoreA = (a.currentIncentives-a.baseIncentives)/a.currentVotes;
          const scoreB = (b.currentIncentives-b.baseIncentives)/b.currentVotes;
          return scoreB - scoreA;
        });
      renderFinal(ranked[0]||null, poolSymbols);
      if(left < 60) break;
    }

    await new Promise(r=>setTimeout(r, CFG.POLL_INTERVAL));
  }
}

main().catch(e=>{console.error("\n❌",e.message);process.exit(1);});
// This line is just a marker - see patch below
