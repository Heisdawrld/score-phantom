import { z } from "zod";
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  username: z.string().nullable().optional(),
  status: z.string(),
  trial_ends_at: z.string().nullable().optional(),
  premium_expires_at: z.string().nullable().optional(),
  subscription_expires_at: z.string().nullable().optional(),
  subscription_code: z.string().nullable().optional(),
  has_access: z.boolean().optional(),
  access_status: z.string().optional(),
  email_verified: z.union([z.boolean(), z.number()]).optional(),
  own_referral_code: z.string().nullable().optional(),
});

const user = {
    id: 1,
    email: "test@test.com",
    status: "active",
    access_status: "trial",
    has_access: true,
    trial_active: true
};
const parsed = UserSchema.parse(user);
console.log(parsed);
