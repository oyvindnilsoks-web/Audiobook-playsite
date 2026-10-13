# Lydbok-spiller (Cloudflare Workers + R2)

Passordbeskyttet lydbokspiller. Én side per bok, husker plassering i nettleseren (localStorage). Lydfilene ligger i R2 og strømmes via en Worker som krever passord (støtter spoling). Alt gratis for ~2 GB og 56 brukere.

## Oppsett (én gang)
```bash
npm i -g wrangler
wrangler login
wrangler r2 bucket create lydbok
wrangler secret put PASSWORD        # skriv: Eggeb2026.
wrangler secret put TOKEN_SECRET    # skriv en lang tilfeldig tekst
wrangler deploy                     # gir deg adressen, f.eks. lydbok.<navn>.workers.dev
```
(`wrangler secret put` kan kjøres før første deploy; svarer du ja til å opprette Worker, går det fint.)

## Laste opp lydfiler
```bash
wrangler r2 object put lydbok/min-bok/kapittel01.mp3 --file ./kapittel01.mp3 --remote
```
Alternativt: Cloudflare-dashboard → R2 → lydbok → Upload (filer under ~300 MB), eller `rclone` med R2 for mange filer.

## Legge til bok
Rediger `public/books.json`: `src` er nøkkelen i R2 (f.eks. `min-bok/kapittel01.mp3`). Kjør `wrangler deploy` på nytt.

## Bytte passord
`wrangler secret put PASSWORD` (og endre gjerne `TOKEN_SECRET` for å logge ut alle).
