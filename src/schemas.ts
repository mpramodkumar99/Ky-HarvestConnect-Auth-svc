import { z } from 'zod';

const userTypeSchema = z.enum(['buyer', 'seller', 'agent']);

export const requestOtpSchema = z.object({
  phone:    z.string().min(10, 'Phone is required'),
  userType: userTypeSchema,
});

export const verifyOtpSchema = z.object({
  phone:    z.string().min(10),
  code:     z.string().length(6, 'OTP must be exactly 6 digits'),
  userType: userTypeSchema,
});

export const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
