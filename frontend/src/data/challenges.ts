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

export const TAXI_CHALLENGE: Challenge = {
  id: "challenge-taxi",
  title: "Taxi Driver",
  description: "Take a taxi and tell the driver where to go",
  character: {
    id: "challenge-taxi",
    name: "Taxi Driver",
    chineseName: "出租车司机",
    description: "Take a taxi and tell the driver where to go",
    avatarVariant: "taxi-driver",
  },
  tasks: [
    { id: "hail-taxi", label: "Hail the taxi" },
    { id: "give-destination", label: "Tell the driver your destination" },
    { id: "ask-fare", label: "Ask how much the ride costs" },
    { id: "pay-fare", label: "Pay for the ride" },
  ],
};

export const HOTEL_CHALLENGE: Challenge = {
  id: "challenge-hotel",
  title: "Hotel Receptionist",
  description: "Check in at a hotel and ask about breakfast",
  character: {
    id: "challenge-hotel",
    name: "Hotel Receptionist",
    chineseName: "前台",
    description: "Check in at a hotel and ask about breakfast",
    avatarVariant: "hotel-receptionist",
  },
  tasks: [
    { id: "greet-receptionist", label: "Greet the receptionist" },
    { id: "check-in", label: "Check in to your room" },
    { id: "ask-breakfast", label: "Ask what time breakfast starts" },
    { id: "check-out", label: "Check out of the hotel" },
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

export const CHALLENGES: Challenge[] = [
  RESTAURANT_CHALLENGE,
  TAXI_CHALLENGE,
  HOTEL_CHALLENGE,
  SHOP_CHALLENGE,
];
