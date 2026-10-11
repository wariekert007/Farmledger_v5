# FarmLedger: put it on GitHub and install it

FarmLedger installs like an app on your phone or computer and works offline. Your records are stored only on the device. They never go to GitHub or anywhere else. They leave the device only when you save an Excel file, a PDF report or a backup.

GitHub Pages is used once, to deliver the app to your device. It hosts only the app itself, never your farm records.

## 1. Put the app on GitHub Pages (on your PC, about 10 minutes, one time only)

1. Unzip **farmledger.zip** on your PC.
2. Go to https://github.com and sign in.
3. Click **+** (top right) and choose **New repository**.
   - Repository name: `Farmledger_v2`
   - Choose **Public**. Free GitHub Pages needs this. Only the app code is public, never your records.
   - Click **Create repository**.
4. On the new page, click the **uploading an existing file** link.
5. Open the unzipped folder and select **everything inside it**: `index.html`, `app.js`, `i18n.js`, `export.js`, `sw.js`, `manifest.webmanifest`, `INSTALL.md` and the **icons** folder. Drag them all onto the GitHub page, then click **Commit changes**.
   - Check that the list on GitHub shows an `icons` folder. If it doesn't, click **Add file → Upload files**, drag the `icons` folder in and commit again.
6. Go to **Settings → Pages** (in the left menu).
   - Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
7. Wait 1–2 minutes, then refresh the page. It shows your app link:
   `https://wariekert007.github.io/Farmledger_v2/`

## 2. Install it

**Android phone (Chrome)**
1. Open the link in **Chrome**. If you send it to yourself on WhatsApp, open it in Chrome, not inside WhatsApp.
2. Tap the **Install** button at the top of the app, or Chrome's **⋮ → Install app** (or **Add to Home screen**).
3. Open **FarmLedger** from your home screen.

**iPhone (Safari)**
1. Open the link in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.

**Computer (Chrome or Edge)**
1. Open the link.
2. Click the install icon at the right of the address bar (a small screen with an arrow), or the **Install** button in the app.

After the first visit, the app works without signal.

## Using it

- **First time:** choose your language (English or Afrikaans), your farm name and the kinds of farming you do (for example beef cattle, sheep, maize and fodder). The app then shows the right income and expense categories, livestock and crops for your farm.
- **Money:** record income and expenses with a category, the farming branch and who you paid or were paid by. If you are VAT-registered, the app works out the VAT.
- **Fuel:** record diesel and petrol separately from other expenses: litres, rand and whether it was used for farming (off-road) or on the road. Fuel is still counted in your total expenses in reports.
- **Rain:** enter mm from your rain gauge. You see this month, the season total and a 12-month chart.
- **Diary:** write a few lines each day. Home shows a reminder until you have written today's entry.
- **Farm:** keep livestock numbers (start with a count, then record births, purchases, sales, deaths, slaughter and stock theft) and crop plantings, including crops grown as feed for your own animals.
- **Fuel used:** on the Fuel tab, tap **Fuel used** every time you fill a tractor or machine: litres, what it was poured into and the main job it did afterwards. This builds the usage log SARS asks for with a diesel refund, and the reports show litres per machine and per job.
- **Slip photos:** when you add income, an expense or a fuel purchase, take a photo of the slip or invoice, or tick **I will add the photo later**. Home shows how many slips still need a photo. Tap it to add them.
- **Camps & lands:** under **Farm**, add your camps and lands with their hectares. Link expenses, fuel used, crops, rain gauges and animal moves to them to see the cost per hectare and the grazing history of each camp.
- **Animal health:** record a **sick animal** (with its name, number or a description), what is wrong and the medicine given. When it recovers, tap **Healthy again** and the app writes it in that day's diary. Also record dosing, vaccinations and dipping, with withdrawal periods and the date of the next treatment. Home reminds you when something is due and warns you when animals are still in a withdrawal period.
- **Repeating payments:** salaries, rent and insurance are added automatically every month (**Money → Repeating every month**, or tick **Repeat every month** on a new entry).
- **Day workers:** under **Money → Day workers**, add the people you pay per day with their day rate. Record each work day (tap a name once for a full day, twice for half a day) and either tick **Paid them today** or pay later with the **Pay** button. The wages go into your expenses automatically.
- **Cash, EFT or card:** every income, expense and fuel purchase records how it was paid. Reports show the total income and expenses with the cash / EFT / card split underneath.
- **Cash tracker** (**Money → Cash tracker**): shows how much cash you should have on hand. Record cash you bank or draw. Now and then, count your cash and enter it with **Count**.
- **Bank check list** (**Money → Bank check list**): every EFT and card payment, plus cash banked or drawn, for the month. Tick each line when you find it on your bank statement.
- **Reports:** pick a period (this month, this tax year, and so on) and save an **Excel** file (every record, on separate sheets) or a **PDF** report you can print or send to your bank or accountant.

### Daily diary reminder on your phone

A web app can't ring a daily alarm by itself. Go to **Settings → Daily diary reminder** and tap **Google Calendar** (Android) or **Calendar file (.ics)** (iPhone, Outlook, Samsung Calendar). This adds a daily repeating calendar event that pops up on your phone. You only need to do this once.

## Important

- Records live only in the app on this device. They are deleted if you uninstall the app or clear the browser's data for the site, and they don't move to a new phone by themselves.
- **Make a backup regularly:** **Reports → Save backup** (or **Settings → Backup**). Keep the backup file on your PC or Google Drive, or email it to yourself. On a new phone, install the app and tap **Restore a backup**. The app reminds you when your last backup is more than 30 days old.
- The Excel and PDF files are for reading and sending. Only the **backup** file (.json) can be loaded back into the app. The backup includes your slip photos, so it gets bigger as you add photos.
- **Updating the app later:** upload the changed files to the same GitHub repository. Also open `sw.js` and change the version number at the top (for example `farmledger-v2` to `farmledger-v3`), or phones keep the old version. The phone picks up the new version the next time you open the app with signal. Your records are kept.
