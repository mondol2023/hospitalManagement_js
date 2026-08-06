export { authApi } from './api/auth-api';
export {
  connectAuthBridge,
  selectIsAuthenticated,
  selectRole,
  selectUser,
  useAuthStore,
} from './model/auth-store';
export { readTokenExpiry, useProactiveRefresh } from './model/session';
export {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
} from './model/schemas';
export { useLogin, useLogout, useLogoutEverywhere, useRegister } from './model/use-auth';
export { Can, RedirectIfAuthenticated, RequireAuth, RequireRole, useCan } from './ui/guards';
export { LoginPage } from './ui/LoginPage';
export { RegisterPage } from './ui/RegisterPage';
