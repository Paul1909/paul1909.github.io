// Song pools for the three levels. Titles must match Apple Music's titles
// (suffixes like "(Radio Edit)" or "- 2019 Remaster" are ignored when matching).
// Each game picks 10 songs from the chosen level; wrong answers come from the same level
// (on Hard, from Hard + Medium). Keep at least 14 songs per level.
const LEVELS = {
  easy: {
    name: 'Easy',
    answer: 'I sang along in the 90s',
    blurb: 'The big hits everyone knows',
    songs: [
      "I Want It That Way", "Everybody (Backstreet's Back)", "As Long As You Love Me", "Quit Playing Games (With My Heart)",
      "Larger Than Life", "Show Me the Meaning of Being Lonely", "Shape of My Heart", "The Call",
      "Drowning", "I'll Never Break Your Heart", "All I Have to Give", "The One",
      "Incomplete", "We've Got It Goin' On", "Get Down (You're the One for Me)", "Anywhere for You",
      "Inconsolable", "Don't Go Breaking My Heart", "Straight Through My Heart", "More Than That",
      "Everyone", "No Place",
    ],
  },
  medium: {
    name: 'Medium',
    answer: 'I had the posters on my wall',
    blurb: 'Lesser-known singles and album tracks',
    songs: [
      "Helpless When She Smiles", "Bigger", "In a World Like This", "Chances",
      "Just Want You to Know", "It's Gotta Be You", "I Need You Tonight", "Don't Want You Back",
      "Don't Wanna Lose You Now", "Back to Your Heart", "Spanish Eyes", "No One Else Comes Close",
      "The Perfect Fan", "That's the Way I Like It", "10,000 Promises", "Like a Child",
      "Hey, Mr. DJ (Keep Playin' This Song)", "Set Adrift on Memory Bliss", "Darlin'", "I Wanna Be with You",
      "Not for Me", "Yes I Will", "Time", "Get Another Boyfriend",
      "Shining Star", "Poster Girl", "Weird World", "Never Gone",
      "Nobody Else", "Breathe", "Show 'Em (What You're Made Of)", "Undone",
    ],
  },
  hard: {
    name: 'Hard',
    answer: "I'm the number one fan",
    blurb: 'Deep cuts from every album',
    songs: [
      "That's What She Said", "If You Want It to Be Good Girl (Get Yourself a Bad Boy)", "If I Don't Have You", "Boys Will Be Boys",
      "Let's Have a Party", "Roll with It", "Nobody but You", "I Promise You (With Everything I Am)",
      "The Answer to Our Life", "What Makes You Different (Makes You Beautiful)", "How Did I Fall in Love with You", "It's True",
      "Lose It All", "Climbing the Walls", "Siberia", "Safest Place to Hide",
      "Beautiful Woman", "Crawling Back to You", "Something That I Already Know", "Unmistakable",
      "Treat Me Right", "Everything but Mine", "One in a Million", "Panic",
      "Trouble Is", "You Can Let Go", "Unsuspecting Sun", "Love Will Keep You Up All Night",
      "Any Other Way", "Close My Eyes", "Bye Bye Love", "All of Your Life (You Need Love)",
      "PDA", "If I Knew Then", "Masquerade", "Shattered",
      "She's a Dream", "This Is Us", "Permanent Stain", "Madeleine",
      "Love Somebody", "Trust Me", "Try", "Soldier",
      "Feels Like Home", "One Phone Call", "Hot, Hot, Hot", "New Love",
      "Passionate", "Is It Just Me", "Chateau", "The Way It Was",
      "Just Like You Like It",
    ],
  },
};
