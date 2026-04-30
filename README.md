# veAERO Voting Scanner 🟦
Читает реальные данные Aerodrome прямо из блокчейна Base.
Никаких API ключей, никаких баз данных.

---

## Установка (один раз)

### 1. Установи Node.js
https://nodejs.org → скачай LTS → установи

Проверка в Terminal:
```
node -v    # должно быть v20+
npm -v
```

### 2. Распакуй папку veaero и зайди в неё
```
cd veaero
```

### 3. Установи зависимости
```
npm install
```

---

## Запуск

```
node index.js
```

Ждёт ~30-60 секунд (100 пулов × multicall батчи).

---

## Что увидишь

```
═══════════════════════════════════════════════════
  🟦 AERODROME veAERO VOTING SCANNER
═══════════════════════════════════════════════════

📦 Всего пулов в протоколе: 847
🔍 Сканируем первые: 100
💪 Total veAERO weight: 124,847,291

⏳ [1/5] Загружаем адреса пулов...
⏳ [2/5] Загружаем gauge адреса и веса...
...

🏆 ТОП-10 ПО ГОЛОСАМ
🎯 ТОП-10 ПО ROI (лучшая отдача на 1 veAERO)
💰 ТОП-10 ПО БРАЙБАМ

╔═══════════════════════════════╗
║ 🚀 РЕКОМЕНДАЦИЯ               ║
╚═══════════════════════════════╝
  Пул:    WETH/USDC
  Gauge:  0x519BBD...
  Брайбы: $184,000
  ROI:    0.000148 USD на 1 veAERO
```

---

## Параметры

Сканировать больше пулов:
```
SCAN_LIMIT=300 node index.js
```

Использовать быстрый RPC (Alchemy — бесплатно):
1. Зарегистрируйся на https://www.alchemy.com
2. Создай App → выбери Base
3. Скопируй HTTPS URL
```
RPC_URL=https://base-mainnet.g.alchemy.com/v2/ТВОЙ_КЛЮЧ node index.js
```

---

## Обновить цены токенов

В файле `index.js` найди `TOKEN_PRICES` и обнови:
```js
"0x4200...0006": 2500,  // WETH цена в USD
"0x9401...1": 0.95,     // AERO цена в USD
```

Или напиши мне — добавлю автоматический fetch цен через DeFiLlama.

---

## Структура данных (что читается из блокчейна)

```
Voter.length()              → сколько пулов
Voter.pools(i)              → адрес пула #i
Voter.gauges(pool)          → gauge адрес
Voter.weights(pool)         → текущий вес голосов
Voter.totalWeight()         → сумма всех весов
Voter.gaugeToBribe(gauge)   → BribeVotingReward адрес

BribeVotingReward.rewardsListLength()   → кол-во bribe токенов
BribeVotingReward.rewards(i)            → адрес токена #i
BribeVotingReward.left(token)           → остаток токенов в эпохе
```

---

## Адреса контрактов (Base)

| Контракт       | Адрес |
|---------------|-------|
| Voter          | 0x16613524e02ad97eDfeF371bC883F2F5d6C480A5 |
| VotingEscrow   | 0xeBf418Fe2512e7E6bd9b87a8F0f294aCDC67e6B4 |
| Minter         | 0xeB018363e7A76EDD4dAcC69f7e55e408A2B6d3E7 |
| Multicall3     | 0xcA11bde05977b3631167028862bE2a173976CA11 |
