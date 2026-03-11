# Feature Implementation Plan: Hamburger Menu + Info Pagina

**Overall Progress:** `0%`

## TLDR
Hamburger menu toevoegen aan de header met twee items: "Energie Netwerk Overzicht" (huidige app) en "Info & feedback" (nieuwe informatiepagina). De info-pagina bevat het doel van de app, bronvermelding, hobbyproject-vermelding, en uitnodiging voor suggesties.

## Critical Decisions
- **Geen React Router**: slechts 2 pagina's, een `activePage` state in App.tsx volstaat
- **Geen extra dependencies**: hamburger-icoon en menu puur met Tailwind CSS
- **Click-outside sluit menu**: overlay-div patroon

## Tasks:

- [ ] 🟥 **Step 1: HamburgerMenu component**
  - [ ] 🟥 Maak `frontend/src/components/HamburgerMenu.tsx` met hamburger-icoon (3 streepjes), uitklapbaar paneel met overlay, en twee menu-items
  - [ ] 🟥 Props: `activePage`, `onNavigate` callback

- [ ] 🟥 **Step 2: InfoPage component**
  - [ ] 🟥 Maak `frontend/src/components/InfoPage.tsx` met: doel van de app, bronvermelding (RVO, PDOK/Kadaster, EDSN), hobbyproject-vermelding, uitnodiging voor feedback/suggesties

- [ ] 🟥 **Step 3: Integratie in App.tsx**
  - [ ] 🟥 Voeg `activePage` state toe (`'app' | 'info'`)
  - [ ] 🟥 Plaats HamburgerMenu in de header (links van de titel)
  - [ ] 🟥 Toon huidige app-content bij `'app'`, InfoPage bij `'info'`
