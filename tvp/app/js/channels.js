/*
 * TVP/2007 — channel lineup
 *
 * Every program is free/open content streamed from the Internet Archive:
 * Blender Foundation open movies (CC-BY) and public-domain film.
 * Durations (seconds) come from archive.org derivative metadata and drive
 * the wall-clock "broadcast" scheduler, so each channel is always
 * "showing something" just like 2007-era Joost.
 */

const ARCHIVE = "https://archive.org/download/";
const ART = "https://archive.org/services/img/";

const CHANNELS = [
  {
    num: 1,
    id: "animation-station",
    name: "Animation Station",
    category: "Cartoons & Animation",
    tagline: "Round-the-clock open-source toons",
    art: ART + "BigBuckBunny_124",
    programs: [
      {
        title: "Big Buck Bunny",
        year: 2008,
        dur: 596.5,
        src: ARCHIVE + "BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        desc: "A giant rabbit takes gentle revenge on three bullying rodents. Blender Open Movie #2 (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      },
      {
        title: "Caminandes: Llama Drama",
        year: 2013,
        dur: 90,
        src: ARCHIVE + "Caminandes1LlamaDrama/01_llama_drama_1080p.mp4",
        desc: "Koro the llama versus a very inconvenient fence in windy Patagonia (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      },
      {
        title: "Caminandes: Gran Dillama",
        year: 2013,
        dur: 146,
        src: ARCHIVE + "Caminandes2GranDillama/02_gran_dillama_1080p.mp4",
        desc: "Koro discovers the grass really is greener on the other side of the road (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      }
    ]
  },
  {
    num: 2,
    id: "open-cinema",
    name: "Open Cinema",
    category: "Film",
    tagline: "The Blender open movie channel",
    art: ART + "Sintel",
    programs: [
      {
        title: "Elephants Dream",
        year: 2006,
        dur: 653.8,
        src: ARCHIVE + "ElephantsDream/ed_1024_512kb.mp4",
        desc: "Two strange characters explore an infinite machine. The very first open movie (CC-BY).",
        license: "CC-BY 2.5 · Blender Foundation"
      },
      {
        title: "Sintel",
        year: 2010,
        dur: 888,
        src: ARCHIVE + "Sintel/sintel-2048-stereo_512kb.mp4",
        desc: "A lone girl crosses a hostile world searching for the dragon she once rescued (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      },
      {
        title: "Tears of Steel",
        year: 2012,
        dur: 734.1,
        src: ARCHIVE + "Tears-of-Steel/tears_of_steel_720p.mp4",
        desc: "In a future Amsterdam, scientists restage an old heartbreak to save the world from robots (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      },
      {
        title: "Cosmos Laundromat: First Cycle",
        year: 2015,
        dur: 730.6,
        src: ARCHIVE + "CosmosLaundromatFirstCycle/Cosmos%20Laundromat%20-%20First%20Cycle%20%281080p%29.mp4",
        desc: "A suicidal sheep named Franck is offered any life he wants by a mysterious salesman (CC-BY).",
        license: "CC-BY 3.0 · Blender Foundation"
      },
      {
        title: "Spring",
        year: 2019,
        dur: 464.2,
        src: ARCHIVE + "springopenmovie/springopenmovie.mp4",
        desc: "A shepherd girl and her dog face ancient spirits to continue the cycle of life (CC-BY).",
        license: "CC-BY 4.0 · Blender Foundation"
      }
    ]
  },
  {
    num: 3,
    id: "cartoon-classics",
    name: "Cartoon Classics",
    category: "Kids",
    tagline: "Hand-drawn wonders, 1911–1941",
    art: ART + "Gertie",
    programs: [
      {
        title: "Little Nemo",
        year: 1911,
        dur: 634.2,
        src: ARCHIVE + "LittleNemo_548/LittleNemo_512kb.mp4",
        desc: "Winsor McCay's pioneering hand-tinted animation of his Slumberland comic strip (public domain).",
        license: "Public domain"
      },
      {
        title: "Gertie the Dinosaur",
        year: 1914,
        dur: 738.6,
        src: ARCHIVE + "Gertie/GertietheDinosaur.mp4",
        desc: "The first cartoon star ever: Gertie obeys (mostly) her creator Winsor McCay (public domain).",
        license: "Public domain"
      },
      {
        title: "Steamboat Willie",
        year: 1928,
        dur: 442.4,
        src: ARCHIVE + "SteamboatWillie/Steamboat%20Willie.mp4",
        desc: "The synchronized-sound sensation that launched a mouse (public domain since 2024).",
        license: "Public domain"
      },
      {
        title: "Superman: The Mechanical Monsters",
        year: 1941,
        dur: 613.8,
        src: ARCHIVE + "SupermanTheMechanicalMonsters1941/Superman%20-%20The%20Mechanical%20Monsters%20%281941%29.mp4",
        desc: "Fleischer Studios' art-deco Superman battles a squadron of robot bank-robbers (public domain).",
        license: "Public domain"
      }
    ]
  },
  {
    num: 4,
    id: "creature-feature",
    name: "Creature Feature",
    category: "Cult",
    tagline: "Late-night chills, all night",
    art: ART + "Night.Of.The.Living.Dead_1080p",
    programs: [
      {
        title: "Night of the Living Dead",
        year: 1968,
        dur: 5752.7,
        src: ARCHIVE + "Night.Of.The.Living.Dead_1080p/NightOfTheLivingDead_1080p_512kb.mp4",
        desc: "George A. Romero's farmhouse siege that invented the modern zombie (public domain).",
        license: "Public domain"
      },
      {
        title: "House on Haunted Hill",
        year: 1959,
        dur: 4483.2,
        src: ARCHIVE + "house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4",
        desc: "Vincent Price offers five guests $10,000 each to survive a night in his haunted mansion (public domain).",
        license: "Public domain"
      }
    ]
  },
  {
    num: 5,
    id: "screwball-screen",
    name: "Screwball Screen",
    category: "Comedy",
    tagline: "Fast talk from the golden age",
    art: ART + "his_girl_friday",
    programs: [
      {
        title: "His Girl Friday",
        year: 1940,
        dur: 5504.5,
        src: ARCHIVE + "his_girl_friday/his_girl_friday_512kb.mp4",
        desc: "Cary Grant and Rosalind Russell trade the fastest dialogue ever filmed (public domain).",
        license: "Public domain"
      }
    ]
  },
  {
    num: 6,
    id: "retro-vault",
    name: "Retro Vault",
    category: "Documentary",
    tagline: "Ephemeral films from the Prelinger vaults",
    art: ART + "DuckandC1951",
    programs: [
      {
        title: "Duck and Cover",
        year: 1951,
        dur: 555.4,
        src: ARCHIVE + "DuckandC1951/DuckandC1951_512kb.mp4",
        desc: "Bert the Turtle teaches Cold-War America civil defense (public domain, Prelinger Archives).",
        license: "Public domain · Prelinger Archives"
      },
      {
        title: "The Home Economics Story",
        year: 1951,
        dur: 748.4,
        src: ARCHIVE + "HomeEcon1951/HomeEcon1951_512kb.mp4",
        desc: "A gloriously earnest recruiting film for 1950s home economics degrees (public domain, Prelinger Archives).",
        license: "Public domain · Prelinger Archives"
      }
    ]
  },
  {
    num: 7,
    id: "moon-tv",
    name: "Moon TV",
    category: "Science & Tech",
    tagline: "One small step, on a loop",
    art: ART + "youtube-S9HdPi9Ikhk",
    programs: [
      {
        title: "Apollo 11 Moonwalk (Restored)",
        year: 1969,
        dur: 10950,
        src: ARCHIVE + "youtube-S9HdPi9Ikhk/S9HdPi9Ikhk.mp4",
        desc: "NASA's restored original EVA television: three hours on the Sea of Tranquility (public domain).",
        license: "Public domain · NASA"
      }
    ]
  }
];

/* EPG category rail — names echo the 2007 client's channel catalog */
const EPG_CATEGORIES = [
  { id: "explore", label: "Explore", icon: "◉" },
  { id: "my", label: "My Channels", icon: "★" },
  { id: "Cartoons & Animation", label: "Cartoons & Animation", icon: "✎" },
  { id: "Film", label: "Film", icon: "🎬" },
  { id: "Kids", label: "Kids", icon: "☺" },
  { id: "Cult", label: "Cult", icon: "☠" },
  { id: "Comedy", label: "Comedy", icon: "☻" },
  { id: "Documentary", label: "Documentary", icon: "▤" },
  { id: "Science & Tech", label: "Science & Tech", icon: "☄" }
];

/* Broadcast epoch: 16 Jan 2007, the day The Venice Project became "Joost". */
const BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);
