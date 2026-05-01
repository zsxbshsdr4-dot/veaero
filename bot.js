import { spawn } from "child_process";
import http from "http";

const BOT_TOKEN = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let cache = null;
let cacheTime = 0;
let loading = false;

function fU(n){if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+Math.round(n);}

async function runScanner() {
  if (loading) return;
  if (cache && Date.now() - cacheTime < 5*60*1000) return;
  loading = true;
  return new Promise((resolve) => {
    let output = "";
    const proc = spawn("node", ["index.js"], {
      env: {...process.env},
      timeout: 300000
    });
    proc.stdout.on("data", d => { output += d.toString(); });
    proc.stderr.on("data", d => { console.error(d.toString()); });
    proc.on("close", () => {
      cache = parseOutput(output);
      cacheTime = Date.now();
      loading = false;
      resolve();
    });
  });
}

function parseOutput(text) {
  const pools = [];
  const lines = text.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (line.includes("МОИ REWARDS")) { inTable = true; continue; }
    if (inTable && line.includes("═══")) { inTable = false; continue; }
    if (!inTable) continue;
    const m = line.match(/\s+\d+\.\s+(\S+\/\S+)\s+([\d.]+)%\s+[\d,]+\s+(\S+)\s+(\S+)\s+(\S+)\s+([\d.]+)%\s+(\S+)/);
    if (m) {
      pools.push({
        symbol: m[1],
        votePct: parseFloat(m[2]),
        feesUsd: parseVal(m[3]),
        bribeUsd: parseVal(m[4]),
        totalUsd: parseVal(m[5]),
        veApy: parseFloat(m[6]),
        myUsd: parseVal(m[7]),
      });
    }
  }
  // Parse best pool
  let best = null;
  const bestMatch = text.match(/Пул:\s+(\S+)\n.*?Голоса:\s+([\d.]+)%.*?Fees:\s+(\S+)\n.*?Incentives:\s+(\S+)\n.*?Total:\s+(\S+)\n.*?veAPY:\s+([\d.]+)%\n.*?Мои rewards:\s+(\S+)/s);
  if (bestMatch) {
    best = {
      symbol: bestMatch[1],
      votePct: parseFloat(bestMatch[2]),
      feesUsd: parseVal(bestMatch[3]),
      bribeUsd: parseVal(bestMatch[4]),
      totalUsd: parseVal(bestMatch[5]),
      veApy: parseFloat(bestMatch[6]),
      myUsd: parseVal(bestMatch[7]),
    };
  }
  return { pools, best };
}

function parseVal(s) {
  if (!s || s === "$0") return 0;
  s = s.replace("$","");
  if (s.endsWith("K")) return parseFloat(s)*1000;
  if (s.endsWith("M")) return parseFloat(s)*1000000;
  return parseFloat(s)||0;
}

async function send(chatId, text) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({chat_id: chatId, text, parse_mode: "HTML"})
  });
}

async function handle(update) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (text === "/start") {
    await send(chatId, "🟦 <b>veAERO Voting Scanner</b>\n\nКоманды:\n/best — лучший пул\n/top — топ-10 по моим $\n/veapy — топ-10 по veAPY\n/refresh — обновить данные");
    return;
  }

  if (["/best","/top","/veapy","/refresh"].includes(text)) {
    await send(chatId, "⏳ Загружаю данные из блокчейна (~2 мин)...");
    if (text === "/refresh") { cache = null; cacheTime = 0; }
    try {
      await runScanner();
      if (!cache || !cache.pools.length) {
        await send(chatId, "❌ Данные не загружены");
        return;
      }

      if (text === "/best" || text === "/refresh") {
        const b = cache.best || cache.pools.sort((a,x)=>x.myUsd-a.myUsd)[0];
        await send(chatId,
          `🚀 <b>ЛУЧШИЙ ПУЛ</b>\n\n<b>${b.symbol}</b>\nГолоса: ${b.votePct.toFixed(2)}%\nFees: ${fU(b.feesUsd)}\nBribes: ${fU(b.bribeUsd)}\nTotal: ${fU(b.totalUsd)}\nveAPY: ${b.veApy.toFixed(1)}%\n💰 Мои: <b>${fU(b.myUsd)}</b>`
        );
      }

      if (text === "/top") {
        const top = [...cache.pools].sort((a,x)=>x.myUsd-a.myUsd).slice(0,10);
        let m = `🎯 <b>ТОП-10 МОИ REWARDS</b>\n\n`;
        top.forEach((p,i) => { m += `${i+1}. <b>${p.symbol}</b> — ${fU(p.myUsd)}\n   veAPY: ${p.veApy.toFixed(1)}% | Total: ${fU(p.totalUsd)}\n\n`; });
        await send(chatId, m);
      }

      if (text === "/veapy") {
        const top = [...cache.pools].filter(p=>p.veApy>0).sort((a,x)=>x.veApy-a.veApy).slice(0,10);
        let m = `📈 <b>ТОП-10 veAPY</b>\n\n`;
        top.forEach((p,i) => { m += `${i+1}. <b>${p.symbol}</b> — ${p.veApy.toFixed(1)}%\n   Total: ${fU(p.totalUsd)} | Мои: ${fU(p.myUsd)}\n\n`; });
        await send(chatId, m);
      }
    } catch(e) {
      await send(chatId, "❌ Ошибка: " + e.message);
    }
  }
}

async function poll(offset=0) {
  try {
    const r = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
    const j = await r.json();
    if (!j.ok) { setTimeout(()=>poll(offset), 5000); return; }
    let o = offset;
    for (const u of j.result) { o = u.update_id+1; handle(u).catch(console.error); }
    poll(o);
  } catch(e) { console.error("Poll error:", e.message); setTimeout(()=>poll(offset), 5000); }
}

http.createServer((req,res)=>res.end("OK")).listen(process.env.PORT||3000);
console.log("🤖 veAERO Bot started!");
poll();
