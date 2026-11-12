# Google Sheets order export

Each order made by our COD form is written as one row at the bottom of a Google Sheet tab, in the same columns the Releasit app uses, so the team's sheet and its scripts keep working.

Columns: date, order number, product and variant, SKU, price, recipient, address, phone, city.

## One-time setup (owner)

1. Google Cloud console, project of your choice:
   - APIs & Services → Library → enable **Google Sheets API**.
   - OAuth consent screen → External → publish to **In production** (in "Testing", Google expires the access after 7 days and the export stops).
   - Credentials → Create credentials → **OAuth client ID** → Web application.
     Authorized redirect URI: `https://svelte-commerce-rosy.vercel.app/api/integrations/google/oauth/callback`
2. Vercel → Production env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redeploy.
3. After the merge, re-register the background jobs: open `/api/inngest` on the app and send the PUT (new job `sheets-export-order`).
4. App → Paramètres → Intégrations → **Google Sheets** card:
   - Connecter un compte Google (the account must be able to edit the sheet). Google shows an "unverified app" warning until the app is verified; choose Advanced → continue.
   - Paste the sheet link → Ouvrir → pick the tab (Odes: `Odes `, with the trailing space) → Utiliser cet onglet. Or create a new sheet.
   - Activer l'export.

## How it works

- `POST /api/public/cod` creates the Shopify order, then sends the Inngest event `sheets/order.export` (orgId, order gid). The customer never waits on Google.
- Job `sheets-export-order`: one at a time per store, 6 retries. It reads the order from Shopify and appends with `valueInputOption=RAW` so `+2120…` and `#79950` stay text.
- Idempotent: the audit log action `sheets.row_appended` (entityId = order gid) is checked first, so an order is never written twice.
- Failures are logged as `sheets.row_failed`; the card shows how many orders are missing and has a **Renvoyer** button.
- Revoked Google access → status `unverified`, the card asks to reconnect.

## Public app notes

- The `spreadsheets` scope is "sensitive": a public app needs Google's OAuth verification (privacy policy, demo video). An alternative with less review is `drive.file` + Google Picker, which only reaches sheets the merchant picks or the app creates.
- Today only form orders are exported. Exporting every Shopify order is a small step: call the same event from the `orders/create` webhook.
