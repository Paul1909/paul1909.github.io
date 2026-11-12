// Song pools for the three levels. Titles must match Apple Music's titles
// (suffixes like "(Remastered 2011)" or "- Live at Wembley" are ignored when matching).
// Each game picks 10 songs from the chosen level; wrong answers come from the same level.
// Keep at least 14 songs per level.
const LEVELS = {
  easy: {
    name: 'Easy',
    answer: 'A little bit',
    blurb: 'The big hits everyone knows',
    songs: [
      "Bohemian Rhapsody", "Another One Bites the Dust", "Don't Stop Me Now", "We Will Rock You",
      "We Are the Champions", "Somebody to Love", "Under Pressure", "Radio Ga Ga",
      "I Want to Break Free", "Killer Queen", "Crazy Little Thing Called Love", "Fat Bottomed Girls",
      "Bicycle Race", "A Kind of Magic", "Who Wants to Live Forever", "The Show Must Go On",
      "I Want It All", "You're My Best Friend", "Love of My Life", "These Are the Days of Our Lives",
      "Innuendo", "Friends Will Be Friends", "Princes of the Universe", "Too Much Love Will Kill You",
      "Hammer to Fall", "One Vision",
    ],
  },
  medium: {
    name: 'Medium',
    answer: 'I know them a lot',
    blurb: 'Lesser-known singles and album tracks',
    songs: [
      "Seven Seas of Rhye", "Keep Yourself Alive", "Stone Cold Crazy", "Now I'm Here",
      "Tie Your Mother Down", "Spread Your Wings", "Save Me", "Play the Game",
      "It's a Hard Life", "Breakthru", "Headlong", "Good Old-Fashioned Lover Boy",
      "'39", "Brighton Rock", "Sheer Heart Attack", "I'm in Love with My Car",
      "Death on Two Legs", "The Prophet's Song", "Dragon Attack", "Mustapha",
      "Body Language", "Calling All Girls", "Las Palabras de Amor", "Back Chat",
      "Heaven for Everyone", "A Winter's Tale", "I Was Born to Love You", "Scandal",
      "The Miracle", "Ride the Wild Wind", "Is This the World We Created...?", "Doing All Right",
      "Liar", "Get Down, Make Love", "Let Me Entertain You", "Jealousy",
    ],
  },
  hard: {
    name: 'Hard',
    answer: "I'm the number one fan",
    blurb: 'Rarities, deep cuts and live recordings',
    liveRounds: 4, // how many of the 10 rounds use a live recording
    songs: [
      "Ogre Battle", "The Fairy Feller's Master-Stroke", "Nevermore", "The March of the Black Queen",
      "Funny How Love Is", "White Queen (As It Began)", "Father to Son", "Great King Rat",
      "My Fairy King", "The Night Comes Down", "Jesus", "Lily of the Valley",
      "Tenement Funster", "Flick of the Wrist", "Misfire", "Bring Back That Leroy Brown",
      "She Makes Me (Stormtrooper in Stilettos)", "Dear Friends", "Sweet Lady", "Seaside Rendezvous",
      "Lazing on a Sunday Afternoon", "Good Company", "The Millionaire Waltz", "You and I",
      "White Man", "Teo Torriatte (Let Us Cling Together)", "Sleeping on the Sidewalk", "Who Needs You",
      "It's Late", "My Melancholy Blues", "Fight from the Inside", "Dead on Time",
      "In Only Seven Days", "Dreamer's Ball", "Fun It", "Leaving Home Ain't Easy",
      "More of That Jazz", "Coming Soon", "Sail Away Sweet Sister", "Rock It (Prime Jive)",
      "Need Your Loving Tonight", "Put Out the Fire", "Life Is Real (Song for Lennon)", "Cool Cat",
      "Tear It Up", "Machines (Or 'Back to Humans')", "Man on the Prowl", "Pain Is So Close to Pleasure",
      "Don't Lose Your Head", "Gimme the Prize (Kurgan's Theme)", "Rain Must Fall", "Was It All Worth It",
      "Khashoggi's Ship", "My Baby Does Me", "Party", "All God's People",
      "Delilah", "Bijou", "It's a Beautiful Day", "Mother Love", "You Don't Fool Me", "My Life Has Been Saved",
    ],
    // Played from live albums (Live Killers, Live at Wembley '86, Live Magic, Queen Rock Montreal...).
    live: [
      "Now I'm Here", "Tie Your Mother Down", "Love of My Life", "Spread Your Wings",
      "Dragon Attack", "Brighton Rock", "Death on Two Legs", "Keep Yourself Alive",
      "'39", "Sheer Heart Attack", "Mustapha", "Get Down, Make Love",
      "Hammer to Fall", "Tear It Up", "Is This the World We Created...?", "In the Lap of the Gods... Revisited",
      "Liar", "Let Me Entertain You", "Somebody to Love", "Under Pressure",
      "Crazy Little Thing Called Love", "Bohemian Rhapsody", "Killer Queen", "Another One Bites the Dust",
      "Son and Daughter", "Ogre Battle", "Stone Cold Crazy", "Seven Seas of Rhye",
      "Bring Back That Leroy Brown", "We Will Rock You", "Fat Bottomed Girls", "I'm in Love with My Car",
    ],
  },
};
