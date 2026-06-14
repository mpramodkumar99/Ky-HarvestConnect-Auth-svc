import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z.string().min(10, 'Phone is required'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  code:  z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
