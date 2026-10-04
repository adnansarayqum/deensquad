// The Deen Squad Football Academy player-parent contract, from the club's own document.
// Changing `id` (each new season) asks every family to agree again.

export const CONTRACT = {
  id: "player-parent-contract-2026-27",
  title: "Player-parent contract",
  season: "2026–27",
  intro:
    "This agreement is made between Deen Squad Football Academy, the player, and the parent or guardian. Its purpose is to set expectations, responsibilities and guidelines to ensure a positive, respectful and development-focused environment for all parties.",
  player: {
    heading: "Player responsibilities",
    points: [
      "Attend all scheduled training sessions, matches and events unless excused by the coach.",
      "Arrive on time and prepared, with proper kit and equipment.",
      "Show respect to coaches, teammates, referees and opponents at all times.",
      "Follow instructions and give my best effort on and off the field.",
      "Uphold Islamic values including honesty, humility and good character.",
      "Refrain from inappropriate behaviour including swearing, arguing or disrespect.",
      "Maintain a balance between football, school and family responsibilities.",
    ],
  },
  parent: {
    heading: "Parent or guardian responsibilities",
    points: [
      "Ensure my child attends training and matches on time.",
      "Encourage and support my child positively, without pressuring or criticising.",
      "Refrain from coaching from the sidelines or interfering with staff decisions.",
      "Communicate with academy staff respectfully regarding concerns or queries.",
      "Support the academy's values and rules, including Islamic manners and modesty.",
      "Respect all staff, players, referees and fellow parents.",
    ],
  },
  academy: {
    heading: "Academy responsibilities",
    points: [
      "Provide structured, safe and enjoyable training environments.",
      "Support each player's development technically, physically and morally.",
      "Promote Islamic values in all aspects of the academy's conduct.",
      "Maintain clear communication with parents and guardians.",
      "Treat all players and families fairly and respectfully.",
    ],
    signedBy: "Monju Ahmed",
  },
  validity: "This contract is valid for the current football season and may be renewed annually.",
} as const;
