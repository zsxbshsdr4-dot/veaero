import { ethers } from "ethers";

const RPC        = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/VCOkWlL74YaZXrQf3n-bU";
const VOTER_ADDR = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5";
const MC3_ADDR   = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SUGAR_ADDR = "0x68c19e13618c41158fe4baba1b8fb3a9c74bdb0a";
const MY_VEAERO  = parseFloat(process.env.MY_VEAERO || "25262");
const BOT_TOKEN  = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const CHAT_ID    = process.env.CHAT_ID   || "478227003";

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
const VI = new ethers.Interface(["function length() view returns (uint256)","function pools(uint256) view returns (address)","function weights(address) view returns (uint256)","function totalWeight() view returns (uint256)"]);
const PI = new ethers.Interface(["function token0() view returns (address)","function token1() view returns (address)"]);
const EI = new ethers.Interface(["function symbol() view returns (string)","function decimals() view returns (uint8)"]);
const SUGAR_ABI = ["function epochsLatest(uint256,uint256) view returns (tuple(uint256 ts,address lp,uint256 votes,uint256 emissions,tuple(address token,uint256 amount)[] bribes,tuple(address token,uint256 amount)[] fees)[])"];
const mc3   = new ethers.Contract(MC3_ADDR, MC3_ABI, provider);
const sugar = new ethers.Contract(SUGAR_ADDR, SUGAR_ABI, provider);
const voter = new ethers.Contract(VOTER_ADDR, VI, provider);

function chunks(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
async function mcall(calls){const res=[];for(const batch of chunks(calls,100)){try{const raw=await mc3.aggregate3(batch.map(c=>({target:c.target,allowFailure:true,callData:c.iface.encodeFunctionData(c.fn,c.args||[])})));for(let i=0;i<raw.length;i++){if(!raw[i].success||raw[i].returnData==="0x"){res.push(null);continue;}try{const d=batch[i].iface.decodeFunctionResult(batch[i].fn,raw[i].returnData);res.push(d.length===1?d[0]:d);}catch{res.push(null);}}}catch{batch.forEach(()=>res.push(null));}}return res;}
async function fetchPrices(tokens){const prices={};for(let i=0;i<tokens.length;i+=30){try{const r=await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokens.slice(i,i+30).join(",")}`);const j=await r.json();for(const[a,p] of Object.entries(j?.data?.attributes?.token_prices||{}))if(p)prices[a.toLowerCase()]=parseFloat(p);}catch{}}return prices;}
async function sendTG(text){try{await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:"HTML"})});}catch{}}

const fU=n=>{if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toFixed(0);};
const fP=n=>Number(n).toFixed(2)+"%";
const fT=s=>{if(s<=0)return"⏰ ЗАКРЫТО";const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;return h>0?`${h}ч ${m}м ${sc}с`:`${m}м ${sc}с`;};
const pad=(s,n)=>String(s).slice(0,n).padEnd(n);
const lpad=(s,n)=>String(s).slice(0,n).padStart(n);

async function loadTokenInfo(){
  process.stdout.write("⏳ Загружаю токены... ");
  const total=Number(await voter.length());
  const poolRes=await mcall(Array.from({length:total},(_,i)=>({target:VOTER_ADDR,iface:VI,fn:"pools",args:[i]})));
  const pools=poolRes.filter(Boolean);
  const m1=await mcall(pools.flatMap(p=>[{target:p,iface:PI,fn:"token0"},{target:p,iface:PI,fn:"token1"}]));
  const uniq=[...new Set(pools.flatMap((_,i)=>[m1[i*2],m1[i*2+1]]).filter(Boolean))];
  const[syms,decs]=await Promise.all([mcall(uniq.map(t=>({target:t,iface:EI,fn:"symbol"}))),mcall(uniq.map(t=>({target:t,iface:EI,fn:"decimals"})))]);
  const tinfo={};for(let i=0;i<uniq.length;i++)tinfo[uniq[i].toLowerCase()]={symbol:syms[i]||"?",decimals:Number(decs[i]||18)};
  const poolSymbols={};for(let i=0;i<pools.length;i++){const t0=m1[i*2]?.toLowerCase()||"";const t1=m1[i*2+1]?.toLowerCase()||"";poolSymbols[pools[i].toLowerCase()]=`${tinfo[t0]?.symbol||"?"}/${tinfo[t1]?.symbol||"?"}`;}
  console.log(`✅ ${pools.length} пулов`);
  return{tinfo,poolSymbols};
}

async function fetchState(tinfo,PRICES){
  const epochs=await sugar.epochsLatest(600,0);
  const totalW=await voter.totalWeight();
  const totalVeAero=Number(ethers.formatEther(totalW));
  const state={};
  for(const ep of epochs){
    const lp=ep.lp.toLowerCase();
    const votes=Number(ethers.formatEther(ep.votes));
    let bribeUsd=0;const bribeTokens=[];
    for(const t of ep.bribes){const tok=t.token.toLowerCase();const inf=tinfo[tok]||{symbol:"?",decimals:18};const amt=Number(ethers.formatUnits(t.amount,inf.decimals));const usd=amt*(PRICES[tok]||FALLBACK[tok]||0);bribeTokens.push({symbol:inf.symbol,usd});bribeUsd+=usd;}
    state[lp]={lp:ep.lp,votes,votePct:(votes/totalVeAero)*100,bribeUsd,bribeTokens};
  }
  return state;
}

function getBest(tracked,poolSymbols){
  const active=tracked.filter(p=>!p.excluded);
  const withDelta=active.filter(p=>p.cur>p.base);
  const pool=(withDelta.length?withDelta:active).sort((a,b)=>(b.cur-b.base)/(b.curVotes||1)-(a.cur-a.base)/(a.curVotes||1))[0];
  if(!pool)return null;
  return{pool,sym:poolSymbols[pool.lp.toLowerCase()]||pool.lp.slice(0,10),delta:pool.cur-pool.base,myUsd:pool.cur*(MY_VEAERO/(pool.curVotes+MY_VEAERO))};
}

async function sendInterim(tracked,poolSymbols,left,num){
  const b=getBest(tracked,poolSymbols);
  const withDelta=tracked.filter(p=>!p.excluded&&p.cur>p.base);
  let msg=`📊 <b>Промежуточный #${num}</b>\n⏱ До закрытия: ${fT(left)}\n\n`;
  if(b){msg+=`🏆 <b>${b.sym}</b>\nIncentives: ${fU(b.pool.cur)}${b.delta>0?` | Δ +${fU(b.delta)}`:""}\nVotes: ${fP(b.pool.votePct)} | Мои: ${fU(b.myUsd)}\n\n`;}
  if(withDelta.length){msg+=`🔥 Новые incentives (${withDelta.length}):\n`;for(const p of withDelta.slice(0,3)){const s=poolSymbols[p.lp.toLowerCase()]||p.lp.slice(0,8);msg+=`• ${s}: +${fU(p.cur-p.base)}\n`;}}
  else{msg+=`📊 Изменений пока нет`;}
  await sendTG(msg);
  console.log(`\n📱 Промежуточный #${num} отправлен`);
}

async function sendFinal(tracked,poolSymbols,left){
  const b=getBest(tracked,poolSymbols);
  const withDelta=tracked.filter(p=>p.cur>p.base);
  let msg=`🚨 <b>ФИНАЛЬНЫЙ ОТЧЁТ — ГОЛОСУЙ!</b>\n⏱ До закрытия: ${fT(left)}\n\n`;
  if(!b||(!withDelta.length&&b.delta===0)){msg+=`⛔ <b>НЕ ГОЛОСОВАТЬ</b>\nНет новых incentives или все пулы перегреты.`;}
  else{msg+=`✅ <b>ГОЛОСУЙ:</b>\n\nПул: <b>${b.sym}</b>\nIncentives: <b>${fU(b.pool.cur)}</b>${b.delta>0?`\nΔ Новые: <b>+${fU(b.delta)}</b>`:""}\nVotes: ${fP(b.pool.votePct)}\nМои rewards: <b>${fU(b.myUsd)}</b>`;
  if(b.pool.bribeTokens?.length){msg+=`\n\nBribes:\n`;for(const t of b.pool.bribeTokens.slice(0,4))msg+=`• ${t.symbol}: ${fU(t.usd)}\n`;}
  msg+=`\n\n🔗 aerodrome.finance/vote`;}
  await sendTG(msg);
  console.log(`\n📱 ФИНАЛЬНЫЙ ОТЧЁТ отправлен!`);
}

function render(tracked,poolSymbols,cycle,left,nextReport){
  console.clear();
  const W=process.stdout.columns||110;
  const L="═".repeat(W);const T="─".repeat(W);const R="\x1b[0m";
  console.log("\n"+L);
  console.log("  🎯  AERODROME LATE-INCENTIVE MONITOR");
  console.log(L);
  const phase=left>60*60?"📊 Мониторинг":left>10*60?"⚡ Активный":"🔴 ФИНАЛЬНАЯ";
  console.log(`  ⏱  До закрытия голосования: ${fT(left).padEnd(18)} ${phase.padEnd(28)} Цикл: #${cycle}  ${new Date().toLocaleTimeString("ru-RU")}`);
  if(nextReport>0)console.log(`  📱  Следующий отчёт в Telegram через: ${fT(nextReport)}`);
  console.log(L+"\n");
  if(!tracked.length){console.log("  ⚠️  Нет кандидатов\n");return;}
  const H=[lpad("#",3),pad("Пул",22),lpad("Incentives",12),lpad("Δ Bribe",10),lpad("Votes%",8),lpad("Δ Votes",9),lpad("Score",10),lpad("Мои$",8),"Статус"].join("  ");
  console.log("  "+H);console.log("  "+T);
  for(let i=0;i<tracked.length;i++){
    const p=tracked[i];const sym=poolSymbols[p.lp.toLowerCase()]||p.lp.slice(0,10)+"…";
    const delta=p.cur-p.base;const vd=p.baseVotes>0?((p.curVotes-p.baseVotes)/p.baseVotes*100):0;
    const score=p.curVotes>0&&delta>0?delta/p.curVotes:0;const myUsd=p.cur*(MY_VEAERO/(p.curVotes+MY_VEAERO));
    let st="👁  слежу";
    if(p.excluded)st="❌ киты/боты";else if(delta>500)st="🔥 НОВЫЙ INCENTIVE!";else if(delta>0)st="🟡 рост";else if(vd>5)st="⚡ скрытый сигнал";
    const dS=delta>0?"+"+fU(delta):delta<0?"-"+fU(Math.abs(delta)):"—";
    const vS=(vd>=0?"+":"")+vd.toFixed(1)+"%";
    const dC=delta>0?"\x1b[32m":delta<0?"\x1b[31m":"\x1b[90m";const vC=vd>10?"\x1b[31m":vd>3?"\x1b[33m":"\x1b[90m";
    const rC=p.excluded?"\x1b[2m":delta>0?"\x1b[97m":"";
    console.log("  "+rC+[lpad(String(i+1),3),pad(sym,22),lpad(fU(p.cur),12),dC+lpad(dS,10)+R+rC,lpad(fP(p.votePct),8),vC+lpad(vS,9)+R+rC,lpad(score>0?score.toFixed(5):"—",10),lpad(fU(myUsd),8),st].join("  ")+R);
  }
  const b=getBest(tracked,poolSymbols);
  console.log("\n  "+T);
  if(b&&b.delta>0)console.log(`  \x1b[92m🏆 Лучший: ${b.sym} — ${fU(b.pool.cur)} | Δ+${fU(b.delta)} | Мои: ${fU(b.myUsd)}\x1b[0m`);
  else if(b)console.log(`  \x1b[97m🏆 Лучший: ${b.sym} — ${fU(b.pool.cur)} | Мои: ${fU(b.myUsd)}\x1b[0m`);
  console.log();
}

async function main(){
  const WEEK=604800,now=Math.floor(Date.now()/1000);
  const epoch=Math.floor(now/WEEK)*WEEK;
  const voteDeadline=epoch+WEEK-3600; // 02:00 Jerusalem = 1 час до конца эпохи

  console.log("\n"+"═".repeat(80));
  console.log("  🎯  LATE-INCENTIVE MONITOR — Aerodrome veAERO");
  console.log("═".repeat(80));
  console.log(`  Дедлайн голосования: ${new Date(voteDeadline*1000).toLocaleString("ru-RU")}`);
  console.log(`  До закрытия:         ${fT(voteDeadline-now)}`);
  console.log("═".repeat(80)+"\n");

  // Load tokens + prices
  const{tinfo,poolSymbols}=await loadTokenInfo();
  process.stdout.write("⏳ Загружаю цены... ");
  const epochs0=await sugar.epochsLatest(600,0);
  const allToks=[...new Set(epochs0.flatMap(ep=>[...ep.bribes,...ep.fees].map(t=>t.token.toLowerCase())))];
  const PRICES=await fetchPrices(allToks);
  console.log(`✅ ${Object.keys(PRICES).length} цен`);

  // Base state
  process.stdout.write("⏳ Загружаю базовое состояние... ");
  const baseState=await fetchState(tinfo,PRICES);
  const candidates=Object.values(baseState).filter(s=>s.bribeUsd>=200&&s.votePct>=0.03).sort((a,b)=>(b.bribeUsd/(b.votes||1))-(a.bribeUsd/(a.votes||1)));
  const votes=candidates.map(p=>p.votes).sort((a,b)=>a-b);
  const median=votes[Math.floor(votes.length/2)]||0;
  const tracked=candidates.filter(p=>p.votes<=median*3).slice(0,15).map(p=>({lp:p.lp,base:p.bribeUsd,baseVotes:p.votes,cur:p.bribeUsd,curVotes:p.votes,votePct:p.votePct,bribeTokens:p.bribeTokens||[],excluded:false}));
  console.log(`✅ Отслеживаю ${tracked.length} пулов\n`);

  await sendTG(`🎯 <b>Monitor запущен</b>\nОтслеживаю ${tracked.length} пулов\nДедлайн: ${new Date(voteDeadline*1000).toLocaleTimeString("ru-RU")}\n\n📊 Промежуточные отчёты каждые 3 мин\n🚨 Финальный в 01:52`);

  let cycle=0,interimCount=0,lastInterimAt=Math.floor(Date.now()/1000),finalSent=false;

  while(true){
    const now2=Math.floor(Date.now()/1000);
    const left=voteDeadline-now2;

    if(left<=0){
      console.clear();
      console.log("\n⏰ Голосование закрыто! Следующий раз — в среду.\n");
      await sendTG("⏰ <b>Голосование закрыто!</b>\nСледующий мониторинг в среду в 01:20.");
      break;
    }

    // Final at T-8min (01:52)
    if(!finalSent&&left<=8*60){finalSent=true;await sendFinal(tracked,poolSymbols,left);}

    // Interim every 3 min
    const secSince=now2-lastInterimAt;
    if(secSince>=3*60&&!finalSent){interimCount++;lastInterimAt=now2;await sendInterim(tracked,poolSymbols,left,interimCount);}

    // Update
    try{
      const ns=await fetchState(tinfo,PRICES);
      for(const tp of tracked){const s=ns[tp.lp.toLowerCase()];if(!s)continue;if(tp.baseVotes>0&&(s.votes-tp.baseVotes)/tp.baseVotes>0.2)tp.excluded=true;tp.cur=s.bribeUsd;tp.curVotes=s.votes;tp.votePct=s.votePct;tp.bribeTokens=s.bribeTokens||[];}
    }catch{}

    cycle++;
    const nextReport=finalSent?0:Math.max(0,3*60-secSince);
    render(tracked,poolSymbols,cycle,left,nextReport);

    const interval=left>60*60?60000:left>10*60?30000:15000;
    await new Promise(r=>setTimeout(r,interval));
  }
}

main().catch(e=>{console.error("\n❌",e.message);process.exit(1);});
