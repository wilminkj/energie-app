export function InfoPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-2">Doel van de app</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Deze applicatie combineert SDE-subsidiedata, BAG-adresgegevens en EAN-allocatiepunten
            in één doorzoekbaar overzicht. Het kan gebruikt worden door iedereen die maar een deel van de gegevens heeft en graag een zo volledig mogelijk overzicht wil hebben op basis van wat er vrij op internet wordt aangeboden. Zoek op adres, SDE-nummer of EAN-code en bekijk alle
            energieaansluitingen en subsidiebeschikkingen in de buurt.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-2">Bronvermelding</h2>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>
              <strong>SDE-beschikkingen</strong> — Rijksdienst voor Ondernemend Nederland (RVO)
            </li>
            <li>
              <strong>Adresgegevens &amp; geocoding</strong> — Basisregistratie Adressen en Gebouwen (BAG)
              via PDOK / Kadaster
            </li>
            <li>
              <strong>EAN-codes &amp; allocatiepunten</strong> — Energie Data Services Nederland (EDSN)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-2">Over dit project</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Dit is een hobbyproject waar ik aan ben begonnen om mezelf bekend te maken met het maken van web-apps. De data wordt zo zorgvuldig mogelijk verwerkt, maar er
            kunnen geen rechten aan ontleend worden.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-2">Feedback &amp; suggesties</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Heb je een idee, opmerking of verbetersuggestie? Ik sta altijd open voor feedback.
            Neem gerust contact op door mij een email te sturen. Mijn achternaam is ook mijn emailadres en dan via Gmail.
            <br />
            <br />
            Jeroen Wilmink
          </p>
        </section>
      </div>
    </div>
  )
}
