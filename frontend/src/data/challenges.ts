import type { Challenge } from "../types/challenge";

export const RESTAURANT_CHALLENGE: Challenge = {
  id: "challenge-restaurant",
  title: "Waiter",
  description: "Talk with the waiter and order a meal",
  character: {
    id: "challenge-restaurant",
    name: "Waiter",
    chineseName: "服务员",
    description: "Talk with the waiter and order a meal",
    avatarVariant: "waiter",
  },
  tasks: [
    { id: "call-waiter", label: "Call the waiter" },
    { id: "ask-no-meat", label: "Ask if they have a dish without meat" },
    { id: "ask-bill", label: "Ask for the bill" },
    { id: "pay-bill", label: "Pay the bill" },
  ],
};

export const CHALLENGES: Challenge[] = [RESTAURANT_CHALLENGE];
