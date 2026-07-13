/*
 * 👀 Watch Buddy — the annotation graph.
 *
 * Hand-managed viewing notes for programs on the dial, kept separate from
 * the harvested lineup. JSON-LD-shaped: subjects are the programs' own
 * archive.org details URIs, vocabulary is schema.org plus a tiny tvp:
 * namespace, and fact-checks point at pages with quality discussion
 * (mostly Wikipedia). Edit freely — nothing here is generated.
 *
 * Three kinds of notes:
 *   contentWarning     — a specific heads-up, with its own emoji
 *   datedPerspectives  — true ⇒ the standard ⏳ notice is shown
 *   factCheck          — ClaimReview-style entries linking claims/topics
 *                        to places where they're examined properly
 */

const WATCH_BUDDY_CONTEXT = {
  "@vocab": "https://schema.org/",
  "tvp": "https://danbri.github.io/isle_of_glitch/tvp/ns#",
  "contentWarning": "tvp:contentWarning",
  "warningEmoji": "tvp:warningEmoji",
  "datedPerspectives": "tvp:datedPerspectives",
  "factCheck": "https://schema.org/subjectOf"
};

const WATCH_BUDDY_GRAPH = [

  /* ── Creature Feature ── */
  {
    "@id": "https://archive.org/details/house_on_haunted_hill_ipod",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "😱", "text": "Opens with realistic sound of a woman screaming. 😱" },
    "sameAs": "https://en.wikipedia.org/wiki/House_on_Haunted_Hill"
  },
  {
    "@id": "https://archive.org/details/Night.Of.The.Living.Dead_1080p",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "😨", "text": "Sustained siege horror, flesh-eating ghouls, and a bleak ending that genuinely shocked 1968 audiences." },
    "sameAs": "https://en.wikipedia.org/wiki/Night_of_the_Living_Dead"
  },
  {
    "@id": "https://archive.org/details/Nosferatu_most_complete_version_93_mins.",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "👻", "text": "Slow, creeping dread. Silent — but the shadows do the screaming." },
    "sameAs": "https://en.wikipedia.org/wiki/Nosferatu"
  },
  {
    "@id": "https://archive.org/details/CarnivalofSouls",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "🙀", "text": "Dreamlike dread, staring pale figures, and a relentless organ score that does most of the haunting. 🎻" },
    "sameAs": "https://en.wikipedia.org/wiki/Carnival_of_Souls"
  },
  {
    "@id": "https://archive.org/details/BloodyPitOfHorror",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "😱", "text": "Lurid 1960s shock-horror: torture-dungeon theatrics, menaced models, and gore by the bucket." }
  },
  {
    "@id": "https://archive.org/details/Horror_Hotel",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "👻", "text": "Witch-cult rituals and sacrificial menace in the fog." }
  },
  {
    "@id": "https://archive.org/details/white_zombie",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "👻", "text": "Hypnotic menace and the walking dead, 1932-style." },
    "datedPerspectives": true,
    "sameAs": "https://en.wikipedia.org/wiki/White_Zombie_(film)"
  },
  {
    "@id": "https://archive.org/details/ABucketofBlood",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "😳", "text": "Beatnik black comedy in which the sculptures are… not sculptures. 🎷" }
  },

  /* ── Screwball Screen ── */
  {
    "@id": "https://archive.org/details/his_girl_friday",
    "@type": "Movie",
    "contentWarning": { "warningEmoji": "😲", "text": "A subplot turns on a death sentence and a suicide attempt — played at screwball speed." },
    "sameAs": "https://en.wikipedia.org/wiki/His_Girl_Friday"
  },
  {
    "@id": "https://archive.org/details/tarzan_and_the_green_goddess",
    "@type": "Movie",
    "datedPerspectives": true
  },
  {
    "@id": "https://archive.org/details/mclintok_widescreen",
    "@type": "Movie",
    "datedPerspectives": true,
    "sameAs": "https://en.wikipedia.org/wiki/McLintock!"
  },

  /* ── Cartoon Classics ── */
  {
    "@id": "https://archive.org/details/BettyBoopCartoons",
    "@type": "Movie",
    "datedPerspectives": true
  },

  /* ── Tube Classics ── */
  {
    "@id": "https://archive.org/details/theloneranger_201705",
    "@type": "TVSeries",
    "datedPerspectives": true,
    "sameAs": "https://en.wikipedia.org/wiki/The_Lone_Ranger_(TV_series)"
  },

  /* ── Picture Palace ── */
  {
    "@id": "https://archive.org/details/TheMartyrsoftheAlamo",
    "@type": "Movie",
    "datedPerspectives": true,
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "This film's version of the Alamo story",
        "name": "The film's demonizing depiction of Mexicans is well documented — and the Alamo's history is far messier than the myth.",
        "url": "https://en.wikipedia.org/wiki/Martyrs_of_the_Alamo"
      },
      {
        "@type": "ClaimReview",
        "claimReviewed": "What actually happened at the Alamo",
        "name": "Battle of the Alamo — the history behind the legend",
        "url": "https://en.wikipedia.org/wiki/Battle_of_the_Alamo"
      }
    ]
  },

  /* ── Retro Vault ── */
  {
    "@id": "https://archive.org/details/DuckandC1951",
    "@type": "Movie",
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "Ducking and covering offers meaningful protection in a nuclear attack",
        "name": "Partly true, mostly complicated — the long-running debate is laid out well here.",
        "url": "https://en.wikipedia.org/wiki/Duck_and_cover"
      }
    ],
    "sameAs": "https://en.wikipedia.org/wiki/Duck_and_Cover_(film)"
  },
  {
    "@id": "https://archive.org/details/AboutBan1935",
    "@type": "Movie",
    "datedPerspectives": true,
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "The cheerful banana-plantation story this film tells",
        "name": "The United Fruit Company's actual record in Central America has substantial critical history.",
        "url": "https://en.wikipedia.org/wiki/United_Fruit_Company"
      }
    ]
  },
  {
    "@id": "https://archive.org/details/HomeEcon1951",
    "@type": "Movie",
    "datedPerspectives": true
  },
  {
    "@id": "https://archive.org/details/babies_and_breadwinners_2",
    "@type": "Movie",
    "datedPerspectives": true
  },

  /* ── Newsreel Nine ── */
  {
    "@id": "https://archive.org/details/1945-04-26_Nazi_Murder_Mills",
    "@type": "NewsArticle",
    "contentWarning": { "warningEmoji": "😨", "text": "Actual concentration-camp footage filmed at liberation, shown to 1945 audiences as proof. Genuinely distressing — this is the real thing." },
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "What these newsreels documented",
        "name": "The liberation of the Nazi camps, with historical context",
        "url": "https://en.wikipedia.org/wiki/Liberation_of_Nazi_concentration_camps"
      }
    ]
  },
  {
    "@id": "https://archive.org/details/1946-08-05_Jap_Films_of_Hiroshima",
    "@type": "NewsArticle",
    "contentWarning": { "warningEmoji": "😨", "text": "Aftermath footage from Hiroshima. The period title uses a slur that was routine in 1946 newsreels." },
    "datedPerspectives": true,
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "The bombing and its aftermath",
        "name": "Atomic bombings of Hiroshima and Nagasaki — effects, casualties and the debates since",
        "url": "https://en.wikipedia.org/wiki/Atomic_bombings_of_Hiroshima_and_Nagasaki"
      }
    ]
  },
  {
    "@id": "https://archive.org/details/1946-07-08_First_Pictures_Atomic_Blast",
    "@type": "NewsArticle",
    "contentWarning": { "warningEmoji": "😲", "text": "Triumphal 1946 framing of a nuclear weapons test." },
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "The Bikini Atoll tests shown here",
        "name": "Operation Crossroads — what the newsreel didn't mention, including the displaced Bikini islanders",
        "url": "https://en.wikipedia.org/wiki/Operation_Crossroads"
      }
    ]
  },
  {
    "@id": "https://archive.org/details/1962-10-22_The_Red_Threat",
    "@type": "NewsArticle",
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "The blockade announcement and how close things actually came",
        "name": "Cuban Missile Crisis — the fuller declassified picture",
        "url": "https://en.wikipedia.org/wiki/Cuban_Missile_Crisis"
      }
    ]
  },
  {
    "@id": "https://archive.org/details/1937-12-12_Bombing_of_USS_Panay",
    "@type": "NewsArticle",
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "The Panay incident as reported in 1937",
        "name": "USS Panay incident — background and aftermath",
        "url": "https://en.wikipedia.org/wiki/USS_Panay_incident"
      }
    ]
  },

  /* ── Moon TV ── */
  {
    "@id": "https://archive.org/details/youtube-S9HdPi9Ikhk",
    "@type": "Movie",
    "factCheck": [
      {
        "@type": "ClaimReview",
        "claimReviewed": "\"The moon landing was faked\"",
        "name": "It wasn't — the conspiracy claims and their debunkings, itemized.",
        "url": "https://en.wikipedia.org/wiki/Moon_landing_conspiracy_theories"
      },
      {
        "@type": "ClaimReview",
        "claimReviewed": "What you're watching",
        "name": "Apollo 11 — the mission this restored television came from",
        "url": "https://en.wikipedia.org/wiki/Apollo_11"
      }
    ]
  }
];
