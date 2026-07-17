/**
 * The public surface of the auth feature.
 *
 * features/* may import each other only through this file (structure doc,
 * enforced by eslint-plugin-boundaries). What is exported here is a promise;
 * what is not is free to change.
 *
 * The validation primitives are shared because "what counts as an email
 * address" should not have two answers in one product.
 */

export {
  emailSchema,
  passwordSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "./schemas";

export { login, logout, requestPasswordReset, resetPassword } from "./actions";
