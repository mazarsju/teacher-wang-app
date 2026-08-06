export type UserPlan = "free" | "pro";

export type AdminUser = {
  id: string;
  email: string;
  plan: UserPlan;
};
