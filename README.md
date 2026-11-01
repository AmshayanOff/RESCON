# RESCON SE website

```
frontend/   static site (index.html, config.js, assets/)
backend/    Node.js + Express API (login, saving content, image uploads)
render.yaml Render blueprint for the backend
```

The admin area works through the backend: email + password login (checked on the
server, password hashed, 8-hour session, login rate-limited). Visitors see no admin
button; there is a small "Admin" link in the footer.

## Option A: everything on Render (simplest, one service)
1. Push this folder to a GitHub repo.
2. Render → New → Web Service → pick the repo. Root Directory: `backend`.
   Build: `npm install`   Start: `npm start`   (or use "Blueprint" with render.yaml)
3. Environment variables:
   - `ADMIN_EMAIL`    your admin email
   - `ADMIN_PASSWORD` a NEW long unique password (not the one shared in chat)
   - `JWT_SECRET`     a long random string
4. Deploy. Open the Render URL: the site is served by the same service,
   so `frontend/config.js` stays `window.RESCON_API = "";`.

## Option B: frontend on Vercel, backend on Render
1. Deploy the backend on Render as above, and add `FRONTEND_ORIGIN` = your Vercel URL
   (for example `https://rescon.vercel.app`; no trailing slash).
2. Edit `frontend/config.js`:  `window.RESCON_API = "https://YOUR-SERVICE.onrender.com";`
3. Vercel → Add New Project → import the repo → **Root Directory: `frontend`**,
   Framework: Other (no build command). Deploy.
4. Add your own domain in Vercel → Settings → Domains.

## Run locally
```
cd backend
cp .env.example .env     # fill in values
npm install
npm start                # open http://localhost:3000
```

## Important
- **Storage:** content is saved in `site.json` and uploads in `uploads/` inside `DATA_DIR`.
  On Render's free plan the disk is wiped on each redeploy and when the service sleeps/restarts,
  so edits and uploaded photos can disappear. For real use, add a Render persistent disk
  (paid; see render.yaml) or move to a database / Cloudinary or S3 for images.
- Defaults (text, logo, leader photo) are built into `frontend/index.html`; the admin's saved
  edits are layered on top. To reset, delete `site.json`.
- Change the admin password: update `ADMIN_PASSWORD` in Render and redeploy.
- Keep `.env` out of Git (already in `.gitignore`).
