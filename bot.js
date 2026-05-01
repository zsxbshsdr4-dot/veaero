import { fetchData } from "./index.js";
import http from "http";

const BOT_TOKEN = process.env.BOT_TOKEN || "8687230051:AAEqtRCMzItsfIxlcVKIsSyBq04blQmyYtU";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let cache = null;
let cacheTime = 0;

function fU(n){if(!n||n===0)return"$0";if(n>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+Math.round(n);}

async function getData(){
  if(cache&&Date.now()-cacheTime<5*60*1000) return cache;
  cache = await fetchData();
  cacheTime = Date.now();
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
    await send(chatId,"🟦 <b>veAERO Voting Scanner</b>\n\nКоманды:\n/best — лучший пул\n/top — топ-10 по моим $\n/veapy — топ-10 по veAPY\n/refresh — обновить данные");
    return;
  }

  if(["/best","/top","/veapy","/refresh"].includes(text)){
    await send(chatId,"⏳ Загружаю данные (~2 мин)...");
    if(text==="/refresh"){cache=null;cacheTime=0;}
    try{
      const{pools,best,meta}=await getData();

      if(text==="/best"||text==="/refresh"){
        const b=best||[...pools].sort((a,x)=>x.myUsd-a.myUsd)[0];
        await send(chatId,`🚀 <b>ЛУЧШИЙ ПУЛ</b>\n\n<b>${b.symbol}</b>\nГолоса: ${b.votePct.toFixed(2)}%\nFees: ${fU(b.feesUsd)}\nBribes: ${fU(b.bribeUsd)}\nTotal: ${fU(b.totalUsd)}\nveAPY: ${b.veApy.toFixed(1)}%\n💰 Мои: <b>${fU(b.myUsd)}</b>\n\n📅 ${meta.epochDate}`);
      }

      if(text==="/top"){
        const top=[...pools].sort((a,x)=>x.myUsd-a.myUsd).slice(0,10);
        let m=`🎯 <b>ТОП-10 МОИ REWARDS</b>\n<i>${meta.epochDate}</i>\n\n`;
        top.forEach((p,i)=>{m+=`${i+1}. <b>${p.symbol}</b> — ${fU(p.myUsd)}\n   veAPY: ${p.veApy.toFixed(1)}% | Total: ${fU(p.totalUsd)}\n\n`;});
        await send(chatId,m);
      }

      if(text==="/veapy"){
        const top=[...pools].filter(p=>p.totalUsd>100&&p.votePct>0.05).sort((a,x)=>x.veApy-a.veApy).slice(0,10);
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
  }catch(e){console.error("Poll:",e.message);setTimeout(()=>poll(offset),5000);}
}

http.createServer((req,res)=>res.end("OK")).listen(process.env.PORT||3000);
console.log("🤖 veAERO Bot started!");
poll();
