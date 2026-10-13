# Lydbok-spiller

Passordbeskyttet lydbokspiller bygget på Cloudflare Workers + R2.

- Passordside, én side per lydbok, kapittelliste, spoling og hastighetsvalg.
- Nettleseren husker hvor du sluttet (fil + tid) per bok (localStorage, per enhet).
- Lydfilene ligger i R2 og strømmes via en Worker som krever innlogging. Alt er gratis for ca. 2 GB og 56 brukere.
- Brukerne trenger bare nettleseren og passordet.

## Oppsett steg for steg

### 1. Cloudflare-konto
1. Lag en gratis konto på https://dash.cloudflare.com/sign-up og bekreft e-posten.
2. I menyen: **Storage & databases → R2 object storage → Subscribe / Get started** (gratisplanen).
   Du må legge inn betalingskort, men det trekkes ikke noe under 10 GB.

### 2. Last ned koden
Du trenger **Node.js** (LTS, https://nodejs.org) og **git**.

```bash
git clone https://github.com/oyvindnilsoks-web/Audiobook-playsite.git
cd Audiobook-playsite
npm install -g wrangler
```
(Bytt til riktig gren med `git checkout <gren>` hvis ikke `main` finnes ennå.)

### 3. Logg inn og lag lagringsplass
```bash
wrangler login
wrangler r2 bucket create lydbok
```

### 4. Publiser siden
```bash
wrangler deploy
```
Den skriver adressen, f.eks. `https://lydbok.DITTNAVN.workers.dev`. Det er den du deler.

### 5. Sett passordet
```bash
wrangler secret put PASSWORD       # skriv: Eggeb2026.   (med punktum)
wrangler secret put TOKEN_SECRET   # skriv en lang tilfeldig tekst, ca. 40 tegn
```

### 6. Last opp lydfilene
Én mappe per bok i R2. For hver fil:
```bash
wrangler r2 object put lydbok/min-bok/kapittel01.mp3 --file "sti/til/kapittel01.mp3" --remote
```
Navnet (`min-bok/kapittel01.mp3`) må være likt `src` i `public/books.json`.
Maks ca. 300 MB per fil med denne kommandoen. For større filer eller mange filer: bruk `rclone` mot R2 (S3-kompatibelt, se Cloudflare-dokumentasjonen).

### 7. Legg inn bøkene
Rediger `public/books.json`:
```json
{
  "books": [
    {
      "id": "min-bok",
      "title": "Min bok",
      "author": "Forfatter",
      "files": [
        { "title": "Kapittel 1", "src": "min-bok/kapittel01.mp3" },
        { "title": "Kapittel 2", "src": "min-bok/kapittel02.mp3" }
      ]
    }
  ]
}
```
Publiser på nytt:
```bash
wrangler deploy
```

### 8. Test og del
Åpne adressen, logg inn, spill av, spol, lukk fanen og åpne igjen (skal fortsette der du slapp). Send adressen og passordet til brukerne.

## Senere
- **Ny bok:** last opp filene (steg 6), legg dem i `books.json`, kjør `wrangler deploy`.
- **Nytt passord:** `wrangler secret put PASSWORD`. Bytter du også `TOKEN_SECRET`, må alle logge inn på nytt.

## Struktur
- `public/` – siden (`index.html`, `app.js`, `books.json`)
- `src/worker.js` – innlogging og passordbeskyttet lydstrøm fra R2
- `wrangler.toml` – Cloudflare-oppsett

## Gratisgrenser (Cloudflare)
Workers: 100 000 forespørsler/dag og 10 ms CPU per forespørsel. R2: 10 GB lagring, ingen utgående trafikkavgift. Statiske filer teller ikke mot Workers-grensen.
