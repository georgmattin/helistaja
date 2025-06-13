# 📞 Twilio Dialer - Helistaja

Lihtne veebipõhine dialer Twilio Voice API kasutades. Võimaldab helistada arvutist otse veebilehitseja kaudu, kasutades kõrvaklappe või kõlareid.

## 🚀 Funktsioonid

- ✅ **Veebipõhine helistamine** - Helista otse brauserist
- ✅ **Täielik numbriklahvistik** - Kliki või kasuta klaviatuuri
- ✅ **Audio juhtimine** - Vali mikrofon ja kõlarid/kõrvaklapid
- ✅ **Kõne timer** - Näeb kõne pikkust
- ✅ **DTMF tugi** - Saada numbreid kõne ajal (menüüd jne)
- ✅ **Klaviatuuri kiirklahvid** - Kiire kasutamine
- ✅ **Reaalajas logid** - Jälgi, mis toimub

## 🛠️ Paigaldamine

### 1. Klooni või laadi alla

```bash
# Kui kasutad git-i
git clone <repo-url>
cd twilio-dialer

# Või lihtsalt laadi failid alla
```

### 2. Paigalda sõltuvused

```bash
npm install
```

### 3. Seadista Twilio

#### 3.1 Loo Twilio konto
1. Mine [twilio.com](https://twilio.com) ja loo konto
2. Logi sisse Twilio Console'i

#### 3.2 Hangi Account SID ja Auth Token
1. Mine Twilio Console'i Dashboard'ile
2. Kopeeri **Account SID** ja **Auth Token**

#### 3.3 Osta telefoninumber
1. Mine Phone Numbers > Manage > Buy a number
2. Vali number, mis toetab **Voice** võimalust
3. Osta number

#### 3.4 Loo TwiML Application
1. Mine Console > Develop > Voice > TwiML Apps
2. Kliki "Create new TwiML App"
3. Seadista:
   - **Application Name**: "Dialer App"
   - **Request URL**: `http://localhost:3000/twiml` (arenduse jaoks)
   - **Request Method**: POST
4. Salvesta ja kopeeri **Application SID**

### 4. Seadista keskkonna muutujad

1. Kopeeri `.env.example` faili `.env` failiks:

```bash
copy .env.example .env
```

2. Redigeeri `.env` faili ja lisa oma Twilio andmed:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. Käivita rakendus

```bash
# Arenduseks (restardib automaatselt)
npm run dev

# Või tavaline käivitamine
npm start
```

Rakendus käivitub aadressil: http://localhost:3000

## 🎧 Kasutamine

### Esmakorune seadistamine

1. **Ava rakendus** - Mine http://localhost:3000
2. **Luba mikrofon** - Brauser küsib mikrofoni luba
3. **Vali audio seadmed** - Vali õige mikrofon ja kõlarid/kõrvaklapid
4. **Oota ühendust** - Status peaks muutuma roheliseks "Valmis helistamiseks"

### Helistamine

1. **Sisesta number** - Kirjuta telefoninumber väljale või kasuta klahvistikku
2. **Kliki "Helista"** - Või vajuta Enter
3. **Räägi** - Kasuta kõrvaklappe heli jaoks

### Kiirklahvid

- **0-9, *, #** - Lisa numbritega
- **Enter** - Helista või lõpeta kõne
- **Escape** - Lõpeta kõne
- **Backspace** - Kustuta numbrid

## 🔧 Veaotsing

### "Twilio ei ole seadistatud"
- Kontrolli, et `.env` fail eksisteerib
- Veendu, et kõik muutujad on õigesti seadistatud
- Restardi server

### "Ühenduse viga"
- Kontrolli internetiühendust
- Veendu, et Twilio andmed on õiged
- Kontrolli Twilio konto krediiti

### Audio ei tööta
- Luba mikrofoni kasutamine brauseris
- Kontrolli audio seadmete valikut
- Testi teiste rakendustega

### Kõne ei õnnestu
- Kontrolli telefoninumbri formaati (+372xxxxxxxx)
- Veendu, et Twilio numbrile on piisavalt krediiti
- Kontrolli TwiML Application seadistust

## 💰 Kulud

Twilio helistamise kulud:
- **Väljaminevad kõned**: ~0.013$ minutis (USA-sse)
- **Euroopa**: ~0.02-0.05$ minutis
- **Eesti**: ~0.03$ minutis

Täpsed hinnad: [twilio.com/voice/pricing](https://www.twilio.com/voice/pricing)

## 🔒 Turvalisus

⚠️ **Hoiatus**: See rakendus on mõeldud **ainult isiklikuks kasutamiseks**!

- Ära jaga oma `.env` faili
- Ära pane seda avalikku internetti ilma lisaturvalisuseta
- Kasuta kohalikus võrgus või kaitstud serveris

## 📝 Litsents

MIT License - kasuta vabalt!

## 🆘 Abi

Kui midagi ei tööta:

1. Kontrolli logisid (lehele all)
2. Kontrolli brauseri konsooli (F12)
3. Vaata server logisid terminalis
4. Kontrolli Twilio Console'i logisid

---

**Tehtud ❤️ ga Eestis** 