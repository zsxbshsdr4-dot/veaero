import http from "http";

const BOT_TOKEN = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MINIAPP_URL = process.env.MINIAPP_URL || "https://hardiness-handbrake-periscope.ngrok-free.dev";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";

const fU=n=>{if(!n||n===0)return'$0';if(n>=1e6)return'$'+(n/1e6).toFixed(2)+'M';if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K';return'$'+Math.round(n)};

async function send(chatId, text, extra={}) {
  await fetch(`${API}/sendMessage`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({chat_id:chatId, text, parse_mode:"HTML", ...extra})
  });
}

async function handle(update) {
  const msg = update.message;
  if(!msg) return;
  const chatId = msg.chat.id;
  const text = msg.text||"";

  if(text === "/start") {
    await send(chatId,
      "🟦 <b>veAERO Voting Scanner</b>\n\nАнализирую пулы Aerodrome Finance в реальном времени.\n\nКоманды:\n/app — дашборд 📊\n/best — лучший пул\n/top — топ-10 по моим $\n/veapy — топ-10 по veAPY",
      {reply_markup:{inline_keyboard:[[{text:"📊 Открыть Dashboard",web_app:{url:MINIAPP_URL}}]]}}
    );
    return;
  }

  if(text === "/app") {
    await send(chatId, "📊 Открываю дашборд...",
      {reply_markup:{inline_keyboard:[[{text:"📊 veAERO Dashboard",web_app:{url:MINIAPP_URL}}]]}}
    );
    return;
  }

  if(["/best","/top","/veapy"].includes(text)) {
    await send(chatId, "⏳ Загружаю данные (~2 мин)...");
    try {
      const r = await fetch(`${SERVER_URL}/api/data`);
      if(!r.ok) throw new Error("Сервер недоступен. Запусти node server.js на MacBook.");
      const {pools, meta} = await r.json();

      if(text === "/best") {
        const best = pools.filter(p=>p.totalUsd>500&&p.votePct>0.1).sort((a,b)=>b.myUsd-a.myUsd)[0]||pools[0];
        await send(chatId,
          `🚀 <b>ЛУЧШИЙ ПУЛ</b>\n\n<b>${best.symbol}</b>\nГолоса: ${Number(best.votePct).toFixed(2)}%\nFees: ${fU(best.feesUsd)}\nBribes: ${fU(best.bribeUsd)}\nTotal: ${fU(best.totalUsd)}\nveAPY: ${Number(best.veApy).toFixed(1)}%\n💰 Мои: <b>${fU(best.myUsd)}</b>\n\n📅 ${meta.epochDate}`,
          {reply_markup:{inline_keyboard:[[{text:"📊 Все пулы",web_app:{url:MINIAPP_URL}}]]}}
        );
      }

      if(text === "/top") {
        const top=[...pools].sort((a,b)=>b.myUsd-a.myUsd).slice(0,10);
        let msg=`🎯 <b>ТОП-10 МОИ REWARDS</b>\n<i>${meta.epochDate}</i>\n\n`;
        top.forEach((p,i)=>{msg+=`${i+1}. <b>${p.symbol}</b> — ${fU(p.myUsd)}\n   veAPY: ${Number(p.veApy).toFixed(1)}% | Total: ${fU(p.totalUsd)}\n\n`;});
        await send(chatId, msg, {reply_markup:{inline_keyboard:[[{text:"📊 Dashboard",web_app:{url:MINIAPP_URL}}]]}});
      }

      if(text === "/veapy") {
        const top=[...pools].filter(p=>p.totalUsd>100&&p.votePct>0.05).sort((a,b)=>b.veApy-a.veApy).slice(0,10);
        let msg=`📈 <b>ТОП-10 veAPY</b>\n<i>${meta.epochDate}</i>\n\n`;
        top.forEach((p,i)=>{msg+=`${i+1}. <b>${p.symbol}</b> — ${Number(p.veApy).toFixed(1)}%\n   Total: ${fU(p.totalUsd)} | Мои: ${fU(p.myUsd)}\n\n`;});
        await send(chatId, msg, {reply_markup:{inline_keyboard:[[{text:"📊 Dashboard",web_app:{url:MINIAPP_URL}}]]}});
      }

    } catch(e) {
      await send(chatId, "❌ " + e.message);
    }
  }
}

http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.end('OK');}).listen(3002,()=>console.log('Bot HTTP: 3002'));

async function poll(offset=0){
  try{
    const r=await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
    const j=await r.json();
    if(!j.ok){setTimeout(()=>poll(offset),5000);return;}
    let o=offset;
    for(const u of j.result){o=u.update_id+1;handle(u).catch(console.error);}
    poll(o);
  }catch(e){console.error("Poll:",e.message);setTimeout(()=>poll(offset),5000);}
}

console.log("🤖 veAERO Bot + Mini App запущен!");
console.log(`📱 Mini App: ${MINIAPP_URL}`);
poll();
