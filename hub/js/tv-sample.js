// Sample TV content for demo mode (hub ?demo and board ?demo). Based on the old board's defaults.
import { keyOf, businessDate, SLIDES, monthKey } from "./tv-shared.js";

export function sampleTv() {
  const today = businessDate();
  const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return keyOf(d); };
  return {
    config: {
      screens: {
        "1": { name: "Bar TV", theme: "green", seconds: 12, slides: SLIDES.filter((s) => s.id !== "feud").map((s) => ({ id: s.id })) },
        "2": { name: "Lounge TV", theme: "orange", seconds: 10, slides: ["welcome", "happyhour", "tonight", "upnext", "calendar", "specials", "qr"].map((id) => ({ id })) },
      },
      perms: { crew: ["kavatender", "manager"], events: ["manager"], specials: ["manager"], ticker: ["manager"], community: ["manager"] },
    },
    crew: {
      roster: [
        { id: "josh", name: "Josh", photo: "/board/assets/crew/josh.jpg" },
        { id: "daniel", name: "Daniel", photo: "/board/assets/crew/daniel.jpg" },
        { id: "wheatyn", name: "Wheatyn", photo: "/board/assets/crew/wheatyn.jpg" },
      ],
      weekly: {
        0: { opener: "daniel", closer: "wheatyn" }, 1: { opener: "josh", closer: "daniel" }, 2: { opener: "wheatyn", closer: "josh" },
        3: { opener: "daniel", closer: "wheatyn" }, 4: { opener: "josh", closer: "daniel" }, 5: { opener: "wheatyn", closer: "josh" },
        6: { opener: "josh", closer: "wheatyn" },
      },
      days: {},
    },
    events: {
      items: [
        { id: "trivia", title: "Trivia Night", repeat: "weekly", weekday: 4, time: "8:00 PM", banner: "Every Thursday",
          host: "Christian", image: "/board/assets/christian.jpg", featured: true, themes: { [monthKey(today)]: "Trailer Trash Night" },
          themeNote: "The last Thursday each month is a **costume party** — dress the theme!", lastNote: "Tonight is the costume party — come dressed for the theme!" },
        { id: "bingo", title: "Bingo Night", repeat: "weekly", weekday: 5, time: "8:00 PM", banner: "Every Friday", details: "Cash prizes" },
        { id: "comedy", title: "Catch All Comedy", repeat: "monthly", weekday: 1, nth: -1, time: "8:00 PM", banner: "Last Monday Monthly", details: "Grab the mic — all welcome" },
        { id: "openmic", title: "Acoustic Open Mic", repeat: "once", date: inDays(0), time: "8:00 PM", banner: "Live Music", details: "Acoustic jam sesh" },
        { id: "masq", title: "Crimson Masquerade", repeat: "once", date: inDays(3), time: "8:00 PM", banner: "Costume Party", details: "Victorian gothic vampire masquerade murder mystery" },
        { id: "food", title: "Food Truck Saturday", repeat: "once", date: inDays(5), time: "6:00 PM", banner: "Food Truck", details: "Tacos in the lot all evening" },
      ],
    },
    happyhour: undefined,
    welcome: undefined,
    specials: { items: [
      { name: "Mango Tango", desc: "Kava, mango and a squeeze of lime" },
      { name: "Cocoa Kava", desc: "Rich chocolate shell — dessert in a cup" },
      { name: "Island Punch", desc: "Pineapple, passionfruit and a kick of ginger" },
    ] },
    signature: { items: [
      { drink: "The Wheatyn Special", staff: "Wheatyn", desc: "Coconut cream, cinnamon, double shell" },
      { drink: "Daniel's Sunrise", staff: "Daniel", desc: "Orange, grenadine, kratom tea" },
    ] },
    products: { items: [
      { name: "Kava", blurb: "A root from the South Pacific, traditionally shared in a coconut shell. Relaxing, social, alcohol-free." },
      { name: "Kratom", blurb: "A leaf from Southeast Asia brewed as a tea. Ask your kavatender about strengths and flavors." },
    ] },
    community: { photos: ["/board/assets/crew/josh.jpg", "/board/assets/crew/daniel.jpg", "/board/assets/crew/wheatyn.jpg", "/board/assets/christian.jpg", "/board/assets/drinks/welcome.jpg", "/board/assets/drinks/upnext.jpg"], footer: "Send your photos to **Christian@kavaandcompany.com**" },
    ticker: { items: [
      "Happy Hour **10–11 AM · 2–4 PM · 9–10 PM**",
      "Ask your kavatender for your **perfect pour**",
      "New to kava? **We'll walk you through it**",
      "Follow us **@kavaandco.mandarin**",
    ] },
    qr: undefined,
  };
}
