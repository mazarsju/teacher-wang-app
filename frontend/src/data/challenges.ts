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

export const SHOP_CHALLENGE: Challenge = {
  id: "challenge-shop",
  title: "Shop Assistant",
  description: "Buy a shirt and practice shopping vocabulary",
  character: {
    id: "challenge-shop",
    name: "Shop Assistant",
    chineseName: "售货员",
    description: "Buy a shirt and practice shopping vocabulary",
    avatarVariant: "shop-assistant",
  },
  tasks: [
    { id: "greet-assistant", label: "Greet the shop assistant" },
    { id: "ask-price", label: "Ask the price of a shirt" },
    { id: "ask-different-size", label: "Ask for a different size" },
    { id: "pay-item", label: "Pay for the item" },
  ],
};

export const CHALLENGES: Challenge[] = [RESTAURANT_CHALLENGE, SHOP_CHALLENGE];
