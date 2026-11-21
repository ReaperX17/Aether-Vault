# AetherVault — MTG Collection Manager & Commander Deck Builder

Live domains: **[aether-vault.com](https://aether-vault.com)** & **[aether-vault.net](https://aether-vault.net)**

AetherVault is a full-stack Magic: The Gathering inventory tracker, binder manager, and Commander deck builder with real-time Scryfall & Card Kingdom pricing, Archidekt-style section navigation, and official Wizards of the Coast Commander Bracket (1–5) & Community Salt Score analytics.

---

## Key Features

- **Strict Multi-User Account & Data Isolation**:
  - Salted `scrypt` password hashing (`node:crypto`) + cryptographic 256-bit session tokens (`user_sessions`).
  - Every user's card inventory, binders, folders, and decks are strictly scoped to their authenticated `user_id` on the server—no user can view, alter, or delete another user's collection or decks.
  - Shared high-speed Scryfall & Card Kingdom card metadata cache (`cards_cache` and `ck_prices`) so card lookups and price checks are instant for all users.
- **Collection & Binder Management**:
  - Track foil/etched/nonfoil printings, condition, binder location, and purchase price.
  - Real-time TCGplayer Market & Card Kingdom Retail/Buylist valuation.
  - Automatic cross-deck card allocation tracking (*Available* vs. *In Decks*).
- **Commander Deck Builder & Analytics**:
  - One-click add to deck or promote Legendary Creatures / Backgrounds to Commander directly from your collection.
  - Blown-up high-res card inspector with double-faced / transform card flip toggle (`🔄 Flip`) and Archidekt-style section-by-section navigation.
  - **Official WotC Commander Bracket (1–5) & Salt Score Engine**: Automatically detects Game Changers, Fast Mana, 2-Card Infinite Combos, Extra Turns, and Mass Land Denial.
- **Responsive Mobile & Desktop UI**:
  - 2-column binder grid and fixed bottom tab bar on mobile phones; full top navigation and multi-column workspace on desktop.

---

## Deploying Live to `aether-vault.com` & `aether-vault.net`

### Option A: One-Click Cloud Hosting (Render / Railway)

1. **Render.com**:
   - Sign in to [Render](https://render.com) → **New +** → **Blueprint** (or **Web Service**).
   - Connect your GitHub repository: `https://github.com/ReaperX17/Aether-Vault`.
   - Render automatically detects [`render.yaml`](./render.yaml), builds the Docker image, mounts the persistent SQLite disk at `/app/data`, and monitors `/api/health`.
   - In your Render service → **Settings → Custom Domains**, add:
     - `aether-vault.com` & `www.aether-vault.com`
     - `aether-vault.net` & `www.aether-vault.net`
   - Point your domain registrar's DNS (`A` and `CNAME` records) to the values Render provides. Render automatically provisions free SSL certificates.

2. **Railway.app**:
   - Sign in to [Railway](https://railway.com) → **New Project** → **Deploy from GitHub repo** (`ReaperX17/Aether-Vault`).
   - Add a **Volume** mounted at `/app/data` so your SQLite database persists across deploys.
   - Under **Settings → Networking → Custom Domains**, attach `aether-vault.com` and `aether-vault.net`.

---

### Option B: VPS / Dedicated Server with Docker Compose & Automatic HTTPS

If you are hosting on a Linux VPS (DigitalOcean Droplet, Hetzner, Linode, AWS Lightsail, etc.):

1. Point the DNS `A` records for `aether-vault.com`, `www.aether-vault.com`, `aether-vault.net`, and `www.aether-vault.net` to your server's public IPv4 address.
2. Clone the repository and start the stack:
   ```bash
   git clone https://github.com/ReaperX17/Aether-Vault.git
   cd Aether-Vault
   docker compose up -d --build
   ```
3. **Done!** Caddy ([`Caddyfile`](./Caddyfile)) automatically provisions and renews Let's Encrypt HTTPS certificates for both `aether-vault.com` and `aether-vault.net` and reverse-proxies traffic to the AetherVault container.

---

## Local Development

Requirements: **Node.js 22.5+** (uses native `node:sqlite`).

```bash
# Install dependencies
npm install

# Start development server at http://localhost:3000
npm run dev

# Build production frontend bundle
npm run build

# Run production server locally
npm start
```
