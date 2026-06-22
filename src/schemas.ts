import { z } from 'zod';

const phoneSchema = z.string().min(10, 'Phone number is required');

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code:  z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const registerSchema = z.object({
  name:  z.string().min(1, 'Name is required').max(100),
  phone: phoneSchema,
  type:  z.enum(['buyer', 'seller']),
  email: z.string().email('Must be a valid email').optional(),
});

export const registerVerifySchema = z.object({
  phone: phoneSchema,
  code:  z.string().length(6, 'OTP must be exactly 6 digits'),
});
