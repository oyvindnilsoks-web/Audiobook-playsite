# Lydbok-spiller

Passordbeskyttet statisk side med én side per lydbok. Husker hvor du sluttet (fil + tid) i nettleseren (localStorage).

## Legge til bøker
Rediger `books.json`. `baseUrl` peker på mappa på Umbrel-serveren som inneholder lydfilene; `src` er relativ til den (eller full URL).

## Spille fra Umbrel
Lydfilene må kunne nås fra nettleseren din:
- **Kun hjemme/VPN:** Åpne siden via Tailscale (installer Tailscale-appen på Umbrel og telefon). Bruk `http://<umbrel-tailscale-navn>/...`. Siden kan da også ligge på Umbrel selv (f.eks. i en nginx/File Browser-mappe).
- **Fra hvor som helst:** Cloudflare Tunnel (eller Tailscale Funnel) gir HTTPS-adresse til en mappe på Umbrel.
- Hvis siden hostes på HTTPS (Netlify/GitHub Pages), MÅ lydadressen også være HTTPS (ellers blokkerer nettleseren «mixed content»).
- Servere som støtter HTTP Range (nginx, File Browser) gir hopping/spoling i lydfilene.

## Sikkerhet
Passordsjekken er klientside (hash i `app.js`): den holder folk ute av siden, men ikke fra lydfilene hvis noen kjenner URL-en. For ekte beskyttelse: legg basic-auth foran lydmappa på Umbrel/tunnelen, eller kjør hele siden fra Umbrel bak Tailscale.
