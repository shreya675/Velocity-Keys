export const sections = {
  practice: { title: "Practice", description: "A little practice, at your own pace." },
  race: { title: "Race", description: "Find your next race or invite a friend." },
  daily: { title: "Daily challenge", description: "One shared challenge. A fresh start every day." },
  friends: { title: "Friends", description: "Your people, your next race." },
  leaderboard: { title: "Leaderboard", description: "See who is setting the pace." },
  history: { title: "Typing history", description: "Your recent sessions and progress over time." },
  profile: { title: "Profile", description: "Stats, milestones, and your typing journey." },
  settings: { title: "Settings", description: "Make Velocity Keys feel right for you." },
  help: { title: "Help & shortcuts", description: "Everything you need to get started." }
} as const;

export type ActiveView = keyof typeof sections;
export function isSection(value: string): value is ActiveView {
  return Object.prototype.hasOwnProperty.call(sections, value);
}
