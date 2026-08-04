# Chance Publishers Website

This is the complete working website project for Chance Publishers Limited.

## Open the project in VS Code

Open this folder:

`/Users/andrewmwendwa/chance-publishers`

Do not open only one HTML file. Open the whole `chance-publishers` folder so VS Code can see the pages, images, styles and project settings together.

## Start the website

Open **Terminal → New Terminal** in VS Code, then run:

```sh
npm run dev
```

Open the address shown in the terminal. It is normally:

`http://localhost:4321/`

Press `Control + C` in the terminal when you want to stop the local website.

## Where to edit

- Homepage: `src/pages/index.astro`
- Books: `src/pages/books/`
- Authors: `src/pages/authors.astro`
- Launches: `src/pages/launches.astro`
- Reading Room Studio: `src/pages/podcast.astro`
- Contact: `src/pages/contact.astro`
- Publishing process, ISBN, copyright, printing and services guide: `src/pages/publish.astro`
- Publishing packages: `src/pages/packages/[tier].astro`
- Package wording and prices: `src/data/packages.js`
- Header and menus: `src/components/Navbar.astro`
- Shared page layout and footer: `src/layouts/InnerPage.astro`
- Search-engine instructions: `public/robots.txt`
- Search-engine page list: `public/sitemap.xml`

## Images

Website images are stored in:

`public/Images/`

The main folders are:

- `public/Images/brand/` — Chance Publishers logo
- `public/Images/covers/` — book covers
- `public/Images/launch/` — launch and author photographs
- `public/Images/backgrounds/` — studio and section backgrounds

When replacing an image, keep the same filename and file type if you do not want to edit the code. If the filename changes, update the matching `/Images/...` address in the relevant `.astro` page.

## Check the finished project

Run this before uploading the website:

```sh
npm run build
```

The upload-ready website will be created inside the `dist/` folder.

## Important contact details currently used

- Phone and WhatsApp: `+254 758 305 622`
- Email: `info@chancepublishers.com`
- Office: Kenda House, 4th Floor, Tom Mboya Street, Nairobi
- Opening hours: Monday–Sunday, 6:00 a.m.–9:00 p.m.

## Search visibility

The website includes page titles, descriptions, canonical links, social-sharing metadata, a sitemap and LocalBusiness structured data. The structured data uses the verified Nairobi address and opening hours. Google Maps coordinates can be added later when the exact map pin is available.

After the website is live, submit `https://chancepublishers.com/sitemap.xml` in Google Search Console and verify the Chance Publishers Google Business Profile. Search placement is earned over time and cannot be guaranteed by code alone.

The website starts in light mode. Visitors can switch between light and dark mode using the button in the header.
